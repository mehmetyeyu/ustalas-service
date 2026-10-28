import { escapeHtml } from "./htmlEscape";
import { formatCurrency } from "./format";
import { normalizeToE164TR } from "./phone";
import { formatISODate, type QuoteTotals, type VatMode, type VatRate } from "./quotes";

// Müşteriye giden teklif belgeleri — yazdırılan/PDF'e kaydedilen çıktı ve
// WhatsApp mesajı. Saf fonksiyonlar (bkz. quoteDocument.test.ts); pencereyi
// açan/linki kuran kod teklif detay sayfasında. Maliyet/kâr bilerek hiçbir
// alanda yok — tipte bile alınmıyor ki yanlışlıkla basılamasın.

export interface QuoteDocLine {
  service_name: string;
  size_desc: string | null;
  brand: string | null;
  model_name: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface QuoteDoc {
  quote_no: string;
  customer_name: string | null;
  customer_phone: string | null;
  plate: string | null;
  vat_mode: VatMode;
  vat_rate: VatRate;
  valid_until: string;
  notes: string | null;
  created_at: string;
  totals: QuoteTotals;
  lines: QuoteDocLine[];
}

export interface CompanyDoc {
  name: string;
  phone: string | null;
  taxIdLabel: string;
  taxId: string | null;
  taxOffice: string | null;
  address: string | null;
  logoUrl: string | null;
  stampUrl: string | null;
}

// "Lastik Satışı — 205/55R16 Michelin Primacy 4"
function lineLabel(l: QuoteDocLine): string {
  const detail = [l.size_desc, l.brand, l.model_name].filter(Boolean).join(" ");
  return detail ? `${l.service_name} — ${detail}` : l.service_name;
}

function issueDate(createdAt: string): string {
  return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Istanbul" }).format(new Date(createdAt));
}

// İş Emri çıktısıyla (bkz. printWorkOrder, admin/orders/[id]/page.tsx) aynı
// desen ve görünüm: düz HTML, yeni pencerede yazdırma diyaloğu açılır —
// "PDF olarak kaydet" de buradan yapılır.
export function buildQuotePrintHtml(q: QuoteDoc, company: CompanyDoc | null): string {
  const vatNote = q.vat_mode === "dahil" ? "Birim fiyatlara KDV dahildir." : "Birim fiyatlara KDV dahil değildir; KDV toplamda ayrıca eklenmiştir.";
  const rows = q.lines.map((l) => `
      <tr>
        <td>${escapeHtml(lineLabel(l))}</td>
        <td class="c">${l.quantity}</td>
        <td class="r">${formatCurrency(l.unit_price)}</td>
        <td class="r">${formatCurrency(l.line_total)}</td>
      </tr>`).join("");
  const taxLine = [
    company?.phone ? "Tel: " + escapeHtml(company.phone) : "",
    company?.taxOffice ? escapeHtml(company.taxOffice) : "",
    company?.taxId ? escapeHtml(company.taxIdLabel) + ": " + escapeHtml(company.taxId) : "",
  ].filter(Boolean).join(" · ");

  return `<!DOCTYPE html>
<html lang="tr"><head><meta charset="UTF-8"><title>Teklif ${escapeHtml(q.quote_no)}${q.customer_name ? " - " + escapeHtml(q.customer_name) : ""}</title>
<style>
  @page { size: A4 portrait; margin: 15mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; color: #222; font-size: 11pt; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 6mm; border-bottom: 2px solid #222; padding-bottom: 8mm; margin-bottom: 8mm; }
  .logo { max-height: 18mm; max-width: 50mm; object-fit: contain; margin-bottom: 3mm; }
  .company h1 { font-size: 16pt; margin: 0 0 2mm; }
  .company div { font-size: 9pt; color: #555; }
  .title { text-align: right; white-space: nowrap; }
  .title h2 { font-size: 20pt; margin: 0; }
  .title div { font-size: 9pt; color: #555; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4mm; margin-bottom: 8mm; font-size: 10pt; }
  .info-grid .lbl { color: #777; font-size: 8.5pt; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 3mm 2mm; border-bottom: 1px solid #ddd; text-align: left; font-size: 10pt; }
  th { border-bottom: 2px solid #222; font-size: 9pt; color: #555; text-transform: uppercase; }
  td.c, th.c { text-align: center; }
  td.r, th.r { text-align: right; white-space: nowrap; }
  .totals { margin: 4mm 0 8mm auto; width: 75mm; font-size: 10pt; }
  .totals div { display: flex; justify-content: space-between; padding: 1.2mm 0; }
  .totals .grand { border-top: 2px solid #222; margin-top: 1.5mm; padding-top: 2.5mm; font-weight: bold; font-size: 13pt; }
  .vat-note { font-size: 8.5pt; color: #777; text-align: right; margin-top: -6mm; margin-bottom: 8mm; }
  .notes { margin-bottom: 8mm; font-size: 10pt; white-space: pre-wrap; }
  .notes .lbl { color: #777; font-size: 8.5pt; }
  .validity { font-size: 10pt; padding: 3mm 4mm; border: 1px solid #ddd; border-radius: 2mm; margin-bottom: 10mm; }
  .footer { display: flex; justify-content: space-between; margin-top: 16mm; }
  .sign-box { width: 60mm; text-align: center; }
  .sign-line { border-top: 1px solid #222; margin-top: 18mm; padding-top: 2mm; font-size: 9pt; color: #555; }
  .sign-line.tight { margin-top: 3mm; }
  .stamp-img { max-height: 16mm; max-width: 50mm; object-fit: contain; margin-top: 6mm; }
</style>
</head><body>
  <div class="header">
    <div class="company">
      ${company?.logoUrl ? `<img class="logo" src="${escapeHtml(company.logoUrl)}" alt="" />` : ""}
      <h1>${escapeHtml(company?.name)}</h1>
      <div>${escapeHtml(company?.address)}</div>
      <div>${taxLine}</div>
    </div>
    <div class="title">
      <h2>FİYAT TEKLİFİ</h2>
      <div>No: ${escapeHtml(q.quote_no)}</div>
      <div>Tarih: ${issueDate(q.created_at)}</div>
    </div>
  </div>

  <div class="info-grid">
    <div><div class="lbl">Sayın</div>${escapeHtml(q.customer_name) || "—"}</div>
    <div><div class="lbl">Telefon</div>${escapeHtml(q.customer_phone) || "—"}</div>
    <div><div class="lbl">Araç Plakası</div>${escapeHtml(q.plate) || "—"}</div>
  </div>

  <table>
    <thead>
      <tr><th>Ürün / Hizmet</th><th class="c">Adet</th><th class="r">Birim Fiyat</th><th class="r">Tutar</th></tr>
    </thead>
    <tbody>${rows}
    </tbody>
  </table>

  <div class="totals">
    <div><span>Ara Toplam</span><span>${formatCurrency(q.totals.net)}</span></div>
    <div><span>KDV (%${q.vat_rate})</span><span>${formatCurrency(q.totals.vat)}</span></div>
    <div class="grand"><span>Genel Toplam</span><span>${formatCurrency(q.totals.total)}</span></div>
  </div>
  <div class="vat-note">${vatNote}</div>

  ${q.notes ? `<div class="notes"><div class="lbl">Notlar</div>${escapeHtml(q.notes)}</div>` : ""}

  <div class="validity">Bu teklif <strong>${formatISODate(q.valid_until)}</strong> tarihine kadar geçerlidir. Stok durumuna göre ürünlerde değişiklik olabilir.</div>

  <div class="footer">
    <div class="sign-box">
      ${company?.stampUrl ? `<img class="stamp-img" src="${escapeHtml(company.stampUrl)}" alt="" />` : ""}
      <div class="sign-line${company?.stampUrl ? " tight" : ""}">Firma Kaşesi / İmza</div>
    </div>
    <div class="sign-box"><div class="sign-line">Müşteri Onayı</div></div>
  </div>

  <script>window.onload=()=>{window.print();}<\/script>
</body></html>`;
}

// wa.me ile açılan hazır mesaj — WhatsApp linki dosya ekleyemez, bu yüzden
// teklifin özeti metin olarak gider (PDF gerekirse yazdırma ekranından
// kaydedilip ayrıca eklenir).
export function buildQuoteWhatsAppText(q: QuoteDoc, companyName: string | null): string {
  const greeting = q.customer_name ? `Merhaba ${q.customer_name},` : "Merhaba,";
  const intro = companyName
    ? `${companyName} olarak ${q.quote_no} numaralı fiyat teklifimiz:`
    : `${q.quote_no} numaralı fiyat teklifimiz:`;
  const lines = q.lines.map((l) => `• ${lineLabel(l)} × ${l.quantity}: ${formatCurrency(l.line_total)}`);
  const total = q.vat_mode === "haric"
    ? [`Ara Toplam: ${formatCurrency(q.totals.net)}`, `KDV (%${q.vat_rate}): ${formatCurrency(q.totals.vat)}`, `*Genel Toplam: ${formatCurrency(q.totals.total)}*`]
    : [`*Genel Toplam: ${formatCurrency(q.totals.total)}* (KDV dahil)`];
  return [
    greeting,
    intro,
    "",
    ...lines,
    "",
    ...total,
    `Geçerlilik: ${formatISODate(q.valid_until)}`,
    ...(q.notes ? ["", q.notes] : []),
    "",
    "Onaylamak veya sorularınız için bu mesaja yanıt verebilirsiniz.",
  ].join("\n");
}

// Telefon tanınabilir bir Türkiye numarasıysa doğrudan o sohbet açılır;
// değilse (veya boşsa) WhatsApp kişi seçtirir.
export function buildWhatsAppUrl(phone: string | null, text: string): string {
  const to = phone ? normalizeToE164TR(phone) : null;
  return `https://wa.me/${to ?? ""}?text=${encodeURIComponent(text)}`;
}
