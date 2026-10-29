import { describe, it, expect } from "vitest";
import { formatPlate, isValidTrPlate, normalizePlate } from "./plate";

describe("normalizePlate", () => {
  it("boşluk/tire atar, büyük harfe çevirir, İ → I", () => {
    expect(normalizePlate(" 34 abc 123 ")).toBe("34ABC123");
    expect(normalizePlate("06-ki-4521")).toBe("06KI4521");
    expect(normalizePlate(null)).toBe("");
  });
});

describe("isValidTrPlate", () => {
  it.each(["34ABC123", "34AB1234", "34A12345", "06KL552", "81Z1234", "01ABC12", "34FLT101"])("geçerli: %s", (p) => {
    expect(isValidTrPlate(p)).toBe(true);
  });

  it.each([
    ["11", "sadece rakam"],
    ["X", "tek harf"],
    ["PLAKASIZ", "kelime"],
    ["00ABC123", "il kodu 00"],
    ["82ABC123", "il kodu 82"],
    ["34XYZ123", "Q/W/X harfi"],
    ["34ÇAB123", "Türkçe karakter"],
    ["34ABC1", "çok az rakam"],
    ["34A123", "1 harfe 3 rakam"],
    ["34ABC1234", "3 harfe 4 rakam"],
    ["34AAA000", "rakamların hepsi 0"],
    ["34ABCD12", "4 harf"],
  ])("geçersiz: %s (%s)", (p) => {
    expect(isValidTrPlate(p)).toBe(false);
  });
});

describe("formatPlate", () => {
  it("okunaklı yazım", () => {
    expect(formatPlate("34ABC123")).toBe("34 ABC 123");
    expect(formatPlate("PLAKASIZ")).toBe("PLAKASIZ");
  });
});
