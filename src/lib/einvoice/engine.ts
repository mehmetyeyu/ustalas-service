// Fatura motoru (docs/e-fatura-tasarim.md §5). Siparişten resmi fatura:
//   contact → invoice → formalize → poll → pdf → payment → done
// invoices satırı sağlayıcıya ilk istekten ÖNCE açılır; her adımın dış
// kimliği adım biter bitmez yazılır. Bir adım hata verirse fatura HATA'ya
// düşer, "Tekrar Dene" kaldığı adımdan devam eder — sağlayıcıda idempotency
// anahtarı olmadığından çift fatura bu sayede oluşmaz. Uzun bekleme yok:
// ekran durum ucunu (advanceInvoice) birkaç saniyede bir çağırır, her
// çağrıda en fazla birkaç dış istek yapılır (Vercel CPU, §2).
import pool from "../db";
import { buildInvoiceAmounts, withinProviderTolerance, type InvoiceAmounts, type InvoiceSourceLine } from "./amounts";
import { validateBuyer, type BuyerInput } from "./buyer";
import { getConnection, getProvider, invoiceSeries, providerContext, type EInvoiceConnection } from "./connection";
import { effectiveVatRate } from "./vat";
import { ProviderAuthError, ProviderError, type BuyerInfo, type EInvoiceProvider, type ProviderContext } from "./provider";
import { ANONYMOUS_TCKN } from "../taxId";

export type InvoiceStatus = "HAZIRLANIYOR" | "ISLENIYOR" | "RESMILESTI" | "HATA" | "IPTAL" | "REDDEDILDI";
export type InvoiceStep = "contact" | "invoice" | "formalize" | "poll" | "pdf" | "payment" | "done";

// Resmileştirme işinin sağlayıcıdaki ömrü (Paraşüt: 15 dk). Geçince işe değil
// faturanın aktif belgesine bakılır.
const JOB_TTL_MS = 15 * 60 * 1000;
// Bir isteğin bir faturayı sahiplenme süresi (iki sekme aynı anda yoklarsa).
const CLAIM_SECONDS = 45;
// e-Arşiv düzenleme tarihi en fazla 7 gün geriye (GİB).
export const MAX_BACKDATE_DAYS = 7;

export class InvoiceError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "InvoiceError";
  }
}

export interface InvoiceRow {
  id: number;
  tenant_id: number;
  customer_id: number | null;
  doc_type: "e_arsiv" | "e_fatura" | null;
  scenario: "basic" | "commercial" | null;
  status: InvoiceStatus;
  step: InvoiceStep;
  issue_date: string;
  buyer_name: string;
  buyer_tax_number: string | null;
  buyer_tax_office: string | null;
  buyer_address: string | null;
  buyer_city: string | null;
  buyer_district: string | null;
  buyer_email: string | null;
  buyer_alias: string | null;
  plate_note: string | null;
  net_total: string | null;
  vat_total: string | null;
  gross_total: string;
  provider_gross_total: string | null;
  lines: InvoiceAmounts["lines"];
  ext_contact_id: string | null;
  ext_invoice_id: string | null;
  ext_job_id: string | null;
  ext_job_started_at: string | null;
  ext_document_id: string | null;
  gib_invoice_no: string | null;
  ettn: string | null;
  cancellable_until: string | null;
  response_type: string | null;
  error_message: string | null;
  attempts: number;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Taslak: seçili siparişlerden alıcı varsayılanları ve tutarlar
// ---------------------------------------------------------------------------

interface OrderRow {
  id: number;
  status: string;
  plate: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  total_amount: string | null;
  paid_amount: string | null;
  custom_order_no: string | null;
  created_at: string;
}

interface LineRow {
  order_id: number;
  service_id: number;
  service_name: string;
  service_vat_rate: number | null;
  quantity: number;
  unit_price: string;
  stock_code: string | null;
  size_desc: string | null;
  brand: string | null;
  model_name: string | null;
}

export interface InvoiceDraft {
  orders: { id: number; plate: string | null; order_no: string | null; created_at: string }[];
  customer: { id: number; name: string; is_corporate: boolean; tax_no: string | null; tax_office: string | null; address: string | null; city: string | null; district: string | null; email: string | null; phone: string | null } | null;
  buyerDefaults: BuyerInput & { name: string };
  sourceLines: InvoiceSourceLine[];
  discountGross: number;
  amounts: InvoiceAmounts;
  plateNote: string | null;
}

export function canInvoiceOrder(status: string): boolean {
  // Kullanıcı kararı 2026-10-30: şimdilik yalnızca tamamlanan sipariş.
  return status === "TAMAMLANDI";
}

// "05.11" — Intl'in tr-TR ayracı ortama göre değişebildiği için parçalardan.
function dayMonth(createdAt: string | Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit" }).formatToParts(new Date(createdAt));
  return `${parts.find((p) => p.type === "day")?.value}.${parts.find((p) => p.type === "month")?.value}`;
}

function lineDescription(l: LineRow): string {
  const product = [l.brand, l.model_name, l.size_desc].map((s) => s?.trim()).filter(Boolean).join(" ");
  return product ? `${l.service_name} — ${product}` : l.service_name;
}

export async function buildDraft(tenantId: number, orderIds: number[], defaultVatRate: number): Promise<InvoiceDraft> {
  const ids = Array.from(new Set(orderIds.filter((n) => Number.isInteger(n) && n > 0)));
  if (ids.length === 0) throw new InvoiceError("Faturalanacak sipariş seçilmedi.");
  if (ids.length > 100) throw new InvoiceError("Bir faturada en fazla 100 sipariş olabilir.");

  const ordersResult = await pool.query<OrderRow>(
    `SELECT id, status, plate, customer_name, customer_phone, total_amount, paid_amount, custom_order_no, created_at
     FROM orders WHERE tenant_id = $1 AND id = ANY($2::int[]) ORDER BY created_at, id`,
    [tenantId, ids]
  );
  const orders = ordersResult.rows;
  if (orders.length !== ids.length) throw new InvoiceError("Siparişlerden biri bulunamadı.", 404);
  const notDone = orders.find((o) => !canInvoiceOrder(o.status));
  if (notDone) throw new InvoiceError("Yalnızca tamamlanmış (ödemesi alınmış) siparişe fatura kesilebilir.");
  const names = new Set(orders.map((o) => (o.customer_name ?? "").trim()));
  if (names.size > 1) throw new InvoiceError("Tek faturada yalnızca aynı müşterinin siparişleri birleştirilebilir.");

  const invoiced = await pool.query<{ order_id: number }>(
    "SELECT order_id FROM invoice_orders WHERE tenant_id = $1 AND order_id = ANY($2::int[]) AND active",
    [tenantId, ids]
  );
  if (invoiced.rows.length > 0) throw new InvoiceError("Seçili siparişlerden birinin zaten faturası var.", 409);

  const linesResult = await pool.query<LineRow>(
    `SELECT os.order_id, os.service_id, s.name AS service_name, s.vat_rate AS service_vat_rate, os.quantity, os.unit_price,
            os.stock_code, os.size_desc, os.brand, os.model_name
     FROM order_services os JOIN services s ON s.id = os.service_id AND s.tenant_id = os.tenant_id
     WHERE os.tenant_id = $1 AND os.order_id = ANY($2::int[]) ORDER BY os.order_id, os.id`,
    [tenantId, ids]
  );
  // Çok siparişli faturada (filo aylık faturası) her satırın hangi araca ve
  // güne ait olduğu açıklamanın başında yazar: "34ABC123 · 05.11 · Balans".
  const multi = orders.length > 1;
  const orderById = new Map(orders.map((o) => [o.id, o]));
  // Aynı aracın işleri alt alta: plaka, sonra sipariş sırası (sort kararlı).
  const plateOf = (l: LineRow) => orderById.get(l.order_id)?.plate?.trim() || "\uffff";
  const rows = multi ? [...linesResult.rows].sort((a, b) => plateOf(a).localeCompare(plateOf(b), "tr")) : linesResult.rows;
  const sourceLines: InvoiceSourceLine[] = rows
    .filter((l) => Number(l.unit_price) > 0)
    .map((l) => {
      const base = lineDescription(l);
      const o = orderById.get(l.order_id);
      return {
        localKey: l.stock_code?.trim() ? `tire:${l.stock_code.trim()}` : `service:${l.service_id}`,
        description: multi && o ? `${o.plate?.trim() || "Plakasız"} · ${dayMonth(o.created_at)} · ${base}` : base,
        ...(multi ? { productName: base } : {}),
        quantity: l.quantity,
        grossTotal: Number(l.unit_price),
        vatRate: effectiveVatRate(l.service_vat_rate, defaultVatRate),
      };
    });
  if (sourceLines.length === 0) throw new InvoiceError("Faturalanacak tutarlı satır yok.");

  // İndirim = sipariş toplamı - alınan (kurumsal indirim dahil, bkz. Bölüm 26).
  const discountGross = orders.reduce((s, o) => {
    const total = Number(o.total_amount ?? 0);
    const paid = o.paid_amount == null ? total : Number(o.paid_amount);
    return s + Math.max(0, total - paid);
  }, 0);
  const amounts = buildInvoiceAmounts(sourceLines, discountGross);
  if (amounts.gross <= 0) throw new InvoiceError("Fatura tutarı sıfır olamaz.");

  const customerName = orders[0].customer_name?.trim() ?? "";
  const customerResult = customerName
    ? await pool.query<NonNullable<InvoiceDraft["customer"]>>(
        `SELECT id, name, is_corporate, tax_no, tax_office, address, city, district, email, phone
         FROM customers WHERE tenant_id = $1 AND name = $2`,
        [tenantId, customerName]
      )
    : { rows: [] };
  const customer = customerResult.rows[0] ?? null;

  const plates = Array.from(new Set(orders.map((o) => o.plate?.trim()).filter((p): p is string => !!p)));
  return {
    orders: orders.map((o) => ({ id: o.id, plate: o.plate, order_no: o.custom_order_no, created_at: o.created_at })),
    customer,
    buyerDefaults: {
      name: customer?.name ?? customerName,
      tax_number: customer?.tax_no ?? "",
      tax_office: customer?.tax_office ?? "",
      address: customer?.address ?? "",
      city: customer?.city ?? "",
      district: customer?.district ?? "",
      email: customer?.email ?? "",
      phone: customer?.phone ?? orders[0].customer_phone ?? "",
    },
    sourceLines,
    discountGross: amounts.discountGross,
    amounts,
    plateNote: plates.length > 0 ? `Plaka: ${plates.join(", ")}` : null,
  };
}

// ---------------------------------------------------------------------------
// Faturayı aç
// ---------------------------------------------------------------------------

function istanbulToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
}

export function validateIssueDate(issueDate: unknown, activatedAt: string | Date | null, today = istanbulToday()): string {
  const d = String(issueDate ?? "") || today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new InvoiceError("Fatura tarihi geçersiz.");
  if (d > today) throw new InvoiceError("Fatura tarihi ileri bir tarih olamaz.");
  const min = new Date(`${today}T00:00:00Z`);
  min.setUTCDate(min.getUTCDate() - MAX_BACKDATE_DAYS);
  if (d < min.toISOString().slice(0, 10)) throw new InvoiceError(`Fatura tarihi en fazla ${MAX_BACKDATE_DAYS} gün geriye olabilir.`);
  const activated = activatedAt ? new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date(activatedAt)) : null;
  if (activated && d < activated) throw new InvoiceError("Fatura tarihi, firmanın e-Fatura'ya geçiş tarihinden önce olamaz.");
  return d;
}

export async function requireActiveConnection(tenantId: number): Promise<EInvoiceConnection> {
  const conn = await getConnection(tenantId);
  if (!conn || conn.status === "disabled") throw new InvoiceError("e-Fatura sağlayıcısı bağlı değil (Ayarlar → e-Fatura).", 409);
  if (conn.status === "reauth") throw new InvoiceError("e-Fatura sağlayıcı bağlantısının yenilenmesi gerekiyor (Ayarlar → e-Fatura).", 409);
  if (conn.status === "pending") throw new InvoiceError("Paraşüt'te hangi firmanın bağlanacağını seçin (Ayarlar → e-Fatura).", 409);
  return conn;
}

export async function openInvoice(params: {
  tenantId: number;
  userId: number;
  orderIds: number[];
  issueDate: unknown;
  buyer: BuyerInput;
}): Promise<number> {
  const conn = await requireActiveConnection(params.tenantId);
  const issueDate = validateIssueDate(params.issueDate, conn.e_invoicing_activated_at);
  const draft = await buildDraft(params.tenantId, params.orderIds, conn.default_vat_rate);
  const v = validateBuyer(params.buyer, { city: conn.company_city, district: conn.company_district });
  if (!v.ok) throw new InvoiceError(v.error);
  const buyer = v.buyer;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query<{ id: number }>(
      `INSERT INTO invoices (tenant_id, customer_id, issue_date, buyer_name, buyer_tax_number, buyer_tax_office, buyer_address,
                             buyer_city, buyer_district, buyer_email, plate_note, net_total, vat_total, gross_total, lines, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING id`,
      [params.tenantId, draft.customer?.id ?? null, issueDate, buyer.name, buyer.taxNumber, buyer.taxOffice, buyer.address,
       buyer.city, buyer.district, buyer.email, draft.plateNote, draft.amounts.net, draft.amounts.vat, draft.amounts.gross,
       JSON.stringify(draft.amounts.lines), params.userId]
    );
    const invoiceId = inserted.rows[0].id;
    for (const o of draft.orders) {
      await client.query("INSERT INTO invoice_orders (invoice_id, order_id, tenant_id) VALUES ($1, $2, $3)", [invoiceId, o.id, params.tenantId]);
    }
    // Girilen fatura bilgileri müşteri kaydına da yazılır (bir sonrakinde
    // sorulmasın). Anonim TCKN yazılmaz — her faturada yeniden sorulur.
    if (draft.customer) {
      await client.query(
        `UPDATE customers SET
           tax_no = CASE WHEN $3::text IS NULL THEN tax_no ELSE $3 END,
           tax_office = COALESCE($4, tax_office), address = COALESCE($5, address),
           city = COALESCE($6, city), district = COALESCE($7, district), email = COALESCE($8, email)
         WHERE id = $1 AND tenant_id = $2`,
        [draft.customer.id, params.tenantId, buyer.taxNumber === ANONYMOUS_TCKN ? null : buyer.taxNumber,
         buyer.taxOffice, buyer.address, params.buyer.city ? buyer.city : null, params.buyer.district ? buyer.district : null, buyer.email]
      );
    }
    await client.query("COMMIT");
    return invoiceId;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    if (err && typeof err === "object" && "code" in err && err.code === "23505") {
      throw new InvoiceError("Seçili siparişlerden birinin zaten faturası var.", 409);
    }
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Adım adım ilerletme
// ---------------------------------------------------------------------------

export const INVOICE_COLUMNS = `id, tenant_id, customer_id, doc_type, scenario, status, step, to_char(issue_date, 'YYYY-MM-DD') AS issue_date,
  buyer_name, buyer_tax_number, buyer_tax_office, buyer_address, buyer_city, buyer_district, buyer_email, buyer_alias, plate_note,
  net_total, vat_total, gross_total, provider_gross_total, lines, ext_contact_id, ext_invoice_id, ext_job_id, ext_job_started_at,
  ext_document_id, gib_invoice_no, ettn, cancellable_until, response_type, error_message, attempts, created_at`;

export async function getInvoice(tenantId: number, invoiceId: number): Promise<InvoiceRow | null> {
  const r = await pool.query<InvoiceRow>(`SELECT ${INVOICE_COLUMNS} FROM invoices WHERE id = $1 AND tenant_id = $2`, [invoiceId, tenantId]);
  return r.rows[0] ?? null;
}

async function claim(tenantId: number, invoiceId: number): Promise<InvoiceRow | null> {
  const r = await pool.query<InvoiceRow>(
    `UPDATE invoices SET processing_until = NOW() + make_interval(secs => $3)
     WHERE id = $1 AND tenant_id = $2 AND status IN ('HAZIRLANIYOR', 'ISLENIYOR')
       AND (processing_until IS NULL OR processing_until < NOW())
     RETURNING ${INVOICE_COLUMNS}`,
    [invoiceId, tenantId, CLAIM_SECONDS]
  );
  return r.rows[0] ?? null;
}

async function release(invoiceId: number): Promise<void> {
  await pool.query("UPDATE invoices SET processing_until = NULL WHERE id = $1", [invoiceId]);
}

async function save(invoiceId: number, fields: Record<string, unknown>): Promise<void> {
  const keys = Object.keys(fields);
  // Anahtarlar bu dosyadaki sabit adlardır, kullanıcı girdisi değil.
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
  await pool.query(`UPDATE invoices SET ${sets}, updated_at = NOW() WHERE id = $1`, [invoiceId, ...keys.map((k) => fields[k])]);
}

async function ensureProducts(provider: EInvoiceProvider, ctx: ProviderContext, tenantId: number, inv: InvoiceRow) {
  const lines = [];
  for (const l of inv.lines) {
    const mapped = await pool.query<{ ext_product_id: string }>(
      "SELECT ext_product_id FROM einvoice_product_map WHERE tenant_id = $1 AND local_key = $2 AND vat_rate = $3",
      [tenantId, l.localKey, l.vatRate]
    );
    let productId = mapped.rows[0]?.ext_product_id;
    if (!productId) {
      productId = await provider.ensureProduct(ctx, { name: l.productName ?? l.description, vatRate: l.vatRate });
      await pool.query(
        `INSERT INTO einvoice_product_map (tenant_id, local_key, vat_rate, ext_product_id) VALUES ($1, $2, $3, $4)
         ON CONFLICT (tenant_id, local_key, vat_rate) DO NOTHING`,
        [tenantId, l.localKey, l.vatRate, productId]
      );
    }
    lines.push({ productId, description: l.description, quantity: l.quantity, unitPriceNet: l.unitPriceNet, vatRate: l.vatRate, discountNet: l.discountNet });
  }
  return lines;
}

function buyerOf(inv: InvoiceRow): BuyerInfo {
  return {
    name: inv.buyer_name,
    taxNumber: inv.buyer_tax_number ?? ANONYMOUS_TCKN,
    taxOffice: inv.buyer_tax_office,
    address: inv.buyer_address,
    city: inv.buyer_city,
    district: inv.buyer_district,
    email: inv.buyer_email,
    phone: null,
    isCompany: (inv.buyer_tax_number ?? "").length === 10,
  };
}

// Bir adımı çalıştırır; ilerlediyse true, beklemesi gerekiyorsa false.
async function runStep(provider: EInvoiceProvider, ctx: ProviderContext, conn: EInvoiceConnection, inv: InvoiceRow): Promise<boolean> {
  switch (inv.step) {
    case "contact": {
      const existing = inv.customer_id
        ? (await pool.query<{ ext_contact_id: string | null }>("SELECT ext_contact_id FROM customers WHERE id = $1 AND tenant_id = $2", [inv.customer_id, inv.tenant_id])).rows[0]?.ext_contact_id ?? null
        : null;
      // Anonim alıcıda müşteri kaydının kişisi kullanılmaz (adı aynı, vergi no farklı).
      const reuse = inv.buyer_tax_number === ANONYMOUS_TCKN ? null : existing;
      const contactId = await provider.upsertContact(ctx, buyerOf(inv), reuse);
      if (inv.customer_id && inv.buyer_tax_number !== ANONYMOUS_TCKN) {
        await pool.query("UPDATE customers SET ext_contact_id = $3 WHERE id = $1 AND tenant_id = $2", [inv.customer_id, inv.tenant_id, contactId]);
      }
      await save(inv.id, { ext_contact_id: contactId, step: "invoice" });
      Object.assign(inv, { ext_contact_id: contactId, step: "invoice" });
      return true;
    }
    case "invoice": {
      const series = invoiceSeries(conn);
      let created = await provider.findInvoice(ctx, series, inv.id);
      if (!created) {
        const orders = await pool.query<{ order_no: string | null; created_at: string }>(
          `SELECT COALESCE(o.custom_order_no, o.id::text) AS order_no, to_char(o.created_at, 'YYYY-MM-DD') AS created_at
           FROM invoice_orders io JOIN orders o ON o.id = io.order_id AND o.tenant_id = io.tenant_id
           WHERE io.invoice_id = $1 ORDER BY o.created_at LIMIT 1`,
          [inv.id]
        );
        const count = (await pool.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM invoice_orders WHERE invoice_id = $1", [inv.id])).rows[0].n;
        const first = orders.rows[0];
        created = await provider.createInvoice(ctx, {
          contactId: inv.ext_contact_id!,
          buyer: buyerOf(inv),
          issueDate: inv.issue_date,
          series,
          number: inv.id,
          description: count > 1 ? `${count} sipariş` : `Sipariş ${first?.order_no ?? ""}`.trim(),
          note: inv.plate_note,
          // Tek siparişli faturada sipariş no/tarihi (ikisi birlikte zorunlu).
          orderNo: count === 1 && first ? first.order_no : null,
          orderDate: count === 1 && first ? first.created_at : null,
          lines: await ensureProducts(provider, ctx, inv.tenant_id, inv),
        });
      }
      await save(inv.id, { ext_invoice_id: created.id, provider_gross_total: created.grossTotal });
      if (!withinProviderTolerance(Number(inv.gross_total), created.grossTotal)) {
        // Resmileştirmeden önce taslağı sağlayıcıdan sil — yanlış tutarlı fatura GİB'e gitmesin.
        await provider.deleteInvoice(ctx, created.id).catch(() => {});
        await save(inv.id, { ext_invoice_id: null, step: "invoice" });
        throw new ProviderError(`Sağlayıcının hesapladığı toplam (${created.grossTotal.toFixed(2)} ₺) siparişle (${Number(inv.gross_total).toFixed(2)} ₺) uyuşmuyor.`, false);
      }
      await save(inv.id, { step: "formalize" });
      Object.assign(inv, { ext_invoice_id: created.id, step: "formalize" });
      return true;
    }
    case "formalize": {
      // Önceki deneme resmileştirmiş ama sonucu yazamamış olabilir.
      const existing = await provider.getActiveDocument(ctx, inv.ext_invoice_id!);
      if (existing) {
        await save(inv.id, { status: "ISLENIYOR", step: "poll", ext_job_id: null });
        Object.assign(inv, { status: "ISLENIYOR", step: "poll", ext_job_id: null });
        return true;
      }
      const tax = inv.buyer_tax_number ?? "";
      const inbox = tax && tax !== ANONYMOUS_TCKN ? await provider.lookupInbox(ctx, tax) : [];
      const preferred = inv.customer_id
        ? (await pool.query<{ einvoice_alias: string | null }>("SELECT einvoice_alias FROM customers WHERE id = $1 AND tenant_id = $2", [inv.customer_id, inv.tenant_id])).rows[0]?.einvoice_alias
        : null;
      const alias = inbox.length === 0 ? null : (inbox.find((e) => e.alias === preferred) ?? inbox[0]).alias;
      const docType = alias ? "e_fatura" : "e_arsiv";
      const scenario = alias ? "basic" : null;
      const { jobId } = await provider.formalize(ctx, { invoiceId: inv.ext_invoice_id!, docType, scenario, alias });
      const fields = { doc_type: docType, scenario, buyer_alias: alias, ext_job_id: jobId, ext_job_started_at: new Date().toISOString(), status: "ISLENIYOR", step: "poll" };
      await save(inv.id, fields);
      Object.assign(inv, fields);
      return true;
    }
    case "poll": {
      if (inv.ext_job_id) {
        const expired = inv.ext_job_started_at && Date.now() - new Date(inv.ext_job_started_at).getTime() > JOB_TTL_MS;
        if (!expired) {
          const job = await provider.getJob(ctx, inv.ext_job_id);
          if (job.status === "error") {
            // Başarısız iş tekrar sorulmaz — "Tekrar Dene" yeniden resmileştirir
            // (formalize adımı önce aktif belge var mı diye bakar).
            await save(inv.id, { step: "formalize", ext_job_id: null });
            throw new ProviderError(job.errors.join(" ") || "Resmileştirme başarısız.", false);
          }
          if (job.status !== "done") return false;
        }
      }
      const doc = await provider.getActiveDocument(ctx, inv.ext_invoice_id!);
      if (!doc) {
        // İş bitti/süresi doldu ama belge yok → resmileştirme yeniden denenmeli.
        await save(inv.id, { step: "formalize", ext_job_id: null });
        throw new ProviderError("Fatura resmileştirilemedi (belge bulunamadı). Tekrar deneyin.");
      }
      const fields = {
        doc_type: doc.docType, ext_document_id: doc.documentId, gib_invoice_no: doc.gibInvoiceNo, ettn: doc.ettn,
        cancellable_until: doc.cancellableUntil, response_type: doc.responseType, step: "pdf",
      };
      await save(inv.id, fields);
      Object.assign(inv, fields);
      return true;
    }
    case "pdf": {
      const url = await provider.getPdfUrl(ctx, { docType: inv.doc_type!, documentId: inv.ext_document_id! });
      if (!url) return false;
      await save(inv.id, { step: "payment" });
      inv.step = "payment";
      return true;
    }
    case "payment": {
      if (conn.record_payments) await recordPayments(provider, ctx, inv);
      await save(inv.id, { step: "done", status: "RESMILESTI", error_message: null });
      Object.assign(inv, { step: "done", status: "RESMILESTI", error_message: null });
      return true;
    }
    default:
      return false;
  }
}

// Siparişlerin ödemeleri, kasası sağlayıcı hesabına eşlenmişse tahsilat
// olarak işlenir. Cari ile kapanan kısım açık alacak kalır. Hata faturayı
// bozmaz — yalnızca not düşülür.
async function recordPayments(provider: EInvoiceProvider, ctx: ProviderContext, inv: InvoiceRow) {
  const payments = await pool.query<{ amount: string; payment_type: string; created_at: string; ext_account_id: string | null }>(
    `SELECT p.amount, p.payment_type, to_char(p.created_at, 'YYYY-MM-DD') AS created_at, k.ext_account_id
     FROM invoice_orders io
     JOIN order_payments p ON p.order_id = io.order_id
     LEFT JOIN kasalar k ON k.id = p.kasa_id AND k.tenant_id = io.tenant_id
     WHERE io.invoice_id = $1 AND p.payment_type <> 'Cari'`,
    [inv.id]
  );
  try {
    for (const p of payments.rows) {
      if (!p.ext_account_id) continue;
      await provider.addPayment(ctx, { invoiceId: inv.ext_invoice_id!, accountId: p.ext_account_id, date: p.created_at, amount: Number(p.amount), description: p.payment_type });
    }
  } catch (err) {
    await save(inv.id, { error_message: `Fatura kesildi ama tahsilat sağlayıcıya işlenemedi: ${err instanceof Error ? err.message : "bilinmeyen hata"}` });
  }
}

// Faturayı bekleme noktasına kadar ilerletir (en fazla maxSteps adım).
// Başka bir istek işliyorsa dokunmadan güncel hâli döner.
export async function advanceInvoice(tenantId: number, invoiceId: number, maxSteps = 6): Promise<InvoiceRow | null> {
  const inv = await claim(tenantId, invoiceId);
  if (!inv) return getInvoice(tenantId, invoiceId);
  try {
    const conn = await requireActiveConnection(tenantId);
    const provider = getProvider(conn);
    const ctx = providerContext(conn);
    for (let i = 0; i < maxSteps && inv.step !== "done"; i++) {
      if (!(await runStep(provider, ctx, conn, inv))) break;
    }
  } catch (err) {
    const message = err instanceof InvoiceError || err instanceof ProviderError ? err.message : "Beklenmeyen bir hata oluştu.";
    if (!(err instanceof InvoiceError || err instanceof ProviderError)) console.error("Fatura ilerletme hatası:", { invoiceId, err });
    if (err instanceof ProviderAuthError) await pool.query("UPDATE einvoice_connections SET status = 'reauth', last_error = $2 WHERE tenant_id = $1", [tenantId, message]);
    await pool.query("UPDATE invoices SET status = 'HATA', error_message = $2, attempts = attempts + 1, updated_at = NOW() WHERE id = $1", [invoiceId, message]);
  } finally {
    await release(invoiceId);
  }
  return getInvoice(tenantId, invoiceId);
}

// "Tekrar Dene": HATA'daki faturayı kaldığı adımdan sürdürür.
export async function retryInvoice(tenantId: number, invoiceId: number): Promise<InvoiceRow | null> {
  const r = await pool.query(
    `UPDATE invoices SET status = CASE WHEN step IN ('contact', 'invoice', 'formalize') THEN 'HAZIRLANIYOR' ELSE 'ISLENIYOR' END,
                         error_message = NULL, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND status = 'HATA'`,
    [invoiceId, tenantId]
  );
  if (r.rowCount === 0) throw new InvoiceError("Yalnızca hatalı fatura tekrar denenebilir.", 409);
  return advanceInvoice(tenantId, invoiceId);
}

// İptal (§7): resmileşmiş e-Arşiv iptal süresi içindeyse sağlayıcıda iptal;
// hatalı/yarım faturadan vazgeçmek de buradan (resmileşmemiş taslak silinir).
// İki durumda da siparişler serbest kalır.
export async function cancelInvoice(tenantId: number, invoiceId: number): Promise<InvoiceRow | null> {
  const inv = await getInvoice(tenantId, invoiceId);
  if (!inv) throw new InvoiceError("Fatura bulunamadı.", 404);
  const conn = await requireActiveConnection(tenantId);
  const provider = getProvider(conn);
  const ctx = providerContext(conn);

  if (inv.status === "RESMILESTI") {
    if (inv.doc_type !== "e_arsiv") throw new InvoiceError("e-Fatura uygulamadan iptal edilemez; iade/iptal sağlayıcı panelinden yapılır.", 409);
    if (!inv.cancellable_until || new Date(inv.cancellable_until).getTime() < Date.now()) {
      throw new InvoiceError("İptal süresi geçti (7 gün). İade faturası ya da gider pusulası sağlayıcı panelinden düzenlenir.", 409);
    }
    await provider.cancelInvoice(ctx, inv.ext_invoice_id!);
  } else if (inv.status === "HATA") {
    if (inv.ext_invoice_id) {
      const doc = await provider.getActiveDocument(ctx, inv.ext_invoice_id);
      if (doc) throw new InvoiceError("Bu fatura sağlayıcıda resmileşmiş görünüyor. Önce 'Tekrar Dene' ile durumunu güncelleyin.", 409);
      await provider.deleteInvoice(ctx, inv.ext_invoice_id);
    }
  } else {
    throw new InvoiceError("Bu durumdaki fatura iptal edilemez.", 409);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("UPDATE invoices SET status = 'IPTAL', processing_until = NULL, updated_at = NOW() WHERE id = $1 AND tenant_id = $2", [invoiceId, tenantId]);
    await client.query("UPDATE invoice_orders SET active = false WHERE invoice_id = $1 AND tenant_id = $2", [invoiceId, tenantId]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  return getInvoice(tenantId, invoiceId);
}

// PDF dosya adı: GİB fatura no sağlayıcıdan gelir ve Content-Disposition
// başlığına yazılır — yalnızca güvenli karakterler (tırnak/satır sonu
// başlığı bozamasın).
export function invoicePdfFileName(inv: Pick<InvoiceRow, "id" | "gib_invoice_no">): string {
  const base = (inv.gib_invoice_no ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
  return `${base || `fatura-${inv.id}`}.pdf`;
}

// PDF'i sağlayıcıdan taze alıp akıtır (saklanmaz, §2).
export async function fetchInvoicePdf(tenantId: number, inv: InvoiceRow): Promise<Response> {
  if (!inv.ext_document_id || !inv.doc_type) throw new InvoiceError("Faturanın PDF'i henüz hazır değil.", 409);
  const conn = await requireActiveConnection(tenantId);
  const provider = getProvider(conn);
  const ctx = providerContext(conn);
  const url = await provider.getPdfUrl(ctx, { docType: inv.doc_type, documentId: inv.ext_document_id });
  if (!url) throw new InvoiceError("Faturanın PDF'i henüz hazır değil. Biraz sonra tekrar deneyin.", 409);
  return provider.fetchPdf(ctx, url);
}
