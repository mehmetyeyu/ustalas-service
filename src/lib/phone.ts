// Türkiye telefon numaralarını doğrulayıp tutarlı, okunabilir bir biçime
// ("0555 123 45 67") normalize eder. iyzico'ya giderken E.164'e çevrilen
// normalizeGsmNumber (bkz. src/lib/iyzico.ts) temiz, 10 haneli bir ulusal
// numaraya güveniyor — kayıt/ayarlar formlarındaki serbest metin girişi
// (boşluk/parantez/tire karışık, hatalı hane sayısı vb.) doğrudan iyzico'ya
// gidince "Geçersiz telefon numarası" ile reddedildi (gerçek bir sandbox
// denemesinde saptandı). Bu fonksiyon o sorunu kaynağında (form girişinde)
// önler — mobil/sabit hat ayrımı yapmaz, sadece geçerli 10 haneli bir
// ulusal numaraya indirgenip indirgenemediğine bakar.
export function normalizeTurkishPhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  let national: string;
  if (digits.length === 12 && digits.startsWith("90")) national = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) national = digits.slice(1);
  else if (digits.length === 10) national = digits;
  else return null;
  if (!/^[1-9]\d{9}$/.test(national)) return null;
  return `0${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6, 8)} ${national.slice(8, 10)}`;
}
