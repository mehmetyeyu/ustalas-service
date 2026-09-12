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
