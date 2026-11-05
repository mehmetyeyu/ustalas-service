// e-Belge sağlayıcı arayüzü (docs/e-fatura-tasarim.md §2). Fatura motoru
// (engine.ts) yalnızca bunu bilir; Paraşüt'e özgü her şey parasut.ts'te,
// geliştirme için sahte sağlayıcı mockProvider.ts'te. İleride İşNet vb.
// aynı arayüzle eklenir. Her metot tek bir dış işlem yapar — motor her
// adımın sonucunu veritabanına yazdıktan sonra sıradakine geçer.

export type ProviderName = "parasut" | "mock";

// Motorun sağlayıcıya verdiği bağlantı bağlamı. Token yönetimi sağlayıcının
// işidir (connection satırından okur/yeniler).
export interface ProviderContext {
  tenantId: number;
  externalCompanyId: string;
}

export interface BuyerInfo {
  name: string;
  taxNumber: string;             // VKN/TCKN; anonimse ANONYMOUS_TCKN
  taxOffice: string | null;
  address: string | null;
  city: string | null;
  district: string | null;
  email: string | null;
  phone: string | null;
  isCompany: boolean;
}

export interface ProviderInvoiceLine {
  productId: string;
  description: string;
  quantity: number;
  unitPriceNet: number;
  vatRate: number;
  discountNet: number;
}

export interface CreateInvoiceInput {
  contactId: string;
  issueDate: string;             // YYYY-MM-DD
  series: string;
  number: number;                // bizim invoices.id — tekrar kontrolü için
  description: string;
  note: string | null;           // plaka vb.
  orderNo: string | null;
  orderDate: string | null;      // orderNo ile birlikte dolu ya da ikisi de boş
  lines: ProviderInvoiceLine[];
}

export interface ProviderDocument {
  docType: "e_arsiv" | "e_fatura";
  documentId: string;
  gibInvoiceNo: string | null;
  ettn: string | null;
  cancellableUntil: string | null;
  responseType: string | null;   // e-Fatura ticari: accepted | rejected | refunded
}

export interface InboxEntry {
  alias: string;
  registeredAt: string | null;
}

export type JobStatus = "pending" | "running" | "done" | "error";

export interface EInvoiceProvider {
  name: ProviderName;
  upsertContact(ctx: ProviderContext, buyer: BuyerInfo, existingId: string | null): Promise<string>;
  ensureProduct(ctx: ProviderContext, input: { name: string; vatRate: number }): Promise<string>;
  findInvoice(ctx: ProviderContext, series: string, number: number): Promise<{ id: string; grossTotal: number } | null>;
  createInvoice(ctx: ProviderContext, input: CreateInvoiceInput): Promise<{ id: string; grossTotal: number }>;
  deleteInvoice(ctx: ProviderContext, invoiceId: string): Promise<void>;
  getActiveDocument(ctx: ProviderContext, invoiceId: string): Promise<ProviderDocument | null>;
  lookupInbox(ctx: ProviderContext, taxNumber: string): Promise<InboxEntry[]>;
  formalize(ctx: ProviderContext, input: { invoiceId: string; docType: "e_arsiv" | "e_fatura"; scenario: "basic" | "commercial" | null; alias: string | null }): Promise<{ jobId: string }>;
  getJob(ctx: ProviderContext, jobId: string): Promise<{ status: JobStatus; errors: string[] }>;
  // null = henüz hazır değil (Paraşüt 204). Dönen URL kısa ömürlüdür.
  getPdfUrl(ctx: ProviderContext, doc: { docType: "e_arsiv" | "e_fatura"; documentId: string }): Promise<string | null>;
  fetchPdf(ctx: ProviderContext, url: string): Promise<Response>;
  addPayment(ctx: ProviderContext, input: { invoiceId: string; accountId: string; date: string; amount: number; description: string }): Promise<void>;
  cancelInvoice(ctx: ProviderContext, invoiceId: string): Promise<void>;
}

// Sağlayıcı hatası. message kullanıcıya gösterilir (Türkçe); retriable=false
// ise "Tekrar Dene" aynı sonucu verir (ör. geçersiz vergi no), kullanıcı
// bilgiyi düzeltmelidir.
export class ProviderError extends Error {
  constructor(message: string, readonly retriable = true, readonly status?: number) {
    super(message);
    this.name = "ProviderError";
  }
}

// Bağlantı yeniden yetkilendirme istiyor (refresh token geçersiz).
export class ProviderAuthError extends ProviderError {
  constructor(message = "Sağlayıcı bağlantısının yenilenmesi gerekiyor (Ayarlar → e-Fatura).") {
    super(message, false, 401);
    this.name = "ProviderAuthError";
  }
}
