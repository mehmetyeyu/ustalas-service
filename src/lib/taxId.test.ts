import { describe, it, expect } from "vitest";
import { ANONYMOUS_TCKN, classifyTaxId, isValidTckn, isValidVkn } from "./taxId";

describe("isValidTckn", () => {
  it("geçerli numaralar", () => {
    expect(isValidTckn("10000000146")).toBe(true);
    expect(isValidTckn("12345678950")).toBe(true);
  });
  it("kontrol hanesi yanlışsa, 0 ile başlıyorsa ya da uzunluk yanlışsa geçersiz", () => {
    expect(isValidTckn("12345678901")).toBe(false);
    expect(isValidTckn("01234567890")).toBe(false);
    expect(isValidTckn("1234567895")).toBe(false);
    expect(isValidTckn("1234567895a")).toBe(false);
  });
  it("GİB yer tutucusu algoritmadan geçmez — ayrıca ele alınır", () => {
    expect(isValidTckn(ANONYMOUS_TCKN)).toBe(false);
  });
});

describe("isValidVkn", () => {
  it("geçerli ve geçersiz", () => {
    // 1234567890 GİB algoritmasıyla geçerli (yaygın örnek numara).
    expect(isValidVkn("1234567890")).toBe(true);
    expect(isValidVkn("6220419538")).toBe(true);
    expect(isValidVkn("6220419530")).toBe(false);
    expect(isValidVkn("0010000000")).toBe(false);
    expect(isValidVkn("123456789")).toBe(false);
  });
});

describe("classifyTaxId", () => {
  it("uzunluğa göre ayırır, boşlukları yok sayar", () => {
    expect(classifyTaxId("622 041 9538")).toBe("vkn");
    expect(classifyTaxId("10000000146")).toBe("tckn");
    expect(classifyTaxId("123")).toBe(null);
    expect(classifyTaxId(null)).toBe(null);
  });
});
