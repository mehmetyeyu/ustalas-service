// Üretim Haftası/Yılı (DOT kodu) — Ürünler, Depolama ve Siparişler'de ortak
// kullanılan tek bir "10/26" kutusuna yazma/okuma deseni. Yıl normalizeYear
// (bkz. @/lib/productsExcel — 2 haneli "26" sunucuda 2026'ya çevrilir) ile
// zaten uyumlu, burada ekstra bir dönüşüm gerekmiyor.

export function parseWeekYearInput(raw: string): { week: string; year: string } {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  return { week: digits.slice(0, 2), year: digits.slice(2, 4) };
}

export function formatWeekYearInput(week: string, year: string): string {
  if (!week && !year) return "";
  if (!year) return week;
  return `${week}/${year}`;
}

// Tek bir alan boşken bile ("Üretim Haftası" girilmiş ama "Yılı" henüz
// girilmemiş gibi) okunaklı kalsın diye kısmi null durumları da ele alınır.
export function weekYearLabel(week: number | null, year: number | null): string {
  if (week == null && year == null) return "—";
  if (week == null) return `—/${String(year).slice(-2)}`;
  if (year == null) return `${String(week).padStart(2, "0")}/—`;
  return `${String(week).padStart(2, "0")}/${String(year).slice(-2)}`;
}
