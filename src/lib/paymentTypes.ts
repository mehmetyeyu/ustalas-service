// Genel/evrensel ödeme tipleri — her lastikçi firmasında bulunur, bu yüzden
// Genel Ayarlar'daki ödeme şekilleri listesinden kaldırılamaz. Firmaya özel
// isimli hesaplar (ör. "Garanti Hesap") ayarlardan serbestçe eklenip
// kaldırılabilir. Client ve server'da ortak kullanım için pool/db importu
// olmayan ayrı bir dosyada (bkz. src/lib/settings.ts server-only).
export const PROTECTED_PAYMENT_TYPES = ["Nakit", "POS", "Cari", "Mail Order"];

// "Mail Order" tek başına geçersizdir — bir tedarikçiyle birleşip
// "<Tedarikçi> Mail Order" olmalıdır (bkz. admin/orders/[id]/page.tsx).
// Sipariş kapatma (PATCH), düzenleme (PUT) ve toplu ödeme şekli değiştirme
// (bulk-payment-type) aynı kuralı kullanır. flatOptions Genel Ayarlar'daki
// ödeme şekilleri listesidir ("Mail Order" hariç).
const MAIL_ORDER_SUFFIX = " Mail Order";
export function isValidPaymentType(v: string, flatOptions: string[]): boolean {
  if (flatOptions.includes(v)) return true;
  return v.endsWith(MAIL_ORDER_SUFFIX) && v.length > MAIL_ORDER_SUFFIX.length;
}

// Genel Ayarlar'daki ödeme şekilleri listesi, satır bazlı "Mail Order"
// (bare, tedarikçisiz) hariç — bu, isValidPaymentType'ın ikinci parametresi
// olarak PATCH/PUT/bulk-payment-type'ın üçü tarafından da kullanılır.
export function flatPaymentOptions(paymentTypes: string[]): string[] {
  return paymentTypes.filter((t) => t !== "Mail Order");
}
