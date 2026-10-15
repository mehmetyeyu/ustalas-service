import { describe, it, expect } from "vitest";
import { normalizeTrSearch, trIncludes } from "./trSearch";

describe("trIncludes", () => {
  it("İ/I/ı/i yazımlarını birbirine eşler", () => {
    for (const name of ["ISMAIL", "İsmail", "ismail", "ısmaıl", "İSMAİL"]) {
      for (const q of ["ismail", "ISMAIL", "İsmail", "ısmail"]) {
        expect(trIncludes(name, q)).toBe(true);
      }
    }
  });

  it("IŞIK OTO / KIRMIZI gibi kayıtları küçük harf aramayla bulur", () => {
    expect(trIncludes("IŞIK OTO", "ışık")).toBe(true);
    expect(trIncludes("IŞIK OTO", "isik")).toBe(false); // ş≠s — sadece İ/ı eşlenir
    expect(trIncludes("KIRMIZI LASTİK", "kırmızı lastik")).toBe(true);
  });

  it("diğer Türkçe harfler ve kısmi eşleşme bozulmaz", () => {
    expect(trIncludes("Şahin Oto", "ŞAH")).toBe(true);
    expect(trIncludes("Öztürk Ünal", "özTÜRK")).toBe(true);
    expect(trIncludes("Çağrı", "ÇAĞ")).toBe(true);
    expect(trIncludes("205/55 R16", "55 r1")).toBe(true);
    expect(trIncludes("Michelin", "pirelli")).toBe(false);
    expect(trIncludes("Herhangi", "")).toBe(true);
  });

  it("normalizeTrSearch dört i harfini de 'i' yapar", () => {
    expect(normalizeTrSearch("İIıi")).toBe("iiii");
  });
});
