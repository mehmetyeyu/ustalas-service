import { describe, it, expect } from "vitest";
import { normalizeHeader, toNumber, chunk } from "./excelParsing";

describe("normalizeHeader", () => {
  it("baş/son boşlukları kırpar", () => {
    expect(normalizeHeader("  Tarih  ")).toBe("tarih");
  });

  it("Türkçe küçük harfe çevirir (İ -> i, I -> ı)", () => {
    expect(normalizeHeader("İSTANBUL")).toBe("istanbul");
    expect(normalizeHeader("PLAKA")).toBe("plaka");
  });

  it("iç boşlukları teke indirir", () => {
    expect(normalizeHeader("Üretim   Haftası/Yılı")).toBe("üretim haftası/yılı");
  });

  it("null/undefined için boş metin döner", () => {
    expect(normalizeHeader(null)).toBe("");
    expect(normalizeHeader(undefined)).toBe("");
  });

  it("sayısal bir başlık hücresini metne çevirir", () => {
    expect(normalizeHeader(123)).toBe("123");
  });
});

describe("toNumber", () => {
  it("null/undefined/boş metin için 0 döner", () => {
    expect(toNumber(null)).toBe(0);
    expect(toNumber(undefined)).toBe(0);
    expect(toNumber("")).toBe(0);
  });

  it("geçerli bir sayısal metni sayıya çevirir", () => {
    expect(toNumber("42")).toBe(42);
    expect(toNumber("3.5")).toBe(3.5);
  });

  it("gerçek bir number değerini olduğu gibi döner", () => {
    expect(toNumber(7)).toBe(7);
  });

  it("sayısal olmayan bir metin için 0 döner (NaN'a düşmez)", () => {
    expect(toNumber("abc")).toBe(0);
  });
});

describe("chunk", () => {
  it("diziyi verilen boyutta parçalara böler", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("dizi boyutu parça boyutuna tam bölünüyorsa eşit parçalar üretir", () => {
    expect(chunk([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
  });

  it("boş dizi için boş bir dizi döner", () => {
    expect(chunk([], 10)).toEqual([]);
  });

  it("parça boyutu dizi uzunluğundan büyükse tek bir parça döner", () => {
    expect(chunk([1, 2], 100)).toEqual([[1, 2]]);
  });
});
