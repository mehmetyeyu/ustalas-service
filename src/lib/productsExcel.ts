export interface ParsedProductRow {
  code: string;
  brand: string | null;
  size_desc: string | null;
  season: string | null;
  supplier: string | null;
  production_week: number | null; // 1-53 (DOT kodu haftası)
  production_year: number | null; // ör. 2026
  purchase_price: number | null;
  sale_price: number | null;
  stock_qty: number;
}

// Envanter sisteminden gelen temel içe aktarma dosyası sadece Kod/Marka/Ebat/Stok
// içerir; Dışa Aktar ise tüm alanları (Model, Mevsim, Üretim Tarihi, fiyatlar)
// da ekler — aynı parser ikisini de (round-trip) okuyabilir, eksik sütunlar
// null/boş bırakılır.
const HEADER_MAP: Record<string, string> = {
  "ürün kodu": "code",
  "kod": "code",
  "marka": "brand",
  "ebat": "size_desc",
  "mevsim": "season",
  "tedarikçi": "supplier",
  "üretim tarihi": "production_week_year",
  "üretim haftası/yılı": "production_week_year",
  "üretim haftası / yılı": "production_week_year",
  "alış maliyeti": "purchase_price",
  "alış fiyatı": "purchase_price",
  "satış fiyatı": "sale_price",
  "stok miktarı": "stock_qty",
};

function normalizeHeader(h: unknown): string {
  return String(h ?? "")
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/\s+/g, " ");
}

function toNumber(val: unknown): number {
  if (val == null || val === "") return 0;
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

function toNullableNumber(val: unknown): number | null {
  if (val == null || val === "") return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function toText(val: unknown): string {
  return val == null ? "" : String(val).trim();
}

function isoWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

// "26" gibi 2 haneli bir yıl her zaman "2026" anlamına gelir (DOT kodu kısa
// yıl biçimi) — parti kimliğinin (kod+hafta+yıl+tedarikçi) tutarlı kalması
// için hem içe aktarmada hem de elle girişte (Yeni Ürün/Parti, Düzenle) aynı
// normalize kuralı uygulanır.
export function normalizeYear(year: number): number {
  return year < 100 ? year + 2000 : year;
}

// Üretim Haftası/Yılı "10/26" (Hafta/Yıl, DOT kodu biçimi) metni olarak girilir —
// takvim tarihi değildir. Excel bazen bu metni otomatik tarihe çevirebildiğinden
// (seri sayı olarak gelirse) o durumda da hafta/yıl seri tarihten türetilir.
function parseWeekYear(val: unknown): { week: number | null; year: number | null } {
  if (val == null || val === "") return { week: null, year: null };
  if (typeof val === "number") {
    const ms = Math.round((val - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (!isNaN(d.getTime()) && val > 1000) {
      return { week: isoWeek(d), year: d.getUTCFullYear() };
    }
    return { week: null, year: null };
  }
  const str = String(val).trim();
  if (!str) return { week: null, year: null };
  const m = str.match(/^(\d{1,2})\s*[/\-.]\s*(\d{2,4})$/);
  if (!m) return { week: null, year: null };
  const week = parseInt(m[1], 10);
  const year = normalizeYear(parseInt(m[2], 10));
  return week >= 1 && week <= 53 ? { week, year } : { week: null, year: null };
}

// XLSX.read/sheet_to_json result — kept loose to avoid importing the "xlsx"
// types here (callers pass their own XLSX module in, browser or Node).
export function parseProductRows(
  rows: unknown[][]
): { rows: ParsedProductRow[]; skipped: number } {
  if (rows.length === 0) return { rows: [], skipped: 0 };

  const headerRow = rows[0] as unknown[];
  const colIndex: Record<string, number> = {};
  headerRow.forEach((h, i) => {
    const key = HEADER_MAP[normalizeHeader(h)];
    if (key) colIndex[key] = i;
  });

  if (colIndex.code === undefined) {
    throw new Error('"Ürün Kodu" sütunu bulunamadı.');
  }

  const dataRows = rows.slice(1).filter((row) =>
    (row as unknown[]).some((c) => c !== null && c !== undefined && c !== "")
  );

  const parsed: ParsedProductRow[] = [];
  let skipped = 0;

  for (const row of dataRows) {
    const r = row as unknown[];
    const code = colIndex.code !== undefined ? toText(r[colIndex.code]) : "";
    // Kaynak veride gerçek kodu olmayan kalemler bazen "-" gibi bir dolgu
    // değerle gelir (ör. Mini Stepne kalemleri) — gerçek kod sayılmaz, aynı
    // dolgu değerini paylaşan satırlar birbirinin üzerine yazmasın diye atlanır.
    if (!code || /^[-–—.\s]*$/.test(code)) { skipped++; continue; }

    const { week, year } = colIndex.production_week_year !== undefined
      ? parseWeekYear(r[colIndex.production_week_year])
      : { week: null, year: null };

    parsed.push({
      code,
      brand: colIndex.brand !== undefined ? toText(r[colIndex.brand]) || null : null,
      size_desc: colIndex.size_desc !== undefined ? toText(r[colIndex.size_desc]) || null : null,
      season: colIndex.season !== undefined ? toText(r[colIndex.season]) || null : null,
      supplier: colIndex.supplier !== undefined ? toText(r[colIndex.supplier]) || null : null,
      production_week: week,
      production_year: year,
      purchase_price: colIndex.purchase_price !== undefined ? toNullableNumber(r[colIndex.purchase_price]) : null,
      sale_price: colIndex.sale_price !== undefined ? toNullableNumber(r[colIndex.sale_price]) : null,
      stock_qty: colIndex.stock_qty !== undefined ? Math.round(toNumber(r[colIndex.stock_qty])) : 0,
    });
  }

  return { rows: parsed, skipped };
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
