// Paraşüt e-belge sağlayıcısı (EInvoiceProvider). İstek biçimleri:
// docs/parasut-api-referans.md (§3 kişi, §4 ürün, §5 satış faturası, §6
// tahsilat, §7 gelen kutusu, §8 resmileştirme, §9 PDF, §10 iptal). Token ve
// 401/403/429 davranışı parasutAuth.ts'te. Her metot tek bir mantıksal dış
// işlem yapar; motor (engine.ts) sonucu yazdıktan sonra sıradakine geçer.
//
// Paraşüt'ün tuzakları: unit_price KDV HARİÇ; satış faturasında "net_total"
// = Genel Toplam (KDV dahil), "gross_total" = Ara toplam; e_invoices
// ilişkisi "invoice", e_archives ilişkisi "sales_invoice"; para birimi TRL.
import type { BuyerInfo, EInvoiceProvider, JobStatus, ProviderContext, ProviderDocument } from "./provider";
import { ProviderError } from "./provider";
import { parasutRequest } from "./parasutAuth";
import { ANONYMOUS_TCKN } from "../taxId";

type JsonApiItem = { id: string; type: string; attributes?: Record<string, unknown>; relationships?: Record<string, { data?: { id: string; type: string } | null }> };
type JsonApiDoc = { data?: JsonApiItem | JsonApiItem[]; included?: JsonApiItem[]; meta?: Record<string, unknown> };

// Paraşüt sayıları bazen metin döndürür ("118.0").
function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

// Paraşüt hata gövdesi: { errors: [{ title, detail }] }.
function errorMessage(body: unknown, status: number): string {
  const errors = (body as { errors?: { title?: string; detail?: string }[] } | null)?.errors ?? [];
  const parts = errors.map((e) => e.detail || e.title).filter(Boolean);
  return parts.length ? `Paraşüt: ${parts.join(" ")}` : `Paraşüt isteği başarısız (HTTP ${status}).`;
}

async function call(ctx: ProviderContext, method: string, path: string, body?: unknown): Promise<JsonApiDoc | null> {
  const res = await parasutRequest(ctx.tenantId, `/${ctx.externalCompanyId}${path}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return null;
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // HTML hata sayfası vb.
  }
  if (!res.ok) {
    // 400/404/422: isteğin kendisi hatalı — tekrar denemek aynı sonucu verir.
    throw new ProviderError(errorMessage(json, res.status), res.status >= 500, res.status);
  }
  return json as JsonApiDoc;
}

function one(doc: JsonApiDoc | null): JsonApiItem {
  const d = doc?.data;
  if (!d || Array.isArray(d)) throw new ProviderError("Paraşüt beklenmeyen bir yanıt döndürdü.");
  return d;
}

function many(doc: JsonApiDoc | null): JsonApiItem[] {
  const d = doc?.data;
  return Array.isArray(d) ? d : [];
}

function contactAttributes(buyer: BuyerInfo) {
  return {
    name: buyer.name,
    contact_type: buyer.isCompany ? "company" : "person",
    account_type: "customer",
    tax_number: buyer.taxNumber,
    tax_office: buyer.taxOffice ?? "",
    email: buyer.email ?? undefined,
    phone: buyer.phone ?? undefined,
    address: buyer.address ?? "",
    city: buyer.city ?? "",
    district: buyer.district ?? "",
    country: "Türkiye",
    is_abroad: false,
  };
}

function q(params: Record<string, string>): string {
  return "?" + new URLSearchParams(params).toString();
}

function toDocument(item: JsonApiItem, invoiceNo: string | null): ProviderDocument | null {
  const a = item.attributes ?? {};
  if (item.type === "e_archives") {
    return {
      docType: "e_arsiv",
      documentId: String(item.id),
      gibInvoiceNo: str(a.invoice_number) ?? invoiceNo,
      ettn: str(a.uuid),
      cancellableUntil: str(a.cancellable_until),
      responseType: null,
    };
  }
  if (item.type === "e_invoices") {
    return {
      docType: "e_fatura",
      documentId: String(item.id),
      gibInvoiceNo: invoiceNo,
      ettn: str(a.uuid),
      cancellableUntil: null,
      responseType: str(a.response_type),
    };
  }
  return null;
}

export const parasutProvider: EInvoiceProvider = {
  name: "parasut",

  async upsertContact(ctx, buyer, existingId) {
    const attributes = contactAttributes(buyer);
    if (existingId) {
      try {
        await call(ctx, "PUT", `/contacts/${existingId}`, { data: { id: existingId, type: "contacts", attributes } });
        return existingId;
      } catch (err) {
        // Paraşüt'te silinmişse yeniden oluşturulur.
        if (!(err instanceof ProviderError && err.status === 404)) throw err;
      }
    }
    // Aynı vergi no'lu kişi varsa onu kullan (Paraşüt'te elle açılmış olabilir).
    // Anonim TCKN'de vergi no herkes için aynı — adı da tutmalı.
    const found = many(await call(ctx, "GET", `/contacts${q({ "filter[tax_number]": buyer.taxNumber, "filter[account_type]": "customer", "page[size]": "25" })}`));
    const match = buyer.taxNumber === ANONYMOUS_TCKN
      ? found.find((c) => str(c.attributes?.name)?.toLocaleLowerCase("tr") === buyer.name.trim().toLocaleLowerCase("tr"))
      : found.find((c) => str(c.attributes?.tax_number) === buyer.taxNumber);
    if (match) {
      await call(ctx, "PUT", `/contacts/${match.id}`, { data: { id: match.id, type: "contacts", attributes } });
      return String(match.id);
    }
    return String(one(await call(ctx, "POST", "/contacts", { data: { type: "contacts", attributes } })).id);
  },

  async ensureProduct(ctx, { name, vatRate }) {
    // Motor sonucu einvoice_product_map'te önbellekler; buraya ürün başına bir kez gelinir.
    const found = many(await call(ctx, "GET", `/products${q({ "filter[name]": name, "page[size]": "25" })}`));
    const match = found.find((p) => str(p.attributes?.name) === name && num(p.attributes?.vat_rate) === vatRate && !p.attributes?.archived);
    if (match) return String(match.id);
    const created = one(await call(ctx, "POST", "/products", {
      data: { type: "products", attributes: { name, vat_rate: vatRate, currency: "TRL", inventory_tracking: false } },
    }));
    return String(created.id);
  },

  async findInvoice(ctx, series, number) {
    const found = many(await call(ctx, "GET", `/sales_invoices${q({ "filter[invoice_series]": series, "filter[invoice_id]": String(number), "filter[item_type]": "invoice" })}`));
    const inv = found.find((i) => str(i.attributes?.invoice_series) === series && num(i.attributes?.invoice_id) === number);
    return inv ? { id: String(inv.id), grossTotal: num(inv.attributes?.net_total) } : null;
  },

  async createInvoice(ctx, input) {
    const b = input.buyer;
    const attributes: Record<string, unknown> = {
      item_type: "invoice",
      issue_date: input.issueDate,
      due_date: input.issueDate,
      description: input.description,
      currency: "TRL",
      invoice_series: input.series,
      invoice_id: input.number,
      tax_number: b.taxNumber,
      tax_office: b.taxOffice ?? "",
      billing_address: b.address ?? "",
      city: b.city ?? "",
      district: b.district ?? "",
      country: "Türkiye",
      is_abroad: false,
      // Stok Paraşüt'te tutulmuyor — irsaliyesiz fatura stok hareketi açmaz.
      shipment_included: false,
      cash_sale: false,
    };
    if (input.note) attributes.invoice_note = input.note;
    // İkisi birlikte ya da hiç (resmileştirme kuralı).
    if (input.orderNo && input.orderDate) {
      attributes.order_no = input.orderNo;
      attributes.order_date = input.orderDate;
    }
    const details = input.lines.map((l) => ({
      type: "sales_invoice_details",
      attributes: {
        quantity: l.quantity,
        unit_price: l.unitPriceNet,
        vat_rate: l.vatRate,
        description: l.description,
        ...(l.discountNet > 0 ? { discount_type: "amount", discount_value: l.discountNet } : {}),
      },
      relationships: { product: { data: { id: l.productId, type: "products" } } },
    }));
    const created = one(await call(ctx, "POST", "/sales_invoices", {
      data: {
        type: "sales_invoices",
        attributes,
        relationships: { contact: { data: { id: input.contactId, type: "contacts" } }, details: { data: details } },
      },
    }));
    return { id: String(created.id), grossTotal: num(created.attributes?.net_total) };
  },

  async deleteInvoice(ctx, invoiceId) {
    try {
      await call(ctx, "DELETE", `/sales_invoices/${invoiceId}`);
    } catch (err) {
      if (!(err instanceof ProviderError && err.status === 404)) throw err;
    }
  },

  async getActiveDocument(ctx, invoiceId) {
    const doc = await call(ctx, "GET", `/sales_invoices/${invoiceId}${q({ include: "active_e_document" })}`);
    const inv = one(doc);
    const ref = inv.relationships?.active_e_document?.data;
    if (!ref) return null;
    const item = (doc?.included ?? []).find((i) => i.type === ref.type && String(i.id) === String(ref.id)) ?? { id: ref.id, type: ref.type };
    return toDocument(item, str(inv.attributes?.invoice_no));
  },

  async lookupInbox(ctx, taxNumber) {
    const found = many(await call(ctx, "GET", `/e_invoice_inboxes${q({ "filter[vkn]": taxNumber, "page[size]": "25" })}`));
    return found
      .map((i) => ({ alias: str(i.attributes?.e_invoice_address) ?? "", registeredAt: str(i.attributes?.address_registered_at) ?? str(i.attributes?.registered_at) }))
      .filter((i) => i.alias);
  },

  async formalize(ctx, { invoiceId, docType, scenario, alias }) {
    const body = docType === "e_fatura"
      ? { data: { type: "e_invoices", attributes: { scenario: scenario ?? "basic", to: alias }, relationships: { invoice: { data: { id: invoiceId, type: "sales_invoices" } } } } }
      : { data: { type: "e_archives", attributes: {}, relationships: { sales_invoice: { data: { id: invoiceId, type: "sales_invoices" } } } } };
    const job = one(await call(ctx, "POST", docType === "e_fatura" ? "/e_invoices" : "/e_archives", body));
    return { jobId: String(job.id) };
  },

  async getJob(ctx, jobId) {
    const job = one(await call(ctx, "GET", `/trackable_jobs/${jobId}`));
    const raw = str(job.attributes?.status) ?? "pending";
    const status: JobStatus = raw === "done" || raw === "error" || raw === "running" ? raw : "pending";
    const errors = Array.isArray(job.attributes?.errors) ? (job.attributes.errors as unknown[]).map(String) : [];
    return { status, errors };
  },

  async getPdfUrl(ctx, { docType, documentId }) {
    // 204 = PDF henüz hazır değil. URL 1 saat geçerli, müşteriyle paylaşılmaz.
    const doc = await call(ctx, "GET", `/${docType === "e_fatura" ? "e_invoices" : "e_archives"}/${documentId}/pdf`);
    return doc ? str(one(doc).attributes?.url) : null;
  },

  async fetchPdf(_ctx, url) {
    // İmzalı, kısa ömürlü adres — token gönderilmez. Adres Paraşüt'ün
    // yanıtından gelir; yine de yalnızca https'e gidilir.
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new ProviderError("Paraşüt geçersiz bir PDF adresi döndürdü.", false);
    }
    if (parsed.protocol !== "https:") throw new ProviderError("Paraşüt geçersiz bir PDF adresi döndürdü.", false);
    try {
      return await fetch(url, { cache: "no-store" });
    } catch {
      throw new ProviderError("Paraşüt'ten PDF indirilemedi.");
    }
  },

  async addPayment(ctx, { invoiceId, accountId, date, amount, description }) {
    await call(ctx, "POST", `/sales_invoices/${invoiceId}/payments`, {
      data: { type: "payments", attributes: { account_id: Number(accountId), date, amount, exchange_rate: 1, description } },
    });
  },

  async cancelInvoice(ctx, invoiceId) {
    await call(ctx, "DELETE", `/sales_invoices/${invoiceId}/cancel`);
  },
};
