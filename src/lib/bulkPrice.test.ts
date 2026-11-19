import { describe, it, expect } from "vitest";
import { parseBulkPriceInput, bulkPriceStep, parseTrDecimal, bulkValueSqlText, BulkPriceValidationError } from "./bulkPrice";

describe("parseBulkPriceInput", () => {
  it("geçerli girdi, virgüllü sayı, kapsam", () => {
    expect(parseBulkPriceInput({ mode: "percent", value: "12,5", rounding: "10", search: " pirelli ", stock: "in" }))
      .toEqual({ mode: "percent", value: 12.5, rounding: "10", search: "pirelli", season: null, stock: "in" });
  });

  it("bilinmeyen yuvarlama/stok yok sayılır", () => {
    const r = parseBulkPriceInput({ mode: "amount", value: 100, rounding: "7", stock: "x" });
    expect(r.rounding).toBe("none");
    expect(r.stock).toBeNull();
  });

  it("hatalı girdiler", () => {
    for (const b of [null, {}, { mode: "percent", value: 0 }, { mode: "percent", value: "abc" }, { mode: "percent", value: 600 }, { mode: "percent", value: -95 }, { mode: "amount", value: 2_000_000 }]) {
      expect(() => parseBulkPriceInput(b)).toThrow(BulkPriceValidationError);
    }
  });
});

// Fiyat hesabı SQL'de (bkz. /api/products/bulk-price) — eski JS hesabıyla
// 18.660 fiyat × yöntem × yuvarlama üzerinde karşılaştırıldı (yalnızca tam
// yarım kuruşlarda SQL'in doğru yukarı yuvarlaması farklı).
describe("bulkPriceStep", () => {
  it("yuvarlama adımı", () => {
    expect(bulkPriceStep("none")).toBe(0);
    expect(bulkPriceStep("10")).toBe(10);
    expect(bulkPriceStep("100")).toBe(100);
  });
});

describe("parseTrDecimal (pencerede yazılan değer)", () => {
  it("Türkçe biçimler", () => {
    expect(parseTrDecimal("10")).toBe(10);
    expect(parseTrDecimal("10,5")).toBe(10.5);
    expect(parseTrDecimal("1.000")).toBe(1000);
    expect(parseTrDecimal("12.500")).toBe(12500);
    expect(parseTrDecimal("1.234,56")).toBe(1234.56);
    expect(parseTrDecimal("1.000.000")).toBe(1000000);
    expect(parseTrDecimal(" 7,5 ")).toBe(7.5);
  });
  it("nokta 3'lü grup değilse ondalık", () => {
    expect(parseTrDecimal("10.5")).toBe(10.5);
    expect(parseTrDecimal("1.50")).toBe(1.5);
  });
  it("anlaşılamayan metin NaN", () => {
    for (const t of ["", ",", "1,2,3", "1.2.3", "1.00,5,5", "abc", "1.0000", "10,", ".5"]) expect(parseTrDecimal(t)).toBeNaN();
  });
});

describe("değer doğrulaması ve SQL metni", () => {
  it("en fazla 2 ondalık", () => {
    expect(() => parseBulkPriceInput({ mode: "percent", value: 12.345 })).toThrow(BulkPriceValidationError);
    expect(() => parseBulkPriceInput({ mode: "amount", value: "0,001" })).toThrow(BulkPriceValidationError);
    expect(parseBulkPriceInput({ mode: "percent", value: 12.35 }).value).toBe(12.35);
  });
  it("metin değer Türkçe okunur, işaret korunur", () => {
    expect(parseBulkPriceInput({ mode: "amount", value: "1.000" }).value).toBe(1000);
    expect(parseBulkPriceInput({ mode: "amount", value: "-1.234,56" }).value).toBe(-1234.56);
  });
  it("kayan nokta artığı tam kuruşa sabitlenir", () => {
    expect(parseBulkPriceInput({ mode: "percent", value: 10.000000000000002 }).value).toBe(10);
    expect(parseBulkPriceInput({ mode: "percent", value: 0.1 + 0.2 }).value).toBe(0.3);
  });
  it("SQL metni kuruş tam sayısından", () => {
    expect(bulkValueSqlText(7.5)).toBe("7.50");
    expect(bulkValueSqlText(10)).toBe("10.00");
    expect(bulkValueSqlText(-0.01)).toBe("-0.01");
    expect(bulkValueSqlText(12.35)).toBe("12.35");
    expect(bulkValueSqlText(1000000)).toBe("1000000.00");
    expect(bulkValueSqlText(0.1 + 0.2)).toBe("0.30");
  });
});
