// TL tutar biçimlendirme yardımcıları — fiyatlandırma artık USD/TCMB kuru
// değil, platform_pricing'teki SABİT TL değeri (bkz. src/lib/
// platformPricing.ts, database/schema.sql platform_pricing notu), bu
// yüzden burada sadece biçimlendirme kalıyor.

export function formatTry(amount: number): string {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(amount);
}

// formatTry'den farklı olarak her zaman 2 ondalık basamak gösterir (ör.
// iyzico'daki plan fiyatı "1500.00" gibi kuruşlu gelebilir).
export function formatTry2(amount: number): string {
  return new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}
