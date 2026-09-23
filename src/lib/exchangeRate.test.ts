import { describe, it, expect } from "vitest";
import { formatTry, formatTry2 } from "./exchangeRate";

describe("formatTry", () => {
  it("ondalıksız, binlik ayraçlı tam sayıya yuvarlar", () => {
    expect(formatTry(1234.5)).toBe("1.235");
  });

  it("sıfırı doğru formatlar", () => {
    expect(formatTry(0)).toBe("0");
  });
});

describe("formatTry2", () => {
  it("her zaman TAM 2 ondalık basamak gösterir (kur farkı hissedilsin diye)", () => {
    expect(formatTry2(48.6421)).toBe("48,64");
  });

  it("tam sayıda bile 2 ondalık basamağı zorlar", () => {
    expect(formatTry2(50)).toBe("50,00");
  });
});
