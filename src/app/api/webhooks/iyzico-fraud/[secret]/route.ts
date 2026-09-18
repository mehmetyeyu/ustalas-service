import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { cancelSubscription } from "@/lib/iyzico";
import { logBillingEvent } from "@/lib/billingEvents";

// iyzico IFN (Instant Fraud Notification) — entegrasyon@iyzico.com ile
// yazışmada doğrulandı: bu mekanizmanın Abonelik/Checkout Form dahil TÜM
// ürünleri kapsadığı, kaydın da sadece "bu URL'i Merchant Panel'e gir"
// şeklinde yapıldığı teyit edildi. Payload SADECE {paymentId, fraudStatus}
// — X-IYZ-SIGNATURE-V3 gibi ayrı bir imza mekanizması dokümante edilmemiş
// (iyzico'nun kendi örneğinde de yok). Bu yüzden URL'in KENDİSİ gizli
// tutuluyor ([secret] segmenti, IYZICO_IFN_WEBHOOK_SECRET ile karşılaştırılır)
// — bu URL sadece iyzico'nun panelinde tanımlanır, hiçbir yerde public
// olarak paylaşılmaz.
//
// fraudStatus değerleri (iyzico'nun e-postasından, dokümante edilmemiş):
// -3 REJECTED_AFTER_ACCEPTED, -2 REJECTED_AFTER_REVIEW, -1 REJECTED_BY_FRAUD,
//  0 WAITING_FOR_FRAUD_CHECK, 1 FRAUD_CHECK_OK, 2 ACCEPTED_AFTER_REVIEW.
// Sadece REJECTED_* (negatif) değerler işlem gerektirir — ödeme iyzico
// tarafından dolandırıcılık nedeniyle iade edilmiş demektir, tenant
// kilitlenmeli. Diğerleri (0/1/2) sadece bilgilendirme, DB'ye dokunmaz.
const REJECTED_STATUSES = new Set([-1, -2, -3]);

export async function POST(request: NextRequest, { params }: { params: Promise<{ secret: string }> }) {
  const { secret } = await params;
  if (!process.env.IYZICO_IFN_WEBHOOK_SECRET || secret !== process.env.IYZICO_IFN_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const paymentId = body?.paymentId != null ? String(body.paymentId) : null;
  const fraudStatus = typeof body?.fraudStatus === "number" ? body.fraudStatus : null;
  if (!paymentId || fraudStatus === null) {
    return NextResponse.json({ error: "Geçersiz payload." }, { status: 400 });
  }

  console.warn("iyzico IFN bildirimi alındı:", { paymentId, fraudStatus });

  if (!REJECTED_STATUSES.has(fraudStatus)) {
    return NextResponse.json({ received: true });
  }

  // paymentId → tenant eşlemesi KENDİ tablomuzdan (bkz. database/schema.sql
  // iyzico_payments notu) — /payment/detail bunu iyzico'dan geri vermiyor.
  const mapping = await pool.query<{ tenant_id: number }>(
    "SELECT tenant_id FROM iyzico_payments WHERE payment_id = $1",
    [paymentId]
  );
  const tenantId = mapping.rows[0]?.tenant_id;
  if (!tenantId) {
    console.error("iyzico IFN — paymentId için eşleşen tenant bulunamadı, elle inceleme gerekebilir:", { paymentId, fraudStatus });
    await logBillingEvent(null, "ifn_tenant_not_found", `paymentId=${paymentId}, fraudStatus=${fraudStatus}`);
    return NextResponse.json({ received: true, matched: false });
  }

  // Reddedilen ödeme iade edildi — tenant'ı hemen kilitle (past_due, mevcut
  // kilitleme mekanizmasıyla aynı, bkz. src/lib/billing.ts). Ayrıca
  // aboneliği de iptal etmeye çalış (best-effort): iyzico'nun bu reddi
  // aboneliğin kendisini otomatik iptal edip etmediği dokümante edilmemiş
  // — etmiyorsa aynı (artık dolandırıcılık şüpheli) kart bir sonraki
  // dönemde tekrar denenmeye devam ederdi.
  const tenantRow = await pool.query<{ billing_subscription_ref: string | null }>(
    "SELECT billing_subscription_ref FROM tenants WHERE id = $1",
    [tenantId]
  );
  await pool.query(
    "UPDATE tenants SET billing_status = 'past_due', billing_last_payment_error = 'Ödemeniz iyzico tarafından dolandırıcılık incelemesi sonucunda iptal edildi.' WHERE id = $1",
    [tenantId]
  );
  const subscriptionRef = tenantRow.rows[0]?.billing_subscription_ref;
  if (subscriptionRef) {
    try {
      await cancelSubscription(subscriptionRef);
    } catch (cancelError) {
      console.error("iyzico IFN — abonelik iptal edilemedi, yine de tenant kilitlendi:", { tenantId, subscriptionRef, cancelError });
    }
  }

  console.warn("iyzico IFN — dolandırıcılık nedeniyle tenant kilitlendi:", { tenantId, paymentId, fraudStatus });
  await logBillingEvent(tenantId, "ifn_rejected", `paymentId=${paymentId}, fraudStatus=${fraudStatus}`);
  return NextResponse.json({ received: true, matched: true });
}
