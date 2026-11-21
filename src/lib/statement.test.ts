import { describe, it, expect } from "vitest";
import { buildStatementPrintHtml, buildStatementWhatsAppText, entryDescription, parseStatementMonth, shiftMonth, statementExcelSheet, statementLineText, statementEntryNote, statementFileName, statementOpenItems, statementOpenItemsSheet, openItemDescription, type Statement, type StatementOpeningRow } from "./statement";

const base: Statement = {
  customer: { id: 1, name: "Filo <A.Ş.>", phone: "0212 000 00 00", tax_no: "123", contact_name: "Ayşe", credit_limit: 5000 },
  month: "2026-10",
  opening_balance: 500,
  closing_balance: 1100,
  total_debt: 900,
  total_credit: 300,
  entries: [
    { id: 1, entry_date: "2026-10-03", entry_type: "SIPARIS", direction: 1, amount: 900, payment_type: null, note: null, order_id: 7, order_no: null, plate: "34ABC123", driver_name: "Mehmet", summary: "Balans", running_balance: 1400,
      customer_name: "Ali Veli", order_notes: "Ön takım sesi",
      lines: [
        { service: "Lastik Satışı", size_desc: "235/40R18", brand: "Pirelli", model_name: "P Zero", quantity: 2, stock_code: "PZ1", supplier: "T" },
        { service: "Balans", size_desc: null, brand: null, model_name: null, quantity: 4, stock_code: null, supplier: null },
      ] },
    { id: 2, entry_date: "2026-10-20", entry_type: "MANUEL", direction: -1, amount: 300, payment_type: "Havale/EFT", note: null, order_id: null, order_no: null, plate: null, driver_name: null, summary: null, running_balance: 1100,
      customer_name: null, order_notes: null, lines: null },
  ],
  opening_items: [
    { id: 90, entry_date: "2026-09-05", entry_type: "SIPARIS", order_id: 3, order_no: "S-3", plate: "34XYZ9", summary: "Rot", note: null, amount: 800, remaining: 500 },
  ],
  vehicles: [{ plate: "34 ABC 123", order_count: 2, total: 1500 }],
  orders_total: 1500,
  order_count: 2,
  line_display: ["size", "brand", "model", "qty"],
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
  it("Excel: bilgi bloğu (risk limiti), istenen sütunlar, devreden + hareketler + kapanış", () => {
    const { rows, tableHeaderRow } = statementExcelSheet(base);
    const info = Object.fromEntries(rows.slice(0, tableHeaderRow).filter((r) => r.length).map((r) => [r[0], r[1]]));
    expect(info["Cari Ekstre"]).toBe("Filo <A.Ş.>");
    expect(info["Dönem"]).toBe("Ekim 2026");
    expect(info["Risk Limiti"]).toBe(5000);
    expect(info["Kalan Limit (ay sonu)"]).toBe(3900);
    expect(rows[tableHeaderRow]).toEqual(["Sipariş No", "Tarih", "Müşteri Adı Soyadı", "Plaka", "Ürün & Hizmet", "Açıklama", "Borç", "Alacak", "Bakiye"]);
    const [opening, order, payment, closing] = rows.slice(tableHeaderRow + 1);
    expect(opening.at(-1)).toBe(500);
    expect(order).toEqual(["#7", new Date(Date.UTC(2026, 9, 3)), "Ali Veli", "34ABC123",
      "Lastik Satışı 235/40R18 Pirelli P Zero 2 adet; Balans 4 adet", "Ön takım sesi", 900, "", 1400]);
    expect(payment).toEqual(["", new Date(Date.UTC(2026, 9, 20)), "Filo <A.Ş.>", "", "", "Tahsilat (Havale/EFT)", "", 300, 1100]);
    expect(closing.slice(5)).toEqual(["Ay sonu bakiye", 900, 300, 1100]);
  });
  it("Excel: risk limiti yoksa", () => {
    const { rows, tableHeaderRow } = statementExcelSheet({ ...base, customer: { ...base.customer, credit_limit: null, tax_no: null } });
    const labels = rows.slice(0, tableHeaderRow).map((r) => r[0]);
    expect(rows.find((r) => r[0] === "Risk Limiti")?.[1]).toBe("Tanımlı değil");
    expect(labels).not.toContain("Kalan Limit (ay sonu)");
    expect(labels).not.toContain("Vergi No");
  });
  it("ürün satırı firmanın gösterimine göre, açıklama kuralları", () => {
    expect(statementLineText(base.entries[0].lines, ["brand", "size"])).toBe("Lastik Satışı Pirelli 235/40R18; Balans");
    expect(statementLineText(null, ["size"])).toBe("");
    expect(statementEntryNote({ ...base.entries[0], order_notes: null, note: "cari notu" })).toBe("cari notu");
    expect(statementEntryNote({ ...base.entries[1], direction: 1, payment_type: null })).toBe("Borç");
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

const row = (id: number, date: string, direction: 1 | -1, amount: number, extra: Partial<StatementOpeningRow> = {}): StatementOpeningRow => ({
  id, entry_date: date, entry_type: direction === 1 && !extra.note ? "SIPARIS" : "MANUEL", direction, amount,
  order_id: direction === 1 ? id : null, order_no: null, plate: null, summary: null, note: null, ...extra,
});

describe("statementOpenItems (devreden detay, FIFO)", () => {
  it("tahsilat en eski borçtan düşer; kalan kalemler eskiden yeniye", () => {
    const items = statementOpenItems([
      row(1, "2026-08-10", 1, 1000),
      row(2, "2026-09-03", 1, 600),
      row(3, "2026-09-20", -1, 1200),
      row(4, "2026-10-02", 1, 300),
    ]);
    expect(items.map((i) => [i.id, i.amount, i.remaining])).toEqual([[2, 600, 400], [4, 300, 300]]);
    expect(items.reduce((t, i) => t + i.remaining, 0)).toBe(700); // = devreden bakiye
  });
  it("avans sonraki borca düşer; tamamen ödenmişse liste boş", () => {
    expect(statementOpenItems([row(1, "2026-08-01", -1, 500), row(2, "2026-08-05", 1, 300)])).toEqual([]);
    const items = statementOpenItems([row(1, "2026-08-01", -1, 200), row(2, "2026-08-05", 1, 300), row(3, "2026-08-06", 1, 100)]);
    expect(items.map((i) => i.remaining)).toEqual([100, 100]);
  });
  it("elle borç da kuyrukta; kuruş artığı bırakmaz", () => {
    const items = statementOpenItems([row(1, "2026-09-01", 1, 0.1, { note: "Eski bakiye" }), row(2, "2026-09-02", 1, 0.2), row(3, "2026-09-03", -1, 0.1)]);
    expect(items).toHaveLength(1);
    expect(items[0].remaining).toBe(0.2);
    expect(openItemDescription({ ...items[0], entry_type: "MANUEL", note: null })).toBe("Borç");
  });
  it("PDF, WhatsApp ve Excel devreden detayı gösterir", () => {
    const html = buildStatementPrintHtml(base, null);
    expect(html).toContain("Devreden Bakiye Detayı");
    expect(html).toContain("05.09.2026");
    expect(html).toContain("Sipariş S-3 · Rot");
    expect(buildStatementWhatsAppText(base, null)).toContain("1 ödenmemiş kalem, en eskisi 05.09.2026");
    const sheet = statementOpenItemsSheet(base);
    expect(sheet[1]).toEqual(["S-3", new Date(Date.UTC(2026, 8, 5)), "34XYZ9", "Rot", 800, 300, 500]);
    expect(sheet.at(-1)?.at(-1)).toBe(500);
    expect(buildStatementPrintHtml({ ...base, opening_items: [] }, null)).not.toContain("Devreden Bakiye Detayı");
  });
});
