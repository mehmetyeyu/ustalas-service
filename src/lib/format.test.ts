import { describe, it, expect } from "vitest";
import { formatMoney, formatCurrency, formatDate } from "./format";

describe("formatMoney / formatCurrency", () => {
  it("TL'yi tr-TR para birimi formatında (₺, virgüllü ondalık) gösterir", () => {
    expect(formatCurrency(1234.5)).toBe("₺1.234,50");
  });

  it("sıfırı da doğru formatlar", () => {
    expect(formatCurrency(0)).toBe("₺0,00");
  });

  it("formatMoney farklı bir para birimiyle çağrılabilir (ör. USD)", () => {
    expect(formatMoney(10, "USD")).toBe("$10,00");
  });
});

describe("formatDate", () => {
  it("bir ISO metnini Europe/Istanbul yerel saatiyle GG.AA.YYYY SS:dd biçimine çevirir", () => {
    expect(formatDate("2026-08-01T10:30:00.000Z")).toBe("01.08.2026 13:30");
  });

  it("bir Date nesnesini de kabul eder", () => {
    expect(formatDate(new Date("2026-08-01T10:30:00.000Z"))).toBe("01.08.2026 13:30");
  });
});
