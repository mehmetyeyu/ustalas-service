// src/lib/ordersExcel.ts ve src/lib/productsExcel.ts'in ikisi de kullandığı,
// Excel içe/dışa aktarma ile ilgili genel yardımcılar — tek doğruluk kaynağı.

// Excel başlık hücrelerini HEADER_MAP karşılaştırması için normalize eder
// (baş/son boşluk kırpılır, Türkçe küçük harfe çevrilir, iç boşluklar teke indirilir).
export function normalizeHeader(h: unknown): string {
  return String(h ?? "")
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/\s+/g, " ");
}

// Boş/geçersiz hücreleri sessizce 0'a düşürür (zorunlu sayısal alanlar için).
export function toNumber(val: unknown): number {
  if (val == null || val === "") return 0;
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

// Büyük bir içe aktarma dosyasını, tek seferde çok fazla satırın tek bir
// transaction'da işlenmesini önlemek için sabit boyutlu parçalara böler.
export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
