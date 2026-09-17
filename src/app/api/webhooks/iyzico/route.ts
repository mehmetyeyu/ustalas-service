import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getSubscription, verifyWebhookSignature } from "@/lib/iyzico";

interface SubscriptionOrder {
  referenceCode: string;
  paymentAttempts?: Array<{ errorCode?: string; errorMessage?: string }>;
}

// GET /v2/subscription/subscriptions/{ref} yanıtındaki ilgili order'ın
// paymentAttempts'inde FAILED denemeler için errorCode/errorMessage AYRICA
// mevcut — webhook'un kendisi bunu hiç içermiyor (bkz. database/schema.sql
// notu). En son (son elemandaki) errorMessage alınır; hiçbiri yoksa (ör.
// yanıt şekli beklenenden farklıysa) generic bir mesaja düşülür — bu ek
// sorgu tamamen "daha iyi mesaj" amaçlı, ana kilitleme akışını bloklamamalı.
async function fetchFailureReason(subscriptionReferenceCode: string, orderReferenceCode: string | undefined): Promise<string> {
  const fallback = "Ödeme alınamadı.";
  try {
    const sub = await getSubscription(subscriptionReferenceCode) as { orders?: SubscriptionOrder[] };
    const order = sub.orders?.find((o) => o.referenceCode === orderReferenceCode) ?? sub.orders?.[sub.orders.length - 1];
    const lastAttempt = order?.paymentAttempts?.[order.paymentAttempts.length - 1];
    return lastAttempt?.errorMessage || fallback;
  } catch (error) {
    console.error("iyzico webhook — başarısızlık sebebi çekilemedi:", error);
    return fallback;
  }
}

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

  // Webhook sağlayıcıları (iyzico dahil) aynı olayı zaman aşımı/ağ
  // hatasında birden fazla kez tekrar gönderebilir — order_reference_code
  // PRIMARY KEY'e INSERT ile tekilleştirilir, ikinci teslimat sessizce
  // atlanır (aksi halde dönem sonu her tekrarda bir tur daha uzardı).
  if (orderReferenceCode) {
    const dedupe = await pool.query(
      "INSERT INTO iyzico_webhook_events (order_reference_code, event_type) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [orderReferenceCode, iyziEventType]
    );
    if (dedupe.rowCount === 0) {
      console.warn("iyzico webhook — bu orderReferenceCode zaten işlenmiş, tekrar atlandı.", { iyziEventType, orderReferenceCode });
      return NextResponse.json({ received: true, verified: true, duplicate: true });
    }
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
    if (!tenant) {
      // billing_subscription_ref eşleşmedi — beklenmedik bir durum (yanlış/
      // güncel olmayan referans, bkz. src/lib/iyzico.ts upgradeSubscription
      // notu: /upgrade her seferinde YENİ bir referans üretiyor, tenants
      // satırı senkron tutulmazsa gelecekteki webhook'lar burada sessizce
      // kaybolur). Proaktif müşteri bildirimi henüz yok (bkz. plan) — bu
      // yüzden en azından bunun loglanması, izlenebilirlik için önemli.
      console.warn("iyzico webhook — subscriptionReferenceCode için eşleşen tenant bulunamadı:", { iyziEventType, subscriptionReferenceCode });
    } else if (!tenant.billing_cancel_at_period_end) {
      const now = new Date();
      const periodEndsAt = tenant.plan === "yearly"
        ? new Date(now.setFullYear(now.getFullYear() + 1))
        : new Date(now.setMonth(now.getMonth() + 1));
      // billing_last_payment_error temizlenir — önceki bir başarısız
      // denemeden kalma mesaj varsa (ör. kart güncellenip yeniden denenmiş
      // olabilir), artık geçerli değil.
      await pool.query(
        "UPDATE tenants SET billing_status = 'active', billing_period_ends_at = $1, billing_last_payment_error = NULL WHERE billing_subscription_ref = $2",
        [periodEndsAt, subscriptionReferenceCode]
      );
    }
  } else if (iyziEventType === "subscription.order.failure") {
    // V1'de otomatik yeniden deneme (dunning) yok — başarısız ödeme
    // doğrudan kilitler, firma /admin/billing'den yeniden abone olur
    // (bkz. plan, "V1 kapsam dışı"). Webhook'un kendisi başarısızlık
    // sebebini içermiyor — fetchFailureReason ile AYRI bir GET çağrısıyla
    // çekiliyor (bkz. yukarısı, database/schema.sql notu).
    const reason = await fetchFailureReason(subscriptionReferenceCode, orderReferenceCode);
    console.warn("iyzico webhook — abonelik ödemesi başarısız, tenant kilitleniyor:", { subscriptionReferenceCode, orderReferenceCode, reason });
    const result = await pool.query(
      "UPDATE tenants SET billing_status = 'past_due', billing_last_payment_error = $1 WHERE billing_subscription_ref = $2",
      [reason, subscriptionReferenceCode]
    );
    if (result.rowCount === 0) {
      console.warn("iyzico webhook — subscriptionReferenceCode için eşleşen tenant bulunamadı:", { iyziEventType, subscriptionReferenceCode });
    }
  }

  return NextResponse.json({ received: true, verified: true });
}
