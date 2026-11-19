// Ürün Kataloğu — Toplu Satış Fiyatı Güncelleme (ör. yılbaşı zammı: tüm
// ürünlere %10). Burada girdi doğrulaması ve seçenekler; fiyat hesabı
// veritabanında (POST /api/products/bulk-price) — önizleme ve uygulama aynı
// SQL ifadesini kullanır, önizlemede görülen fiyat ile yazılan birebir aynıdır.
//
// NEYİN güncellendiği: listede/sipariş stok seçicide görünen ve siparişe
// varsayılan olarak gelen "Satış Fiyatı (Ort.)", partinin stok girişlerinin
// (product_stock_entries.sale_price) miktar ağırlıklı ortalamasıdır (bkz.
// GET /api/products, /api/products/stock-batches — girişi olmayan partide
// products.sale_price). Bu yüzden ikisi birlikte güncellenir: girişlerin hepsi
// aynı oranla değiştiği için ortalama da tam o oranla değişir (ağırlıklar
// aynı kalır). products.sale_price ayrıca "Stok Girişi"nin yeni partiye
// önerdiği fiyattır. Alış fiyatı BİLEREK değişmez (gerçek maliyet geçmişi,
// kâr hesabı ona dayanır); geçmiş satışlar (order_services.unit_price) ve
// teklifler de değişmez.

export type BulkPriceMode = "percent" | "amount";

// Yuvarlama YUKARI yapılır (zam senaryosu: 3.287,50 → 3.290). "none" =
// kuruşa yuvarla (yarım kuruş yukarı). Fiyat 0'ın altına düşmez.
export const BULK_PRICE_ROUNDINGS = [
  { value: "none", label: "Yuvarlama yok", step: 0 },
  { value: "1", label: "Tam TL", step: 1 },
  { value: "5", label: "5 TL'ye", step: 5 },
  { value: "10", label: "10 TL'ye", step: 10 },
  { value: "50", label: "50 TL'ye", step: 50 },
  { value: "100", label: "100 TL'ye", step: 100 },
] as const;
export type BulkPriceRounding = (typeof BULK_PRICE_ROUNDINGS)[number]["value"];

export interface BulkPriceInput {
  mode: BulkPriceMode;
  value: number;
  rounding: BulkPriceRounding;
  // Ürünler sayfasının o anki filtreleri (GET /api/products ile aynı anlam).
  search: string | null;
  season: string | null;
  stock: "in" | "out" | null;
}

export class BulkPriceValidationError extends Error {}

export const BULK_PERCENT_MIN = -90;
export const BULK_PERCENT_MAX = 500;
export const BULK_AMOUNT_MAX = 1_000_000;
// products/product_stock_entries.sale_price DECIMAL(12,2) üst sınırı.
export const BULK_PRICE_COLUMN_MAX = 9_999_999_999.99;

// Kullanıcının yazdığı Türkçe sayı: "10", "10,5", "1.000", "1.234,56".
// Nokta binlik ayıracıdır (yalnızca 3'lü gruplar: "1.000", "12.500"); tek
// nokta ve arkasında 3 haneden farklı sayıda hane varsa ("10.5") ondalık
// sayılır. Anlaşılamayan metin NaN — önizleme istenmez.
export function parseTrDecimal(text: string): number {
  const t = text.trim();
  if (!t) return NaN;
  let normalized: string;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) normalized = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d+(,\d+)?$/.test(t)) normalized = t.replace(",", ".");
  // "10.5" / "1.50" ondalık; "1.0000" gibi belirsiz yazım (10.000 mü?) reddedilir.
  else if (/^\d+\.\d{1,2}$/.test(t)) normalized = t;
  else return NaN;
  return Number(normalized);
}

// En fazla 2 ondalık hane (kuruş / yüzde 12,35). Daha fazlası SQL'de tam
// hesaplanırdı ama kullanıcının göremeyeceği bir hassasiyet; reddedilir.
function hasAtMostTwoDecimals(n: number): boolean {
  return Math.abs(Math.round(n * 100) / 100 - n) < 1e-9;
}

export function parseBulkPriceInput(body: unknown): BulkPriceInput {
  if (!body || typeof body !== "object") throw new BulkPriceValidationError("Geçersiz istek.");
  const b = body as Record<string, unknown>;
  const mode = b.mode === "amount" ? "amount" : b.mode === "percent" ? "percent" : null;
  if (!mode) throw new BulkPriceValidationError("Artış türü seçin (yüzde ya da TL).");
  const value = typeof b.value === "number"
    ? b.value
    : typeof b.value === "string" ? (b.value.trim().startsWith("-") ? -parseTrDecimal(b.value.trim().slice(1)) : parseTrDecimal(b.value)) : NaN;
  if (!Number.isFinite(value) || value === 0) throw new BulkPriceValidationError("Sıfırdan farklı bir değer girin.");
  if (!hasAtMostTwoDecimals(value)) throw new BulkPriceValidationError("En fazla 2 ondalık hane girin (ör. 12,5).");
  if (mode === "percent" && (value < BULK_PERCENT_MIN || value > BULK_PERCENT_MAX)) {
    throw new BulkPriceValidationError(`Yüzde ${BULK_PERCENT_MIN} ile +${BULK_PERCENT_MAX} arasında olmalı.`);
  }
  if (mode === "amount" && Math.abs(value) > BULK_AMOUNT_MAX) {
    throw new BulkPriceValidationError("Tutar çok büyük.");
  }
  const rounding = BULK_PRICE_ROUNDINGS.find((r) => r.value === b.rounding)?.value ?? "none";
  // Kayan nokta artığı (ör. 10.000000000000002) SQL'e gitmesin — tam kuruşa
  // sabitlenir; aksi hâlde tam katta duran fiyat bir adım fazla yuvarlanabilirdi.
  const exact = Math.round(value * 100) / 100;
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 100) : null);
  const stock = b.stock === "in" || b.stock === "out" ? b.stock : null;
  return { mode, value: exact, rounding, search: text(b.search), season: text(b.season), stock };
}

export function bulkPriceStep(rounding: BulkPriceRounding): number {
  return BULK_PRICE_ROUNDINGS.find((r) => r.value === rounding)?.step ?? 0;
}

// Değerin SQL'e verilecek tam metni (kuruş tam sayısından; "7.50", "-0.01").
export function bulkValueSqlText(value: number): string {
  const cents = Math.round(value * 100);
  const abs = Math.abs(cents);
  return `${cents < 0 ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

// Yeni fiyatın SQL ifadesi — önizleme ve uygulama (bkz. /api/products/
// bulk-price) aynı ifadeyi kullanır. NUMERIC ile tam: yüzde → fiyat ×
// (1 + değer/100), TL → fiyat + değer; 0'ın altına inmez; adım > 0 ise
// adımın katına YUKARI (CEIL), değilse kuruşa (ROUND, yarım kuruş yukarı).
// Parametreler: mode ('percent' | 'amount'), value, step — yer tutucu
// numaraları çağıran verir.
export function bulkNewPriceSql(col: string, p: { mode: string; value: string; step: string }): string {
  const raw = `GREATEST(0, CASE WHEN ${p.mode} = 'percent' THEN ${col} * (1 + ${p.value}::numeric / 100) ELSE ${col} + ${p.value}::numeric END)`;
  return `(CASE WHEN ${p.step}::numeric > 0 THEN CEIL(${raw} / ${p.step}::numeric) * ${p.step}::numeric ELSE ROUND(${raw}, 2) END)`;
}
