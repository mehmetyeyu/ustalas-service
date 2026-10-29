import { describe, it, expect } from "vitest";
import { buildStatementPrintHtml, buildStatementWhatsAppText, entryDescription, parseStatementMonth, shiftMonth, statementExcelRows, statementFileName, type Statement } from "./statement";

const base: Statement = {
  customer: { id: 1, name: "Filo <A.Ş.>", phone: "0212 000 00 00", tax_no: "123", contact_name: "Ayşe" },
  month: "2026-10",
  opening_balance: 500,
  closing_balance: 1100,
  total_debt: 900,
  total_credit: 300,
  entries: [
    { id: 1, entry_date: "2026-10-03", entry_type: "SIPARIS", direction: 1, amount: 900, payment_type: null, note: null, order_id: 7, order_no: null, plate: "34ABC123", driver_name: "Mehmet", summary: "Balans", running_balance: 1400 },
    { id: 2, entry_date: "2026-10-20", entry_type: "MANUEL", direction: -1, amount: 300, payment_type: "Havale/EFT", note: null, order_id: null, order_no: null, plate: null, driver_name: null, summary: null, running_balance: 1100 },
  ],
  vehicles: [{ plate: "34 ABC 123", order_count: 2, total: 1500 }],
  orders_total: 1500,
  order_count: 2,
};

describe("parseStatementMonth", () => {
  it("ay sınırları ve etiket", () => {
    expect(parseStatementMonth("2026-10")).toEqual({ month: "2026-10", start: "2026-10-01", next: "2026-11-01", label: "Ekim 2026" });
    expect(parseStatementMonth("2026-12")?.next).toBe("2027-01-01");
  });
  it("geçersiz dönem", () => {
    expect(parseStatementMonth("2026-13")).toBeNull();
    expect(parseStatementMonth("2026-1")).toBeNull();
    expect(parseStatementMonth("1' OR 1=1")).toBeNull();
    expect(parseStatementMonth(null)).toBeNull();
  });
});

describe("shiftMonth", () => {
  it("yıl geçişleri", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });
});

describe("ekstre belgeleri", () => {
  it("açıklamalar", () => {
    expect(entryDescription(base.entries[0])).toBe("Sipariş #7 · Balans");
    expect(entryDescription(base.entries[1])).toBe("Tahsilat (Havale/EFT)");
  });
  it("yazdırma çıktısı kaçışlı ve bakiyeleri içeriyor", () => {
    const html = buildStatementPrintHtml(base, null, new Date("2026-10-29T10:00:00Z"));
    expect(html).toContain("Filo &lt;A.Ş.&gt;");
    expect(html).not.toContain("Filo <A.Ş.>");
    expect(html).toContain("Ekim 2026");
    expect(html).toContain("Getiren: Mehmet");
    expect(html).toContain("Devreden bakiye");
  });
  it("WhatsApp metni", () => {
    const t = buildStatementWhatsAppText(base, "Usta Lastik");
    expect(t).toContain("Merhaba Ayşe,");
    expect(t).toContain("Ekim 2026");
    expect(t).toContain("(Borç)");
  });
  it("Excel satırları devreden + hareketler + kapanış", () => {
    const rows = statementExcelRows(base);
    expect(rows).toHaveLength(4);
    expect(rows[0].Bakiye).toBe(500);
    expect(rows[1]["Aracı Getiren"]).toBe("Mehmet");
    expect(rows[3].Bakiye).toBe(1100);
  });
});

describe("statementFileName", () => {
  it("Türkçe harfleri sadeleştirir, başlığı bozacak karakterleri atar", () => {
    expect(statementFileName('Güvenlik "Filo" Şirketi', "2026-10")).toEqual({
      ascii: "ekstre-Guvenlik-Filo-Sirketi-2026-10.xlsx",
      utf8: "Ekstre Güvenlik Filo Şirketi 2026-10.xlsx",
    });
    expect(statementFileName("İğne\r\nx", "2026-01").ascii).toBe("ekstre-Igne-x-2026-01.xlsx");
    expect(statementFileName("***", "2026-01").ascii).toBe("ekstre-musteri-2026-01.xlsx");
  });
});
