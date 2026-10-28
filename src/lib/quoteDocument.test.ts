import { describe, it, expect } from "vitest";
import { buildQuotePrintHtml, buildQuoteWhatsAppText, buildWhatsAppUrl, type QuoteDoc } from "./quoteDocument";

const base: QuoteDoc = {
  quote_no: "T-0005",
  customer_name: "Ali Veli",
  customer_phone: "0555 123 45 67",
  plate: "34ABC123",
  vat_mode: "dahil",
  vat_rate: 20,
  valid_until: "2026-11-28",
  notes: "Montaj dahildir.",
  created_at: "2026-10-28T22:30:00Z",
  totals: { net: 10833.33, vat: 2166.67, total: 13000 },
  lines: [
    { service_name: "Lastik Satışı", size_desc: "205/55R16", brand: "Michelin", model_name: "Primacy 4", quantity: 4, unit_price: 3100, line_total: 12400 },
    { service_name: "Balans", size_desc: null, brand: null, model_name: null, quantity: 4, unit_price: 150, line_total: 600 },
  ],
};

describe("buildQuotePrintHtml", () => {
  it("serbest metinleri kaçışlar (yazdırma penceresi React dışı)", () => {
    const html = buildQuotePrintHtml({ ...base, customer_name: '<img src=x onerror="alert(1)">', notes: "<script>x</script>" }, null);
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
    expect(html).not.toContain("<script>x</script>");
  });

  it("satırlar, toplamlar, geçerlilik ve tarih (İstanbul günü)", () => {
    const html = buildQuotePrintHtml(base, null);
    expect(html).toContain("Lastik Satışı — 205/55R16 Michelin Primacy 4");
    expect(html).toContain("28.11.2026");
    expect(html).toContain("29.10.2026");
    expect(html).toContain("Birim fiyatlara KDV dahildir.");
    expect(html).not.toMatch(/maliyet|kâr/i);
  });
});

describe("buildQuoteWhatsAppText", () => {
  it("KDV dahil özet", () => {
    const text = buildQuoteWhatsAppText(base, "Yeyu Lastik");
    expect(text).toContain("Merhaba Ali Veli,");
    expect(text).toContain("Yeyu Lastik olarak T-0005 numaralı");
    expect(text).toContain("• Lastik Satışı — 205/55R16 Michelin Primacy 4 × 4:");
    expect(text).toContain("(KDV dahil)");
    expect(text).toContain("Montaj dahildir.");
  });

  it("KDV hariç teklifte ara toplam ve KDV ayrı", () => {
    const text = buildQuoteWhatsAppText({ ...base, vat_mode: "haric", customer_name: null }, null);
    expect(text.startsWith("Merhaba,")).toBe(true);
    expect(text).toContain("Ara Toplam:");
    expect(text).toContain("KDV (%20):");
  });
});

describe("buildWhatsAppUrl", () => {
  it("geçerli numarada doğrudan sohbet, değilse kişi seçimi", () => {
    expect(buildWhatsAppUrl("0555 123 45 67", "a b")).toBe("https://wa.me/905551234567?text=a%20b");
    expect(buildWhatsAppUrl("123", "x")).toBe("https://wa.me/?text=x");
    expect(buildWhatsAppUrl(null, "x")).toBe("https://wa.me/?text=x");
  });
});
