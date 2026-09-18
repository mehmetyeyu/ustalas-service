import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { listSubscriptions } from "@/lib/iyzico";

export interface PaymentHistoryRow {
  date: number | null;
  amount: number | null;
  currencyCode: string | null;
  status: string | null;
  errorMessage: string | null;
  planName: string | null;
  paymentId: string | null;
  subscriptionRef: string;
}

// Tenant'ın TÜM ödeme geçmişi — iyzico_payments (bkz. database/schema.sql)
// sadece IFN eşlemesi için paymentId tutuyor, tarih/tutar/durum içermiyor.
// Bir tenant zaman içinde BİRDEN FAZLA subscriptionReferenceCode'a sahip
// olabilir (her /upgrade veya iptal+yeniden abone olma yeni bir referans
// üretiyor, bkz. src/lib/iyzico.ts upgradeSubscription notu) — bu yüzden
// tek bir referansı GET etmek yetmiyor, listSubscriptions() ile TÜM
// abonelikler çekilip customerReferenceCode'a göre süzülüyor.
//
// BİLİNEN SINIRLAMA: initializeCheckoutForm HER çağrıldığında iyzico'da
// aynı müşteri bilgisiyle bile YENİ bir customerReferenceCode oluşturuyor
// (tekilleştirme yok, gerçek bir denemede doğrulandı) — biz DB'de sadece
// EN GÜNCEL customerReferenceCode'u tutuyoruz (tenants.billing_customer_id).
// Yani bir tenant iptal edip yeniden abone olduysa (past_due sonrası, bkz.
// /api/billing/checkout), ESKİ customerReferenceCode'a bağlı geçmiş ödemeler
// bu listede GÖRÜNMEZ — sadece mevcut müşteri döngüsündeki geçmiş görünür.
// Bilinçli olarak düzeltilmedi (kullanıcı kararı): tüm geçmiş
// customerReferenceCode'ları ayrıca takip etmek yeni bir tablo + her
// checkout/callback'te ek yazma gerektirir, nadir bir senaryo için orantısız.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user || user.role !== "super_admin") return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  const { id } = await params;
  const tenantId = Number(id);
  if (!Number.isInteger(tenantId)) return NextResponse.json({ error: "Geçersiz firma." }, { status: 400 });

  const tenantResult = await pool.query<{ billing_customer_id: string | null }>(
    "SELECT billing_customer_id FROM tenants WHERE id = $1",
    [tenantId]
  );
  const customerRef = tenantResult.rows[0]?.billing_customer_id;
  if (!customerRef) return NextResponse.json({ payments: [] as PaymentHistoryRow[] });

  try {
    const search = await listSubscriptions();
    const matching = search.items.filter((s) => s.customerReferenceCode === customerRef);

    const payments: PaymentHistoryRow[] = [];
    for (const sub of matching) {
      for (const order of sub.orders ?? []) {
        // WAITING: henüz denenmemiş (gelecekteki) sipariş — GEÇMİŞ bir
        // tahsilat değil, listeye dahil edilmiyor.
        for (const attempt of order.paymentAttempts ?? []) {
          payments.push({
            date: attempt.createdDate ?? order.startPeriod ?? null,
            amount: order.price ?? null,
            currencyCode: order.currencyCode ?? null,
            status: attempt.paymentStatus ?? order.orderStatus ?? null,
            errorMessage: attempt.errorMessage ?? null,
            planName: sub.pricingPlanName ?? null,
            paymentId: attempt.paymentId != null ? String(attempt.paymentId) : null,
            subscriptionRef: sub.referenceCode,
          });
        }
      }
    }
    payments.sort((a, b) => (b.date ?? 0) - (a.date ?? 0));

    return NextResponse.json({ payments });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Ödeme geçmişi alınamadı." }, { status: 500 });
  }
}
