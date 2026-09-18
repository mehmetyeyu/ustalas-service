import { NextRequest, NextResponse } from "next/server";
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
}

// Tenant'ın TÜM ödeme geçmişi — iyzico'nun Raporlama Servisi'nden
// (bkz. src/lib/iyzico.ts getPaymentDetailsByConversationId notu)
// conversationId = tenant id ile sorgulanıyor. Bu, /v2/subscription/*
// uçlarının customerReferenceCode'a bağımlı olmasından kaynaklanan eski
// sınırlamayı (tenant zaman içinde farklı customerReferenceCode'lara sahip
// olabiliyor, bkz. git geçmişi) ortadan kaldırıyor — conversationId her
// checkout/switch-plan'da AYNI (tenant id) gönderiliyor, hiç değişmiyor.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user || user.role !== "super_admin") return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  const { id } = await params;
  const tenantId = Number(id);
  if (!Number.isInteger(tenantId)) return NextResponse.json({ error: "Geçersiz firma." }, { status: 400 });

  try {
    const details = await getPaymentDetailsByConversationId(String(tenantId));

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
    }));
    payments.sort((a, b) => (b.date ?? 0) - (a.date ?? 0));

    return NextResponse.json({ payments });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Ödeme geçmişi alınamadı." }, { status: 500 });
  }
}
