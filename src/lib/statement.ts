import { escapeHtml } from "./htmlEscape";
import { formatCurrency } from "./format";
import { formatISODate } from "./quotes";
import type { CompanyDoc } from "./quoteDocument";

// Aylık cari ekstre (Filo Faz 2) — GET /api/customers/[id]/statement.
// İki bölüm: (1) ayın cari hareketleri (devreden bakiye → borç/tahsilat →
// ay sonu bakiyesi; customer_ledger_entries), (2) ödeme şeklinden bağımsız,
// firmanın o ay araç bazında yaptırdığı işler (orders). Saf fonksiyonlar
// (bkz. statement.test.ts); yazdırma penceresini müşteri ekstre sayfası açar.

export interface StatementEntry {
  id: number;
  entry_date: string; // YYYY-MM-DD
  entry_type: "SIPARIS" | "MANUEL";
  direction: 1 | -1;
  amount: number;
  payment_type: string | null;
  note: string | null;
  order_id: number | null;
  order_no: string | null;
  plate: string | null;
  driver_name: string | null;
  summary: string | null;
  running_balance: number;
}

export interface StatementVehicle {
  plate: string;
  order_count: number;
  total: number;
}

export interface Statement {
  customer: { id: number; name: string; phone: string | null; tax_no: string | null; contact_name: string | null };
  month: string; // YYYY-MM
  opening_balance: number;
  closing_balance: number;
  total_debt: number;
  total_credit: number;
  entries: StatementEntry[];
  vehicles: StatementVehicle[];
  orders_total: number;
  order_count: number;
}

const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

// "2026-10" → ay sınırları (DATE, Europe/Istanbul takvim günü) ve etiket.
// Geçersizse null.
export function parseStatementMonth(raw: string | null | undefined): { month: string; start: string; next: string; label: string } | null {
  const m = String(raw ?? "").match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if (!m) return null;
  const year = Number(m[1]);
  const mon = Number(m[2]);
  if (year < 2000 || year > 2100) return null;
  const nextYear = mon === 12 ? year + 1 : year;
  const nextMon = mon === 12 ? 1 : mon + 1;
  return {
    month: `${m[1]}-${m[2]}`,
    start: `${m[1]}-${m[2]}-01`,
    next: `${nextYear}-${String(nextMon).padStart(2, "0")}-01`,
    label: `${MONTHS[mon - 1]} ${year}`,
  };
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function entryDescription(e: StatementEntry): string {
  if (e.entry_type === "SIPARIS") {
    return [`Sipariş ${e.order_no || `#${e.order_id}`}`, e.summary].filter(Boolean).join(" · ");
  }
  return e.note || (e.direction === -1 ? `Tahsilat${e.payment_type ? ` (${e.payment_type})` : ""}` : "Borç");
}

function balanceLabel(b: number): string {
  if (b > 0.009) return `${formatCurrency(b)} (Borç)`;
  if (b < -0.009) return `${formatCurrency(-b)} (Alacak)`;
  return formatCurrency(0);
}

export function buildStatementPrintHtml(s: Statement, company: CompanyDoc | null, printedAt: Date = new Date()): string {
  const period = parseStatementMonth(s.month);
  const rows = s.entries.map((e) => `
      <tr>
        <td>${formatISODate(e.entry_date)}</td>
        <td>${escapeHtml(entryDescription(e))}${e.driver_name ? `<div class="sub">Getiren: ${escapeHtml(e.driver_name)}</div>` : ""}</td>
        <td>${escapeHtml(e.plate) || "—"}</td>
        <td class="r">${e.direction === 1 ? formatCurrency(e.amount) : ""}</td>
        <td class="r">${e.direction === -1 ? formatCurrency(e.amount) : ""}</td>
        <td class="r">${formatCurrency(e.running_balance)}</td>
      </tr>`).join("");
  const vehicleRows = s.vehicles.map((v) => `
      <tr><td>${escapeHtml(v.plate)}</td><td class="c">${v.order_count}</td><td class="r">${formatCurrency(v.total)}</td></tr>`).join("");
  const taxLine = [
    company?.phone ? "Tel: " + escapeHtml(company.phone) : "",
    company?.taxOffice ? escapeHtml(company.taxOffice) : "",
    company?.taxId ? escapeHtml(company.taxIdLabel) + ": " + escapeHtml(company.taxId) : "",
  ].filter(Boolean).join(" · ");
  const printed = new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Istanbul" }).format(printedAt);

  return `<!DOCTYPE html>
<html lang="tr"><head><meta charset="UTF-8"><title>Ekstre ${escapeHtml(period?.label)} - ${escapeHtml(s.customer.name)}</title>
<style>
  @page { size: A4 portrait; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; color: #222; font-size: 10pt; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 6mm; border-bottom: 2px solid #222; padding-bottom: 6mm; margin-bottom: 6mm; }
  .logo { max-height: 16mm; max-width: 50mm; object-fit: contain; margin-bottom: 2mm; }
  .company h1 { font-size: 15pt; margin: 0 0 1.5mm; }
  .company div, .title div { font-size: 8.5pt; color: #555; }
  .title { text-align: right; white-space: nowrap; }
  .title h2 { font-size: 18pt; margin: 0; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 3mm; margin-bottom: 6mm; }
  .lbl { color: #777; font-size: 8pt; }
  .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3mm; margin-bottom: 6mm; }
  .summary div { border: 1px solid #ddd; border-radius: 2mm; padding: 2.5mm; }
  .summary b { display: block; font-size: 11pt; margin-top: 1mm; }
  h3 { font-size: 10.5pt; margin: 6mm 0 2mm; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 2mm 1.5mm; border-bottom: 1px solid #ddd; text-align: left; vertical-align: top; font-size: 9pt; }
  th { border-bottom: 2px solid #222; font-size: 8pt; color: #555; text-transform: uppercase; }
  td.r, th.r { text-align: right; white-space: nowrap; }
  td.c, th.c { text-align: center; }
  .sub { color: #777; font-size: 8pt; }
  tr.edge td { background: #f5f5f5; font-weight: bold; }
  .foot { margin-top: 8mm; font-size: 8pt; color: #777; }
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
      <h2>CARİ EKSTRE</h2>
      <div>Dönem: ${escapeHtml(period?.label)}</div>
      <div>Düzenleme: ${printed}</div>
    </div>
  </div>

  <div class="info-grid">
    <div><div class="lbl">Sayın</div>${escapeHtml(s.customer.name)}</div>
    <div><div class="lbl">Yetkili / Telefon</div>${escapeHtml([s.customer.contact_name, s.customer.phone].filter(Boolean).join(" · ")) || "—"}</div>
    <div><div class="lbl">Vergi No</div>${escapeHtml(s.customer.tax_no) || "—"}</div>
  </div>

  <div class="summary">
    <div><span class="lbl">Devreden bakiye</span><b>${balanceLabel(s.opening_balance)}</b></div>
    <div><span class="lbl">Bu ay borç</span><b>${formatCurrency(s.total_debt)}</b></div>
    <div><span class="lbl">Bu ay tahsilat</span><b>${formatCurrency(s.total_credit)}</b></div>
    <div><span class="lbl">Ay sonu bakiye</span><b>${balanceLabel(s.closing_balance)}</b></div>
  </div>

  <h3>Cari Hareketler</h3>
  <table>
    <thead><tr><th>Tarih</th><th>Açıklama</th><th>Plaka</th><th class="r">Borç</th><th class="r">Alacak</th><th class="r">Bakiye</th></tr></thead>
    <tbody>
      <tr class="edge"><td>${period ? formatISODate(period.start) : ""}</td><td>Devreden bakiye</td><td></td><td></td><td></td><td class="r">${formatCurrency(s.opening_balance)}</td></tr>${rows}
      <tr class="edge"><td></td><td>Ay sonu bakiye</td><td></td><td class="r">${formatCurrency(s.total_debt)}</td><td class="r">${formatCurrency(s.total_credit)}</td><td class="r">${formatCurrency(s.closing_balance)}</td></tr>
    </tbody>
  </table>

  ${s.vehicles.length > 0 ? `
  <h3>Araç Bazında Tamamlanan İşlemler (tüm ödeme şekilleri)</h3>
  <table>
    <thead><tr><th>Plaka</th><th class="c">Sipariş</th><th class="r">Tutar</th></tr></thead>
    <tbody>${vehicleRows}
      <tr class="edge"><td>Toplam</td><td class="c">${s.order_count}</td><td class="r">${formatCurrency(s.orders_total)}</td></tr>
    </tbody>
  </table>` : ""}

  <div class="foot">Bakiye pozitifse borç, negatifse alacak bakiyesidir. Mutabakat için lütfen bizimle iletişime geçin.</div>

  <script>window.onload=()=>{window.print();}<\/script>
</body></html>`;
}

export function buildStatementWhatsAppText(s: Statement, companyName: string | null): string {
  const period = parseStatementMonth(s.month);
  return [
    `Merhaba${s.customer.contact_name ? ` ${s.customer.contact_name}` : ""},`,
    `${companyName ? `${companyName} — ` : ""}${s.customer.name} ${period?.label ?? s.month} cari ekstresi:`,
    "",
    `Devreden bakiye: ${balanceLabel(s.opening_balance)}`,
    `Bu ay borç: ${formatCurrency(s.total_debt)} (${s.entries.filter((e) => e.direction === 1).length} kalem)`,
    `Bu ay tahsilat: ${formatCurrency(s.total_credit)}`,
    `*Ay sonu bakiye: ${balanceLabel(s.closing_balance)}*`,
    ...(s.vehicles.length > 0 ? ["", `Bu ay ${s.vehicles.length} araçta ${s.order_count} işlem tamamlandı (${formatCurrency(s.orders_total)}).`] : []),
    "",
    "Ayrıntılı ekstreyi PDF olarak iletebiliriz.",
  ].join("\n");
}

// Excel sayfası satırları — route tarafında sanitizeExcelRow ile yazılır.
export function statementExcelRows(s: Statement): Record<string, string | number>[] {
  const period = parseStatementMonth(s.month);
  return [
    { Tarih: period?.start ?? "", Açıklama: "Devreden bakiye", Plaka: "", "Aracı Getiren": "", Borç: "", Alacak: "", Bakiye: s.opening_balance },
    ...s.entries.map((e) => ({
      Tarih: e.entry_date,
      Açıklama: entryDescription(e),
      Plaka: e.plate ?? "",
      "Aracı Getiren": e.driver_name ?? "",
      Borç: e.direction === 1 ? e.amount : "",
      Alacak: e.direction === -1 ? e.amount : "",
      Bakiye: e.running_balance,
    })),
    { Tarih: "", Açıklama: "Ay sonu bakiye", Plaka: "", "Aracı Getiren": "", Borç: s.total_debt, Alacak: s.total_credit, Bakiye: s.closing_balance },
  ];
}

const TR_ASCII: Record<string, string> = { ç: "c", Ç: "C", ğ: "g", Ğ: "G", ı: "i", İ: "I", ö: "o", Ö: "O", ş: "s", Ş: "S", ü: "u", Ü: "U" };

// Excel dosya adı — müşteri adı serbest metin: ASCII sürümde Türkçe harfler
// sadeleştirilir, güvenli olmayan karakterler "-" olur; UTF-8 sürümde
// yalnızca dosya sisteminde/başlıkta sorun çıkaran karakterler atılır.
export function statementFileName(customerName: string, month: string): { ascii: string; utf8: string } {
  const ascii = customerName
    .replace(/[çÇğĞıİöÖşŞüÜ]/g, (ch) => TR_ASCII[ch])
    .normalize("NFD").replace(/\p{M}/gu, "")
    .replace(/[^A-Za-z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")
    .slice(0, 40) || "musteri";
  const utf8 = customerName.replace(/[\\/:*?"<>|\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) || "müşteri";
  return { ascii: `ekstre-${ascii}-${month}.xlsx`, utf8: `Ekstre ${utf8} ${month}.xlsx` };
}
