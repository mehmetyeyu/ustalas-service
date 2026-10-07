// Kasalar döviz de tutabilir (ör. "Dolar Kasa") — bkz.
// src/app/admin/kasa/page.tsx. formatCurrency (TL) en sık kullanılan yol
// olarak, imzası değişmeden, aşağıdaki genel formatMoney'e sarılı kalır.
export function formatMoney(amount: number, currency: string = "TRY"): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatCurrency(amount: number): string {
  return formatMoney(amount, "TRY");
}

// Tutar inputları için (Raporlar Yıllık Özet Gelir/Gider, Müşteriler Tahsilat
// Tutarı, vb.) — formatCurrency'den farkı: para birimi simgesi yok, kullanıcı
// yazarken kullanılacak (bkz. TRNumberInput), binlik ayraç nokta/ondalık virgül.
// Depolanan/işlenen değer her zaman düz sayı metni (nokta ondalık, "1234.5"
// gibi) — TL simgesi veya binlik ayraç İÇERMEZ, Number(raw) ile parse edilebilir.

// Ham state değerini ("1234.5") kullanıcıya Türkçe biçimde gösterir ("1.234,5").
// Henüz tamamlanmamış yazımı bozmaz: sondaki "," veya kısmi ondalık aynen kalır.
export function formatLiveTR(raw: string): string {
  const [intPart, decPart] = raw.split(".");
  const digits = intPart.replace(/\D/g, "");
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return decPart === undefined ? grouped : `${grouped},${decPart}`;
}

// Kullanıcının o anki yazdığı (Türkçe biçimli) metni ham state değerine çevirir:
// nokta binlik ayraç olduğu için atılır, sadece İLK virgül ondalık ayırıcı
// sayılır, ondalık kısmı 2 haneyle sınırlanır.
export function parseLiveTRInput(typed: string): string {
  const digitsAndCommas = typed.replace(/[^\d,]/g, "");
  const firstComma = digitsAndCommas.indexOf(",");
  if (firstComma === -1) return digitsAndCommas;
  const intPart = digitsAndCommas.slice(0, firstComma);
  const decPart = digitsAndCommas.slice(firstComma + 1).replace(/,/g, "").slice(0, 2);
  return `${intPart}.${decPart}`;
}

export function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Istanbul",
  }).format(d);
}
