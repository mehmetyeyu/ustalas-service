// Ürün Kataloğu formlarından (Yeni Ürün/Düzenle) gelen request body alanları
// hep aynı iki şekilde normalize edilir: boş/eksik değer null'a düşer, dolu
// değer trim'lenmiş metne veya sayıya çevrilir. POST/PATCH /api/products'ta
// (bkz. Faz 1/2 alanları) bu ikisi 20+ kez elle tekrarlanıyordu — burada
// tek yerde tutulur.
export function toNullableNumber(val: unknown): number | null {
  if (val == null || val === "") return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

export function toNullableText(val: unknown): string | null {
  if (val == null || val === "") return null;
  return String(val).trim() || null;
}
