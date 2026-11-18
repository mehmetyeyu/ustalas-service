// Cari siparişin FIFO durumunu (bkz. computeOrderLedgerStatus,
// src/lib/customerLedger.ts) okuyan saf kurallar — sunucu (liste/filtre,
// Excel, toplu araç, detay, araç geçmişi) ve istemci (Sipariş Listesi
// hücresi, toplu seçim) aynı eşik ve etiketleri buradan kullanır.
import { formatCurrency } from "@/lib/format";

// remainingAmount: bu siparişin borcundan hâlâ karşılanmamış kısım (0 =
// tamamen ödendi, originalAmount ile aynıysa hiç dokunulmamış, arası bir
// değerse KISMEN ödenmiş — bkz. Sipariş listesindeki "Cari (₺X kaldı)"
// rozeti, business kararıyla eklendi). paidVia: bu siparişin borcuna
// katkıda bulunan ödeme(ler)in yöntemi — tek bir yöntemse o yöntem, birden
// fazla FARKLI yöntem karıştıysa "Karışık" (business kararı).
export interface OrderLedgerStatus {
  originalAmount: number;
  remainingAmount: number;
  paidVia: string | null;
}

const EPS = 0.009;

// Borcu ödeme kaydında yöntemi olmadan kapanmış cari sipariş (nadir).
export const CARI_SETTLED_LABEL = "Cari (Ödendi)";

export function isCariSettled(status: OrderLedgerStatus | undefined): boolean {
  return !!status && status.remainingAmount <= EPS;
}

// Borcuna en az bir tahsilat düşmüş (kısmen ya da tamamen ödenmiş). Toplu
// Ödeme Şekli aracı bunları almaz, Düzelt ekranı uyarır: tip değişirse borç
// satırı silinir ama tahsilat kalır, FIFO onu sonraki cari siparişe düşer.
export function isCariPaidIn(status: OrderLedgerStatus | undefined): boolean {
  return !!status && status.remainingAmount < status.originalAmount - EPS;
}

// Kısmen ödenmiş (bir kısmı düşmüş, tamamı değil) — hücrede "Cari (₺X kaldı)".
export function isCariPartial(status: OrderLedgerStatus | undefined): boolean {
  return isCariPaidIn(status) && !isCariSettled(status);
}

// Kullanıcı kararı 2026-11-18: cari açılıp borcu TAMAMEN kapanmış bir
// siparişin ödeme şekli, borcu kapatan yöntemdir (tek yöntemse o, birden
// çok yöntemse "Karışık"). Açık ya da kısmen ödenmiş cari "Cari" kalır.
// Sipariş listesi hücresi, Ödeme Şekli filtresi ve Excel aynı kuralı kullanır.
export function effectivePaymentType(paymentType: string | null, status: OrderLedgerStatus | undefined): string | null {
  if (paymentType !== "Cari" || !status || !isCariSettled(status)) return paymentType;
  return status.paidVia ?? CARI_SETTLED_LABEL;
}

// Satış anındaki "Cari" bilgisini koruyarak cari durumunu anlatan ek
// (kullanıcı kararı 2026-11-18): sipariş detayı ve araç geçmişi
// "Cari · Nazım Hesap ile kapandı" / "Cari · ₺250 kaldı" gösterir. Hiç
// dokunulmamış açık cari için null (yalnızca "Cari" yazar).
export function cariStatusNote(status: OrderLedgerStatus | undefined): string | null {
  if (!status) return null;
  if (isCariSettled(status)) {
    if (status.paidVia === "Karışık") return "birden çok yöntemle kapandı";
    return status.paidVia ? `${status.paidVia} ile kapandı` : "ödendi";
  }
  if (isCariPartial(status)) return `${formatCurrency(status.remainingAmount)} kaldı`;
  return null;
}
