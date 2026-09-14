import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { verifyWebhookSignature } from "@/lib/iyzico";

// iyzico Abonelik yaşam döngüsü bildirimleri (yenileme başarılı/başarısız,
// bkz. plan) — X-IYZ-SIGNATURE-V3 imza doğrulaması iyzico hesabında
// entegrasyon ekibi (entegrasyon@iyzico.com) TARAFINDAN AÇILANA kadar
// varsayılan olarak gelmiyor. IYZICO_WEBHOOK_SIGNATURE_ENABLED=true
// olmadan bu route HİÇBİR state değişikliği yapmaz — sahte bir "ödeme
// başarılı" isteğiyle bir firmanın kilidini açtırmak mümkün olmasın diye.
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { iyziEventType, subscriptionReferenceCode, orderReferenceCode, customerReferenceCode } = body;

  if (process.env.IYZICO_WEBHOOK_SIGNATURE_ENABLED !== "true") {
    console.warn("iyzico webhook alındı ama imza doğrulaması henüz açık değil — DB'ye dokunulmadı.", { iyziEventType, subscriptionReferenceCode });
    return NextResponse.json({ received: true, verified: false });
  }

  const signatureHeader = request.headers.get("x-iyz-signature-v3");
  const merchantId = process.env.IYZICO_MERCHANT_ID;
  if (!signatureHeader || !merchantId) {
    return NextResponse.json({ error: "İmza doğrulanamadı." }, { status: 401 });
  }

  const valid = verifyWebhookSignature({
    signatureHeader,
    merchantId,
    eventType: iyziEventType,
    subscriptionReferenceCode,
    orderReferenceCode,
    customerReferenceCode,
  });
  if (!valid) {
    console.error("iyzico webhook — GEÇERSİZ imza, yoksayıldı.", { iyziEventType, subscriptionReferenceCode });
    return NextResponse.json({ error: "Geçersiz imza." }, { status: 401 });
  }

  if (iyziEventType === "subscription.order.success") {
    // Her başarılı tahsilat (ilk ödeme ya da yenileme fark etmeksizin)
    // ödenmiş dönemi bir sonraki periyoda uzatır — bkz. src/lib/billing.ts
    // isBillingLocked. billing_cancel_at_period_end=true olan bir
    // abonelikte (iyzico'da zaten iptal edilmiş, bir daha tahsilat
    // olmamalı) bu event gelirse dönemi UZATMIYORUZ — aksi halde iptal
    // edilmiş bir abonelik yanlışlıkla yeniden kilitsiz kalabilir.
    const tenantResult = await pool.query<{ plan: string | null; billing_cancel_at_period_end: boolean }>(
      "SELECT plan, billing_cancel_at_period_end FROM tenants WHERE billing_subscription_ref = $1",
      [subscriptionReferenceCode]
    );
    const tenant = tenantResult.rows[0];
    if (tenant && !tenant.billing_cancel_at_period_end) {
      const now = new Date();
      const periodEndsAt = tenant.plan === "yearly"
        ? new Date(now.setFullYear(now.getFullYear() + 1))
        : new Date(now.setMonth(now.getMonth() + 1));
      await pool.query(
        "UPDATE tenants SET billing_status = 'active', billing_period_ends_at = $1 WHERE billing_subscription_ref = $2",
        [periodEndsAt, subscriptionReferenceCode]
      );
    }
  } else if (iyziEventType === "subscription.order.failure") {
    // V1'de otomatik yeniden deneme (dunning) yok — başarısız ödeme
    // doğrudan kilitler, firma /admin/billing'den yeniden abone olur
    // (bkz. plan, "V1 kapsam dışı").
    await pool.query(
      "UPDATE tenants SET billing_status = 'past_due' WHERE billing_subscription_ref = $1",
      [subscriptionReferenceCode]
    );
  }

  return NextResponse.json({ received: true, verified: true });
}
