import { describe, it, expect } from "vitest";
import { buildInvoiceAmounts, withinProviderTolerance } from "./amounts";

const line = (grossTotal: number, quantity = 1, vatRate = 20, localKey = "service:1") => ({ localKey, description: "Balans", quantity, grossTotal, vatRate });

describe("buildInvoiceAmounts", () => {
  it("KDV dahil tutardan net ve KDV ayrıştırılır", () => {
    const a = buildInvoiceAmounts([line(1200)]);
    expect(a.gross).toBe(1200);
    expect(a.net).toBe(1000);
    expect(a.vat).toBe(200);
    expect(a.lines[0].unitPriceNet).toBe(1000);
    expect(a.lines[0].discountNet).toBe(0);
  });

  it("adetli satırda birim fiyat KDV hariç ve 4 ondalık", () => {
    const a = buildInvoiceAmounts([line(9600, 4, 20, "tire:PIRELLI235")]);
    expect(a.lines[0].unitPriceNet).toBe(2000);
    const b = buildInvoiceAmounts([line(1000, 3)]);
    expect(b.lines[0].unitPriceNet).toBe(277.7778);
    expect(b.gross).toBe(1000);
    expect(b.net + b.vat).toBe(1000);
  });

  it("sipariş indirimi satırlara orantılı dağılır, toplam ödenen tutara eşit", () => {
    const a = buildInvoiceAmounts([line(1000), line(2000), line(3000)], 600);
    expect(a.gross).toBe(5400);
    expect(a.discountGross).toBe(600);
    expect(a.lines.map((l) => l.grossAfterDiscount)).toEqual([900, 1800, 2700]);
    expect(Math.round((a.net + a.vat) * 100)).toBe(540000);
  });

  it("bölünmeyen indirim kuruşu kaybolmaz", () => {
    const a = buildInvoiceAmounts([line(100), line(100), line(100)], 100);
    const sum = a.lines.reduce((s, l) => s + Math.round(l.grossAfterDiscount * 100), 0);
    expect(sum).toBe(20000);
    expect(a.gross).toBe(200);
  });

  it("farklı KDV oranları ayrı hesaplanır", () => {
    const a = buildInvoiceAmounts([line(1200, 1, 20), line(1100, 1, 10)]);
    expect(a.net).toBe(2000);
    expect(a.vat).toBe(300);
  });

  it("indirim satır toplamını aşamaz; boş/negatif satır reddedilir", () => {
    expect(buildInvoiceAmounts([line(100)], 500).gross).toBe(0);
    expect(() => buildInvoiceAmounts([])).toThrow();
    expect(() => buildInvoiceAmounts([line(100, 0)])).toThrow();
  });

  it("net + KDV her zaman genel toplama eşit (kuruş)", () => {
    for (const g of [0.01, 99.99, 1234.56, 7777.77]) {
      const a = buildInvoiceAmounts([line(g, 3), line(g / 2, 1, 10)], g / 7);
      expect(Math.round(a.net * 100) + Math.round(a.vat * 100)).toBe(Math.round(a.gross * 100));
    }
  });
});

describe("withinProviderTolerance", () => {
  it("5 kuruşa kadar fark kabul", () => {
    expect(withinProviderTolerance(1000, 1000.05)).toBe(true);
    expect(withinProviderTolerance(1000, 999.95)).toBe(true);
    expect(withinProviderTolerance(1000, 1000.06)).toBe(false);
  });
});
