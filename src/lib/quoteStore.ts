import { resolveServiceIds } from "@/lib/serviceCatalog";
import { upsertDirectoryNames } from "@/lib/directories";
import { deductStock } from "@/lib/productStock";
import { computeQuoteTotals, isVatRate, lineTotal, orderLineAmounts, type QuoteStatus, type VatMode, type VatRate } from "@/lib/quotes";

// Teklif API'lerinin (POST /api/quotes, PUT /api/quotes/[id]) ortak sunucu
// tarafı: gelen gövdeyi doğrular, satırları yazar. Kural/hesap tarafı
// src/lib/quotes.ts'te (istemciyle ortak).

interface QueryClient {
  query<T = unknown>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface QuoteLineInput {
  id?: number | null;
  service_name: string;
  supplier: string | null;
  stock_code: string | null;
  size_desc: string | null;
  brand: string | null;
  model_name: string | null;
  quantity: number;
  unit_price: number;
  cost_total: number | null;
  product_id: number | null;
}

export interface QuoteInput {
  customer_name: string | null;
  customer_phone: string | null;
  plate: string | null;
  notes: string | null;
  vat_mode: VatMode;
  vat_rate: VatRate;
  valid_until: string;
  lines: QuoteLineInput[];
  total: number;
}

export class QuoteValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuoteValidationError";
  }
}

function text(v: unknown, max: number): string | null {
  const s = String(v ?? "").trim().slice(0, max);
  return s || null;
}

function optNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Saf doğrulama — DB'ye dokunmaz (bkz. quotes.test.ts). Geçersizse
// QuoteValidationError (çağıran 400 döner).
export function parseQuoteInput(body: unknown): QuoteInput {
  const b = (body ?? {}) as Record<string, unknown>;
  const customer_name = text(b.customer_name, 100);
  const plate = text(String(b.plate ?? "").replace(/\s+/g, "").toUpperCase(), 20);
  if (!customer_name && !plate) throw new QuoteValidationError("Müşteri adı veya plakadan en az biri girilmelidir.");

  const vat_mode = b.vat_mode === "haric" ? "haric" : b.vat_mode === "dahil" ? "dahil" : null;
  if (!vat_mode) throw new QuoteValidationError("KDV dahil/hariç seçilmelidir.");
  const vat_rate = Number(b.vat_rate);
  if (!isVatRate(vat_rate)) throw new QuoteValidationError("KDV oranı %20, %10, %1 veya %0 olmalıdır.");

  const valid_until = String(b.valid_until ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valid_until) || Number.isNaN(new Date(`${valid_until}T00:00:00Z`).getTime())) {
    throw new QuoteValidationError("Geçerlilik tarihi geçersiz.");
  }

  if (!Array.isArray(b.lines) || b.lines.length === 0) throw new QuoteValidationError("En az bir satır zorunludur.");
  if (b.lines.length > 100) throw new QuoteValidationError("Bir teklifte en fazla 100 satır olabilir.");
  const lines: QuoteLineInput[] = b.lines.map((raw: unknown) => {
    const l = (raw ?? {}) as Record<string, unknown>;
    const service_name = text(l.service_name, 100);
    if (!service_name) throw new QuoteValidationError("Her satır için işlem adı zorunludur.");
    const quantity = Math.round(Number(l.quantity));
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > 9999) throw new QuoteValidationError("Adet 1 ile 9999 arasında olmalıdır.");
    const unit_price = Number(l.unit_price);
    if (!Number.isFinite(unit_price) || unit_price < 0) throw new QuoteValidationError("Birim fiyat geçersiz.");
    const cost_total = optNumber(l.cost_total);
    const productId = optNumber(l.product_id);
    const lineId = optNumber(l.id);
    return {
      id: lineId != null && Number.isInteger(lineId) ? lineId : null,
      service_name,
      supplier: text(l.supplier, 100),
      stock_code: text(l.stock_code, 50),
      size_desc: text(l.size_desc, 100),
      brand: text(l.brand, 100),
      model_name: text(l.model_name, 80),
      quantity,
      unit_price: Math.round(unit_price * 100) / 100,
      cost_total: cost_total != null && cost_total >= 0 ? Math.round(cost_total * 100) / 100 : null,
      product_id: productId != null && Number.isInteger(productId) && productId > 0 ? productId : null,
    };
  });

  const { total } = computeQuoteTotals(lines, vat_mode, vat_rate);
  if (total <= 0) throw new QuoteValidationError("Teklif tutarı 0'dan büyük olmalıdır.");

  return {
    customer_name,
    customer_phone: text(b.customer_phone, 20),
    plate,
    notes: text(b.notes, 2000),
    vat_mode,
    vat_rate,
    valid_until,
    lines,
    total,
  };
}

// Partinin birim alış maliyeti — sipariş formunun parti seçince doldurduğu
// değerle aynı kaynak (bkz. /api/products/stock-batches): stok girişlerinin
// ağırlıklı ortalaması, giriş yoksa products.purchase_price.
async function batchUnitCosts(client: QueryClient, tenantId: number, productIds: number[]): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (productIds.length === 0) return map;
  const result = await client.query<{ id: number; unit_cost: string | null }>(
    `SELECT p.id,
            COALESCE(
              (SELECT SUM(e.quantity * e.purchase_price) / NULLIF(SUM(e.quantity) FILTER (WHERE e.purchase_price IS NOT NULL), 0)
                 FROM product_stock_entries e WHERE e.product_id = p.id AND e.tenant_id = p.tenant_id),
              p.purchase_price
            ) AS unit_cost
     FROM products p WHERE p.tenant_id = $1 AND p.id = ANY($2)`,
    [tenantId, productIds]
  );
  for (const r of result.rows) if (r.unit_cost != null) map.set(r.id, Number(r.unit_cost));
  return map;
}

// Teklifin satırlarını baştan yazar (eskiler silinir) — satır sırası
// position'da korunur.
//
// Maliyet: "quotes.view_cost" izni olan kullanıcı maliyeti kendisi girer.
// İzni olmayan (maliyeti hiç görmeyen) kullanıcının formundan maliyet
// gelmez; bu durumda maliyet sunucuda belirlenir — satır daha önce
// kaydedilmiş ve parti/adet değişmemişse eski maliyet korunur, yoksa seçili
// partinin alış maliyetinden hesaplanır (parti yoksa boş). Böylece izinsiz
// biri teklifi düzenleyince yetkili kişinin girdiği maliyet silinmez.
export async function writeQuoteLines(
  client: QueryClient,
  tenantId: number,
  quoteId: number,
  lines: QuoteLineInput[],
  canViewCost: boolean
): Promise<void> {
  const serviceIdByName = await resolveServiceIds(client, tenantId, lines);

  let previous = new Map<number, { product_id: number | null; quantity: number; cost_total: string | null }>();
  if (!canViewCost) {
    const prev = await client.query<{ id: number; product_id: number | null; quantity: number; cost_total: string | null }>(
      "SELECT id, product_id, quantity, cost_total FROM quote_lines WHERE quote_id = $1 AND tenant_id = $2",
      [quoteId, tenantId]
    );
    previous = new Map(prev.rows.map((r) => [r.id, r]));
  }
  const unitCosts = canViewCost
    ? new Map<number, number>()
    : await batchUnitCosts(client, tenantId, Array.from(new Set(lines.map((l) => l.product_id).filter((id): id is number => id != null))));

  await client.query("DELETE FROM quote_lines WHERE quote_id = $1 AND tenant_id = $2", [quoteId, tenantId]);

  for (const [position, l] of lines.entries()) {
    let cost: number | null = l.cost_total;
    if (!canViewCost) {
      const old = l.id != null ? previous.get(l.id) : undefined;
      if (old && old.product_id === l.product_id && old.quantity === l.quantity) {
        cost = old.cost_total != null ? Number(old.cost_total) : null;
      } else {
        const unit = l.product_id != null ? unitCosts.get(l.product_id) : undefined;
        cost = unit != null ? lineTotal(l.quantity, unit) : null;
      }
    }
    await client.query(
      `INSERT INTO quote_lines
         (tenant_id, quote_id, position, service_id, product_id, supplier, stock_code, size_desc, brand, model_name,
          quantity, unit_price, line_total, cost_total)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        tenantId, quoteId, position, serviceIdByName.get(l.service_name), l.product_id,
        l.supplier, l.stock_code, l.size_desc, l.brand, l.model_name,
        l.quantity, l.unit_price, lineTotal(l.quantity, l.unit_price), cost,
      ]
    );
  }
}

export class QuoteConvertError extends Error {
  constructor(message: string, public status: 400 | 404 | 409) {
    super(message);
    this.name = "QuoteConvertError";
  }
}

// Teklifi siparişe dönüştürür — POST /api/orders ile aynı kurallar (plaka
// zorunluluğu, elle Sipariş No, müşteri/tedarikçi otomatik kaydı, stok
// düşümü) ve aynı transaction içinde teklif kilitlenir. Çağıran BEGIN/
// COMMIT'i yönetir; InsufficientStockError olduğu gibi yukarı çıkar.
//
// * Teklif FOR UPDATE ile kilitlenir: aynı anda iki "Siparişe Dönüştür"
//   ikinci siparişi açamaz (ikincisi SIPARIS görür; son güvence
//   quotes_order_unique).
// * Reddedilen teklif dönüştürülmez (önce "Yeniden Aç").
// * order_services.unit_price satır TOPLAMIDIR ve müşterinin ödediği (KDV
//   dahil) tutardır — bkz. orderLineAmounts.
// * Maliyet teklif satırından gelir; boşsa ve parti seçiliyse partinin
//   alış maliyetinden hesaplanır (sipariş raporlarındaki kâr boş kalmasın).
// * Teklif plakasızsa ve firma plakayı zorunlu tutuyorsa plaka istekten
//   alınır (dönüştürme ekranı sorar).
export async function convertQuoteToOrder(
  client: QueryClient,
  tenantId: number,
  quoteId: number,
  opts: { plate?: string | null; customOrderNo?: string | null }
): Promise<{ orderId: number; quoteNo: string; total: number }> {
  const quoteResult = await client.query<{
    quote_no: string; status: QuoteStatus; customer_name: string | null; customer_phone: string | null;
    plate: string | null; notes: string | null; vat_mode: VatMode; vat_rate: VatRate;
  }>(
    `SELECT quote_no, status, customer_name, customer_phone, plate, notes, vat_mode, vat_rate
     FROM quotes WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
    [quoteId, tenantId]
  );
  const quote = quoteResult.rows[0];
  if (!quote) throw new QuoteConvertError("Teklif bulunamadı.", 404);
  if (quote.status === "SIPARIS") throw new QuoteConvertError("Bu teklif zaten siparişe dönüştürülmüş.", 409);
  if (quote.status === "RED") throw new QuoteConvertError("Reddedilmiş teklif siparişe dönüştürülemez — önce \"Yeniden Aç\" ile açın.", 409);

  const linesResult = await client.query<{
    service_id: number; service_name: string; product_id: number | null; supplier: string | null; stock_code: string | null;
    size_desc: string | null; brand: string | null; model_name: string | null; quantity: number; unit_price: string; cost_total: string | null;
  }>(
    `SELECT ql.service_id, s.name AS service_name, ql.product_id, ql.supplier, ql.stock_code, ql.size_desc, ql.brand, ql.model_name,
            ql.quantity, ql.unit_price, ql.cost_total
     FROM quote_lines ql JOIN services s ON s.id = ql.service_id
     WHERE ql.quote_id = $1 AND ql.tenant_id = $2
     ORDER BY ql.position, ql.id`,
    [quoteId, tenantId]
  );
  const lines = linesResult.rows.map((l) => ({ ...l, unit_price: Number(l.unit_price) }));
  if (lines.length === 0) throw new QuoteConvertError("Teklifte satır yok.", 400);

  const settingsResult = await client.query<{ plate_required: boolean; custom_order_no_enabled: boolean; auto_register_customers: boolean }>(
    "SELECT plate_required, custom_order_no_enabled, auto_register_customers FROM app_settings WHERE tenant_id = $1",
    [tenantId]
  );
  const settings = settingsResult.rows[0] ?? { plate_required: true, custom_order_no_enabled: false, auto_register_customers: true };
  const plate = quote.plate || String(opts.plate ?? "").replace(/\s+/g, "").toUpperCase().slice(0, 20) || null;
  if (settings.plate_required && !plate) throw new QuoteConvertError("Plaka zorunludur.", 400);
  const customOrderNo = settings.custom_order_no_enabled ? String(opts.customOrderNo ?? "").trim().slice(0, 50) : null;
  if (settings.custom_order_no_enabled && !customOrderNo) throw new QuoteConvertError("Sipariş numarası zorunludur.", 400);

  const amounts = orderLineAmounts(lines, quote.vat_mode, quote.vat_rate);
  const total = Math.round(amounts.reduce((s, a) => s + a, 0) * 100) / 100;
  if (total <= 0) throw new QuoteConvertError("Sipariş tutarı 0'dan büyük olmalıdır.", 400);

  await upsertDirectoryNames(client, "suppliers", tenantId, lines.map((l) => l.supplier));
  if (settings.auto_register_customers && quote.customer_name) {
    await client.query(
      `INSERT INTO customers (tenant_id, name, phone) VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, name) DO UPDATE SET phone = COALESCE(customers.phone, EXCLUDED.phone)`,
      [tenantId, quote.customer_name, quote.customer_phone]
    );
  }

  const notes = [`Teklif ${quote.quote_no} üzerinden oluşturuldu.`, quote.notes].filter(Boolean).join("\n");
  const orderResult = await client.query<{ id: number }>(
    `INSERT INTO orders (tenant_id, plate, customer_name, customer_phone, notes, total_amount, status, custom_order_no)
     VALUES ($1, $2, $3, $4, $5, $6, 'BEKLEMEDE', $7) RETURNING id`,
    [tenantId, plate, quote.customer_name, quote.customer_phone, notes, total, customOrderNo]
  );
  const orderId = orderResult.rows[0].id;

  const missingCostIds = Array.from(new Set(lines.filter((l) => l.cost_total == null && l.product_id != null).map((l) => l.product_id!)));
  const unitCosts = await batchUnitCosts(client, tenantId, missingCostIds);
  for (const [i, l] of lines.entries()) {
    if (l.product_id != null) await deductStock(client, tenantId, l.product_id, l.quantity);
    const unitCost = l.product_id != null ? unitCosts.get(l.product_id) : undefined;
    const cost = l.cost_total != null ? Number(l.cost_total) : unitCost != null ? lineTotal(l.quantity, unitCost) : null;
    await client.query(
      `INSERT INTO order_services
         (tenant_id, order_id, service_id, unit_price, quantity, cost_price, supplier, stock_code, size_desc, brand, model_name, product_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [tenantId, orderId, l.service_id, amounts[i], l.quantity, cost, l.supplier, l.stock_code, l.size_desc, l.brand, l.model_name, l.product_id]
    );
  }

  await client.query(
    "UPDATE quotes SET status = 'SIPARIS', order_id = $1, converted_at = NOW(), updated_at = NOW() WHERE id = $2 AND tenant_id = $3",
    [orderId, quoteId, tenantId]
  );
  return { orderId, quoteNo: quote.quote_no, total };
}

export function isFkViolation(err: unknown): boolean {
  return !!err && typeof err === "object" && "code" in err && err.code === "23503";
}
