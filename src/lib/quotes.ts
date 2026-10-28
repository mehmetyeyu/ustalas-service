// Teklif modülünün ortak kuralları — tutar/KDV hesabı, numara biçimi ve
// durum etiketleri. Hem API (kaydederken total_amount'u hesaplar) hem ekran
// (canlı toplam, çıktı) aynı fonksiyonları kullanır ki ekrandaki toplamla
// kaydedilen toplam hiç ayrışmasın. Şema: database/schema.sql (quotes).

interface QueryClient {
  query<T = unknown>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export const QUOTE_STATUSES = ["TASLAK", "GONDERILDI", "KABUL", "RED", "SIPARIS"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  TASLAK: "Taslak",
  GONDERILDI: "Gönderildi",
  KABUL: "Kabul Edildi",
  RED: "Reddedildi",
  SIPARIS: "Siparişe Dönüştü",
};

export const VAT_RATES = [20, 10, 1, 0] as const;
export type VatRate = (typeof VAT_RATES)[number];
export type VatMode = "dahil" | "haric";

export const QUOTE_NO_FORMATS = ["simple", "yearly"] as const;
export type QuoteNoFormat = (typeof QUOTE_NO_FORMATS)[number];

export const DEFAULT_VALIDITY_DAYS = 15;
export const VALIDITY_DAY_OPTIONS = [7, 15, 30] as const;

export function isVatRate(v: unknown): v is VatRate {
  return VAT_RATES.includes(v as VatRate);
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function lineTotal(quantity: number, unitPrice: number): number {
  return round2(quantity * unitPrice);
}

export interface QuoteTotals {
  net: number;
  vat: number;
  total: number;
}

// Fiyatlar teklifin vat_mode'una göre girilmiş hâliyle gelir. "dahil"de
// satırların toplamı zaten genel toplamdır, KDV içinden ayrıştırılır;
// "haric"te satır toplamı nettir, KDV üstüne eklenir. Her iki durumda da
// net + vat = total kuruşu kuruşuna tutar.
export function computeQuoteTotals(
  lines: { quantity: number; unit_price: number }[],
  vatMode: VatMode,
  vatRate: VatRate
): QuoteTotals {
  const sum = round2(lines.reduce((acc, l) => acc + lineTotal(l.quantity, l.unit_price), 0));
  if (vatMode === "dahil") {
    const net = round2(sum / (1 + vatRate / 100));
    return { net, vat: round2(sum - net), total: sum };
  }
  const vat = round2(sum * (vatRate / 100));
  return { net: sum, vat, total: round2(sum + vat) };
}

export function formatQuoteNo(format: QuoteNoFormat, year: number, n: number): string {
  const seq = String(n).padStart(4, "0");
  return format === "yearly" ? `T-${year}-${seq}` : `T-${seq}`;
}

// Firmanın bir sonraki teklif numarasını ayırır — teklifi yazan aynı
// transaction içinde çağrılmalı (teklif kaydı geri alınırsa sayaç da geri
// alınır, numara boşa gitmez). 'simple' tek seri (year=0), 'yearly' her yıl
// 1'den başlar. Yıl Türkiye saatine göre alınır (31 Aralık gece yarısı UTC
// kayması olmasın).
export async function nextQuoteNo(client: QueryClient, tenantId: number, format: QuoteNoFormat, now = new Date()): Promise<string> {
  const year = Number(new Intl.DateTimeFormat("en", { timeZone: "Europe/Istanbul", year: "numeric" }).format(now));
  const result = await client.query<{ last_no: number }>(
    `INSERT INTO quote_counters (tenant_id, year, last_no) VALUES ($1, $2, 1)
     ON CONFLICT (tenant_id, year) DO UPDATE SET last_no = quote_counters.last_no + 1
     RETURNING last_no`,
    [tenantId, format === "yearly" ? year : 0]
  );
  return formatQuoteNo(format, year, result.rows[0].last_no);
}

// "Süresi doldu" saklanan bir durum değil — açık (henüz sonuçlanmamış) bir
// teklifin geçerlilik günü geçmişse ekranda öyle gösterilir. today/validUntil
// "YYYY-MM-DD" (takvim günü, saat dilimi kayması yok).
export function isQuoteExpired(status: QuoteStatus, validUntil: string, today: string): boolean {
  return (status === "TASLAK" || status === "GONDERILDI") && validUntil < today;
}

// Siparişe dönüştürülen teklif kilitlidir; reddedilen tekrar açılabilir
// (müşteri fikir değiştirebilir), bu yüzden sadece SIPARIS kilitler.
export function isQuoteLocked(status: QuoteStatus): boolean {
  return status === "SIPARIS";
}

// Türkiye takvim günü "YYYY-MM-DD" — geçerlilik tarihi hesapları için
// (tarayıcının saat dilimi ne olursa olsun aynı gün).
export function todayIstanbul(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(now);
}

export function addDaysISO(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// "2026-11-12" → "12.11.2026"
export function formatISODate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}.${m}.${y}`;
}

// Katalog/parti fiyatları KDV dahil tutuluyor — KDV hariç bir teklife
// otomatik doldururken net fiyata çevrilir.
export function priceForVatMode(grossPrice: number, vatMode: VatMode, vatRate: VatRate): number {
  return vatMode === "haric" ? round2(grossPrice / (1 + vatRate / 100)) : round2(grossPrice);
}

// Siparişe dönüştürürken her satırın order_services.unit_price'ı (sipariş
// tarafında SATIR TOPLAMI, müşterinin ödediği KDV dahil tutar). KDV dahil
// teklifte satır toplamının kendisi; KDV hariçte KDV eklenmiş hâli. Satır
// satır yuvarlama toplamı kuruş kaydırabilir — fark son satıra yazılır ki
// siparişin toplamı teklifin genel toplamıyla birebir aynı olsun.
export function orderLineAmounts(
  lines: { quantity: number; unit_price: number }[],
  vatMode: VatMode,
  vatRate: VatRate
): number[] {
  if (lines.length === 0) return [];
  const { total } = computeQuoteTotals(lines, vatMode, vatRate);
  const factor = vatMode === "haric" ? 1 + vatRate / 100 : 1;
  const amounts = lines.map((l) => round2(lineTotal(l.quantity, l.unit_price) * factor));
  const diff = round2(total - amounts.reduce((s, a) => s + a, 0));
  amounts[amounts.length - 1] = round2(amounts[amounts.length - 1] + diff);
  return amounts;
}
