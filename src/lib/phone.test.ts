import { describe, it, expect } from "vitest";
import { normalizeTurkishPhone, formatTurkishPhoneInput } from "./phone";

describe("normalizeTurkishPhone", () => {
  it("0 ile başlayan 11 haneli ulusal numarayı kabul eder", () => {
    expect(normalizeTurkishPhone("05551234567")).toBe("0555 123 45 67");
  });

  it("90 ile başlayan 12 haneli (ülke kodlu) numarayı kabul eder", () => {
    expect(normalizeTurkishPhone("905551234567")).toBe("0555 123 45 67");
  });

  it("+90 ve boşluk/parantez/tire karışık serbest metni kabul eder", () => {
    expect(normalizeTurkishPhone("+90 (555) 123-45-67")).toBe("0555 123 45 67");
  });

  it("0 ve ülke kodu olmadan doğrudan 10 haneli ulusal numarayı kabul eder", () => {
    expect(normalizeTurkishPhone("5551234567")).toBe("0555 123 45 67");
  });

  it("ulusal kısmı 0 ile başlayan numarayı reddeder (national[0] '0' olamaz)", () => {
    expect(normalizeTurkishPhone("00551234567")).toBe(null);
  });

  it("çok kısa bir numarayı reddeder", () => {
    expect(normalizeTurkishPhone("12345")).toBe(null);
  });

  it("çok uzun bir numarayı reddeder", () => {
    expect(normalizeTurkishPhone("0555123456789")).toBe(null);
  });

  it("boş metni reddeder", () => {
    expect(normalizeTurkishPhone("")).toBe(null);
  });

  it("harf içeren bir girdiden sadece rakamları ayıklar (yine de geçerliyse kabul eder)", () => {
    expect(normalizeTurkishPhone("Tel: 0555 123 45 67")).toBe("0555 123 45 67");
  });
});

describe("formatTurkishPhoneInput", () => {
  it("rakamları 4-3-2-2 gruplarına böler", () => {
    expect(formatTurkishPhoneInput("05551234567")).toBe("0555 123 45 67");
  });

  it("harf/sembolleri atıp sadece rakamları biçimlendirir", () => {
    expect(formatTurkishPhoneInput("(0555) 123-45-67")).toBe("0555 123 45 67");
  });

  it("11 haneden fazlasını keser", () => {
    expect(formatTurkishPhoneInput("055512345678999")).toBe("0555 123 45 67");
  });

  it("eksik/kısmi girişte sadece dolu grupları gösterir", () => {
    expect(formatTurkishPhoneInput("0555")).toBe("0555");
    expect(formatTurkishPhoneInput("05551")).toBe("0555 1");
    expect(formatTurkishPhoneInput("")).toBe("");
  });
});
