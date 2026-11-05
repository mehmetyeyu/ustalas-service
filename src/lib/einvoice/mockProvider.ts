// Geliştirme için sahte e-belge sağlayıcı (docs/e-fatura-tasarim.md §10,
// Faz 0). Gerçek Paraşüt erişimi gelmeden bütün akış (fatura kes → işleniyor
// → resmileşti → PDF, hata, iptal) dev'de uçtan uca denenebilsin. Üretimde
// kullanılamaz (getProvider bunu engeller).
//
// Davranış:
// - 10 haneli VKN'nin e-Fatura gelen kutusu vardır (→ e-Fatura), TCKN'nin
//   yoktur (→ e-Arşiv).
// - Alıcı adında "HATA" geçerse resmileştirme işi hatayla biter.
// - İş 4 sn sonra biter, PDF ondan 2 sn sonra hazır olur.
// Durum globalThis'te tutulur (dev'de sıcak yeniden yüklemeden etkilenmez);
// sunucu yeniden başlarsa resmileşmiş belge bilgisi kaybolur — o zaman motor
// belgeyi bulamaz ve "Tekrar Dene" yeniden resmileştirir. Yalnızca dev.
import type { EInvoiceProvider, ProviderDocument } from "./provider";
import { ProviderError } from "./provider";

interface MockDoc extends ProviderDocument {
  createdAt: number;
}

const store = ((globalThis as { __einvoiceMock?: Map<string, MockDoc> }).__einvoiceMock ??= new Map<string, MockDoc>());

const JOB_MS = 4000;
const PDF_MS = 2000;

function hash(s: string): string {
  let h = 0;
  for (const ch of s) h = (Math.imul(31, h) + ch.charCodeAt(0)) | 0;
  return (h >>> 0).toString(36);
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Türkçe harfleri ASCII'ye indirger — sahte PDF standart yazı tipini kullanır.
function ascii(s: string): string {
  return s.replace(/[çÇğĞıİöÖşŞüÜ]/g, (c) => ({ ç: "c", Ç: "C", ğ: "g", Ğ: "G", ı: "i", İ: "I", ö: "o", Ö: "O", ş: "s", Ş: "S", ü: "u", Ü: "U" })[c] ?? c)
    .replace(/[^\x20-\x7e]/g, "?").replace(/[()\\]/g, "\\$&");
}

// Tek sayfalık geçerli bir PDF (elle yazılmış, bağımlılıksız).
function tinyPdf(lines: string[]): Uint8Array {
  const text = lines.map((l, i) => `BT /F1 ${i === 0 ? 16 : 11} Tf 50 ${780 - i * 22} Td (${ascii(l)}) Tj ET`).join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(body);
}

export const mockProvider: EInvoiceProvider = {
  name: "mock",

  async upsertContact(_ctx, buyer, existingId) {
    const base = (existingId ?? `mc-${hash(`${buyer.taxNumber}|${buyer.name}`)}`).replace(/-err$/, "");
    // Hata senaryosu kişi kimliğinde taşınır (bkz. dosya başı).
    return /HATA/i.test(buyer.name) ? `${base}-err` : base;
  },

  async ensureProduct(_ctx, { name, vatRate }) {
    return `mp-${hash(`${name}|${vatRate}`)}`;
  },

  async findInvoice() {
    return null;
  },

  async createInvoice(_ctx, input) {
    const grossTotal = round2(input.lines.reduce((s, l) => s + round2((l.quantity * l.unitPriceNet - l.discountNet) * (1 + l.vatRate / 100)), 0));
    return { id: `mi-${input.number}${input.contactId.endsWith("-err") ? "-err" : ""}`, grossTotal };
  },

  async deleteInvoice(_ctx, invoiceId) {
    store.delete(invoiceId);
  },

  async getActiveDocument(_ctx, invoiceId) {
    const doc = store.get(invoiceId);
    if (!doc) return null;
    const { createdAt: _c, ...rest } = doc;
    return rest;
  },

  async lookupInbox(_ctx, taxNumber) {
    return /^\d{10}$/.test(taxNumber) ? [{ alias: `urn:mail:defaultpk@${taxNumber}.mock`, registeredAt: "2020-01-01T00:00:00Z" }] : [];
  },

  async formalize(_ctx, { invoiceId, docType }) {
    if (store.has(invoiceId)) throw new ProviderError("Bu fatura zaten resmileştirilmiş.", false, 422);
    return { jobId: `mj|${docType}|${invoiceId}|${Date.now()}` };
  },

  async getJob(_ctx, jobId) {
    const [, docType, invoiceId, ts] = jobId.split("|");
    if (Date.now() - Number(ts) < JOB_MS) return { status: "running", errors: [] };
    if (invoiceId.endsWith("-err")) return { status: "error", errors: ["Alıcı bilgileri GİB tarafından reddedildi (sahte hata — alıcı adında HATA var)."] };
    if (!store.has(invoiceId)) {
      const n = invoiceId.replace(/\D/g, "").padStart(9, "0");
      store.set(invoiceId, {
        docType: docType as "e_arsiv" | "e_fatura",
        documentId: `md-${invoiceId}`,
        gibInvoiceNo: `MCK${new Date().getFullYear()}${n}`,
        ettn: crypto.randomUUID(),
        cancellableUntil: docType === "e_arsiv" ? new Date(Date.now() + 7 * 86_400_000).toISOString() : null,
        responseType: null,
        createdAt: Date.now(),
      });
    }
    return { status: "done", errors: [] };
  },

  async getPdfUrl(_ctx, { documentId }) {
    const doc = Array.from(store.values()).find((d) => d.documentId === documentId);
    if (!doc || Date.now() - doc.createdAt < PDF_MS) return null;
    return `mock://pdf/${documentId}`;
  },

  async fetchPdf(_ctx, url) {
    const documentId = url.replace("mock://pdf/", "");
    const doc = Array.from(store.values()).find((d) => d.documentId === documentId);
    const bytes = tinyPdf([
      "SAHTE FATURA - GECERSIZ (gelistirme)",
      `Tur: ${doc?.docType === "e_fatura" ? "e-Fatura" : "e-Arsiv"}`,
      `Fatura No: ${doc?.gibInvoiceNo ?? "-"}`,
      `ETTN: ${doc?.ettn ?? "-"}`,
      "Bu belge sahte saglayici tarafindan uretildi.",
    ]);
    return new Response(bytes as BodyInit, { headers: { "Content-Type": "application/pdf" } });
  },

  async addPayment() {},

  async cancelInvoice(_ctx, invoiceId) {
    store.delete(invoiceId);
  },
};
