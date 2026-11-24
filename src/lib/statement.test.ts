import { describe, it, expect } from "vitest";
import { buildStatementPrintHtml, buildStatementWhatsAppText, entryDescription, parseStatementMonth, shiftMonth, statementExcelSheet, statementEntryNote, statementSingleLineText, statementFileName, statementOpenItems, openItemDescription, type Statement, type StatementOpeningRow } from "./statement";

const base: Statement = {
  customer: { id: 1, name: "Filo <A.Ş.>", phone: "0212 000 00 00", tax_no: "123", contact_name: "Ayşe" },
  month: "2026-10",
  opening_balance: 500,
  closing_balance: 1100,
  total_debt: 900,
  total_credit: 300,
  entries: [
    { id: 1, entry_date: "2026-10-03", entry_type: "SIPARIS", direction: 1, amount: 900, payment_type: null, note: null, order_id: 7, order_no: null, plate: "34ABC123", driver_name: "Mehmet", summary: "Balans", running_balance: 1400,
      customer_name: "Ali Veli", order_notes: "Ön takım sesi",
      lines: [
        { service: "Lastik Satışı", size_desc: "235/40R18", brand: "Pirelli", model_name: "P Zero", quantity: 2, stock_code: "PZ1", supplier: "T", amount: 700 },
        { service: "Balans", size_desc: null, brand: null, model_name: null, quantity: 4, stock_code: null, supplier: null, amount: 200 },
      ], other_payments: null },
    { id: 2, entry_date: "2026-10-20", entry_type: "MANUEL", direction: -1, amount: 300, payment_type: "Havale/EFT", note: null, order_id: null, order_no: null, plate: null, driver_name: null, summary: null, running_balance: 1100,
      customer_name: null, order_notes: null, lines: null, other_payments: null },
  ],
  opening_items: [
    { id: 90, entry_date: "2026-09-05", entry_type: "SIPARIS", order_id: 3, order_no: "S-3", plate: "34XYZ9", summary: "Rot", note: null, amount: 800, remaining: 500 },
  ],
  vehicles: [{ plate: "34 ABC 123", order_count: 2, total: 1500 }],
  orders_total: 1500,
  order_count: 2,
  line_display: ["size", "brand", "model", "qty"],
};

const excelCells = (s: Statement) => statementExcelSheet(s).map((r) => r.cells);

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
  it("Excel: tablo 1. satırdan başlar; devreden + hareketler + kapanış", () => {
    const rows = excelCells(base);
    expect(rows[0]).toEqual(["Sipariş No", "Tarih", "Müşteri Adı Soyadı", "Plaka", "Ürün & Hizmet", "Açıklama", "Tutar", "Borç", "Alacak", "Bakiye"]);
    const [openItem, opening, line1, line2, payment, closing] = rows.slice(1);
    // Devreden kalemler aynı sayfada; Borç boş, Bakiye devredene varır.
    expect(openItem).toEqual(["S-3", new Date(Date.UTC(2026, 8, 5)), "Filo <A.Ş.>", "34XYZ9", "Rot",
      "Devreden: ₺800,00 borcun ₺300,00 kısmı ödendi, kalan ₺500,00", 800, "", "", 500]);
    expect(opening.slice(5)).toEqual(["Devreden bakiye", "", "", "", 500]);
    // Her hizmet kendi satırında kendi tutarıyla; Borç/Bakiye yalnızca ilk satırda.
    expect(line1).toEqual(["#7", new Date(Date.UTC(2026, 9, 3)), "Ali Veli", "34ABC123",
      "Lastik Satışı 235/40R18 Pirelli P Zero 2 adet", "Ön takım sesi", 700, 900, "", 1400]);
    expect(line2).toEqual(["#7", new Date(Date.UTC(2026, 9, 3)), "Ali Veli", "34ABC123", "Balans 4 adet", "", 200, "", "", ""]);
    expect(payment).toEqual(["", new Date(Date.UTC(2026, 9, 20)), "Filo <A.Ş.>", "", "", "Tahsilat (Havale/EFT)", "", "", 300, 1100]);
    expect(closing.slice(5)).toEqual(["Ay sonu bakiye", "", 900, 300, 1100]);
    // Borç sütununun toplamı satırlara bölününce değişmez.
    const debtSum = rows.slice(1, -1).reduce((t, r) => t + (typeof r[7] === "number" ? r[7] : 0), 0);
    expect(debtSum).toBe(base.total_debt);
    expect(statementExcelSheet(base).map((r) => r.kind)).toEqual(["head", "row", "total", "row", "cont", "row", "total"]);
  });
  it("Excel: parçalı ödemede sipariş toplamı ile cari borç farkı açıklanır", () => {
    const e = { ...base.entries[0], amount: 600, other_payments: "Nakit", order_notes: null };
    const rows = excelCells({ ...base, entries: [e] });
    expect(rows[3][5]).toBe("Sipariş toplamı ₺900,00; ₺300,00 Nakit ile ödendi, ₺600,00 cariye yazıldı.");
    expect(rows[3][7]).toBe(600);
  });
  it("Excel: devreden siparişin her hizmeti kendi satırında, bakiye birikir", () => {
    const items: Statement["opening_items"] = [
      { ...base.opening_items[0], remaining: 800, order: { customer_name: "Can", order_notes: "Acil", lines: base.entries[0].lines, other_payments: "Nakit" } },
      { id: 91, entry_date: "2026-09-10", entry_type: "MANUEL", order_id: null, order_no: null, plate: null, summary: null, note: "Eski bakiye", amount: 200, remaining: 200 },
    ];
    const rows = excelCells({ ...base, opening_balance: 1000, opening_items: items, entries: [] });
    expect(rows[1].slice(0, 5)).toEqual(["S-3", new Date(Date.UTC(2026, 8, 5)), "Can", "34XYZ9", "Lastik Satışı 235/40R18 Pirelli P Zero 2 adet"]);
    expect(rows[1].slice(5)).toEqual(["Devreden: ₺800,00 ödenmedi · Acil · Sipariş toplamı ₺900,00; ₺100,00 Nakit ile ödendi, ₺800,00 cariye yazıldı.", 700, "", "", 800]);
    expect(rows[2].slice(4)).toEqual(["Balans 4 adet", "", 200, "", "", ""]);
    expect(rows[3]).toEqual(["", new Date(Date.UTC(2026, 8, 10)), "Filo <A.Ş.>", "", "Eski bakiye", "Devreden: ₺200,00 ödenmedi", 200, "", "", 1000]);
    expect(rows[4].at(-1)).toBe(1000);
  });
  it("ürün satırı firmanın gösterimine göre, açıklama kuralları", () => {
    expect(statementSingleLineText(base.entries[0].lines![0], ["brand", "size"])).toBe("Lastik Satışı Pirelli 235/40R18");
    expect(statementEntryNote({ ...base.entries[0], order_notes: null, note: "cari notu" })).toBe("cari notu");
    expect(statementEntryNote({ ...base.entries[0], order_notes: null, note: "Sipariş #7" })).toBe("");
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
  it("PDF ve WhatsApp devreden detayı gösterir", () => {
    const html = buildStatementPrintHtml(base, null);
    expect(html).toContain("Devreden Bakiye Detayı");
    expect(html).toContain("05.09.2026");
    expect(html).toContain("Sipariş S-3 · Rot");
    expect(buildStatementWhatsAppText(base, null)).toContain("1 ödenmemiş kalem, en eskisi 05.09.2026");
    expect(buildStatementPrintHtml({ ...base, opening_items: [] }, null)).not.toContain("Devreden Bakiye Detayı");
  });
});
