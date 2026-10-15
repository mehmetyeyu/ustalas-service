// Ekranlardaki yazdıkça-daralt aramaları için Türkçe harf duyarsız eşleşme.
// toLocaleLowerCase("tr-TR") tek başına yetmiyor: "ISMAIL" → "ısmaıl" olur
// ve "ismail" araması onu bulamaz (veri büyük harfle girilmiş müşterilerde
// gerçek bir sorun — bulunamayan müşteri yeniden, farklı yazımla kaydediliyor).
// İ/I/ı/i dördü de aynı harf sayılır; kayıtlı veri değişmez, sadece
// karşılaştırma.
export function normalizeTrSearch(s: string): string {
  return s.replace(/[İIı]/g, "i").toLocaleLowerCase("tr-TR");
}

export function trIncludes(haystack: string, needle: string): boolean {
  return normalizeTrSearch(haystack).includes(normalizeTrSearch(needle));
}
