import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { getPaymentDetailsByConversationId } from "@/lib/iyzico";

export interface PaymentHistoryRow {
  date: number | null;
  amount: number | null;
  currencyCode: string | null;
  status: string | null;
  paymentId: string;
  refundStatus: string | null;
  merchantPayoutAmount: number | null;
  // iyzico'nun otomatik dolandırıcılık taraması sonucu (bkz. iyzico-fraud/
  // [secret]/route.ts REJECTED_STATUSES notu — aynı sayısal değerler):
  // -3/-2/-1 reddedildi (IFN ile zaten kilitleniyor), 0 inceleniyor,
  // 1 temiz (normal, en sık görülen), 2 incelendi/kabul edildi. Sadece 1
  // dışındaki değerler frontend'de ayrıca vurgulanıyor.
  fraudStatus: number | null;
  // Para banka hesabımıza HEMEN geçmiyor — iyzico (çoğu ödeme kuruluşu
  // gibi) belirli bir süre (gerçek veride ~8 gün) "blokajda" tutuyor.
  // Bu tarihten önce ödeme "Başarılı" görünse de para henüz hesaba
  // geçmemiş demektir — sadece per-tenant modalında var (Raporlama
  // Servisi'nin gün-bazlı /transactions ucu bu alanı DÖNDÜRMÜYOR, sadece
  // /details döndürüyor — bu yüzden üstteki "Bu Ay Gerçek Net Gelir"
  // özeti bunu ayıramıyor, bkz. /api/super-admin/revenue).
  blockageResolvedDate: number | null;
  // iyzico'nun kestiği toplam komisyon (bkz. src/lib/iyzico.ts
  // PaymentDetailItem notu) — amount - commission = merchantPayoutAmount.
  commission: number | null;
}

// Tenant'ın TÜM ödeme geçmişi — iyzico'nun Raporlama Servisi'nden
// (bkz. src/lib/iyzico.ts getPaymentDetailsByConversationId notu)
// conversationId = firma kodu ile sorgulanıyor. Bu, /v2/subscription/*
// uçlarının customerReferenceCode'a bağımlı olmasından kaynaklanan eski
// sınırlamayı (tenant zaman içinde farklı customerReferenceCode'lara sahip
// olabiliyor, bkz. git geçmişi) ortadan kaldırıyor — conversationId her
// checkout/switch-plan'da AYNI (firma kodu) gönderiliyor, hiç değişmiyor.
// Firma kodu kullanılması bilinçli bir tercih: iyzico panelinde işlem
// listesini gözden geçiren süper admin conversationId sütununda doğrudan
// tanıdığı firma kodunu görsün diye — eskiden tenant id (anlamsız bir
// sayı) gönderiliyordu. GERİYE DÖNÜK UYUMLULUK: bu değişiklikten ÖNCE
// yapılmış ödemeler iyzico'da hâlâ ESKİ conversationId (tenant id) ile
// kayıtlı — gerçek bir ödemede saptandı (Soyka/995987, bkz. plan). Bu
// yüzden HER İKİ conversationId de sorgulanıp sonuçlar birleştiriliyor;
// aksi halde o değişiklikten önceki gerçek ödemeler "yok" gibi görünürdü.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user || user.role !== "super_admin") return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  const { id } = await params;
  const tenantId = Number(id);
  if (!Number.isInteger(tenantId)) return NextResponse.json({ error: "Geçersiz firma." }, { status: 400 });

  try {
    const tenantResult = await pool.query<{ code: string }>("SELECT code FROM tenants WHERE id = $1", [tenantId]);
    const code = tenantResult.rows[0]?.code;
    if (!code) return NextResponse.json({ error: "Firma bulunamadı." }, { status: 404 });

    const [byCode, byOldTenantId] = await Promise.all([
      getPaymentDetailsByConversationId(code),
      getPaymentDetailsByConversationId(String(tenantId)),
    ]);
    // paymentId'ye göre benzersizleştirilir — normalde iki sorgu asla aynı
    // ödemeyi döndürmez (bir ödemenin gerçek conversationId'si ikisinden
    // sadece biri olabilir), ama garantiye almak için Map kullanılıyor.
    const details = [...new Map([...byCode, ...byOldTenantId].map((p) => [p.paymentId, p])).values()];

    const payments: PaymentHistoryRow[] = details.map((p) => ({
      date: p.createdDate ? new Date(p.createdDate).getTime() : null,
      amount: p.price ?? null,
      currencyCode: p.currency ?? null,
      // paymentStatus'un tam değer haritası dokümante edilmemiş — gerçek
      // başarılı ödemelerde gözlemlenen tek değer 1. Tanınmayan bir değer
      // gelirse ham sayı olarak gösterilir (bkz. frontend PAYMENT_STATUS_LABELS).
      status: p.paymentStatus === 1 ? "SUCCESS" : String(p.paymentStatus),
      paymentId: String(p.paymentId),
      refundStatus: p.paymentRefundStatus && p.paymentRefundStatus !== "NOT_REFUNDED" ? p.paymentRefundStatus : null,
      merchantPayoutAmount: p.itemTransactions?.[0]?.merchantPayoutAmount ?? null,
      fraudStatus: p.fraudStatus ?? null,
      blockageResolvedDate: p.itemTransactions?.[0]?.blockageResolvedDate
        ? new Date(p.itemTransactions[0].blockageResolvedDate).getTime()
        : null,
      commission: p.iyziCommissionRateAmount != null || p.iyziCommissionFee != null
        ? (p.iyziCommissionRateAmount ?? 0) + (p.iyziCommissionFee ?? 0)
        : null,
    }));
    payments.sort((a, b) => (b.date ?? 0) - (a.date ?? 0));

    return NextResponse.json({ payments });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Ödeme geçmişi alınamadı." }, { status: 500 });
  }
}
