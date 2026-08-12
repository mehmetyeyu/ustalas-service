// Genel/evrensel ödeme tipleri — her lastikçi firmasında bulunur, bu yüzden
// Genel Ayarlar'daki ödeme şekilleri listesinden kaldırılamaz. Firmaya özel
// isimli hesaplar (ör. "Garanti Hesap") ayarlardan serbestçe eklenip
// kaldırılabilir. Client ve server'da ortak kullanım için pool/db importu
// olmayan ayrı bir dosyada (bkz. src/lib/settings.ts server-only).
export const PROTECTED_PAYMENT_TYPES = ["Nakit", "POS", "Cari", "Mail Order"];
