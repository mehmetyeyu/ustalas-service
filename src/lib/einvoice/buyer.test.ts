import { describe, it, expect } from "vitest";
import { validateBuyer } from "./buyer";
import { ANONYMOUS_TCKN } from "../taxId";

const place = { city: "İstanbul", district: "Sarıyer" };

describe("validateBuyer", () => {
  it("bireysel: geçerli TCKN, il/ilçe firmadan", () => {
    const r = validateBuyer({ name: "Ahmet Yılmaz", tax_number: "10000000146" }, place);
    expect(r).toEqual({ ok: true, buyer: expect.objectContaining({ taxNumber: "10000000146", isCompany: false, city: "İstanbul", district: "Sarıyer" }) });
  });
  it("bireysel: TC yoksa hata, 'TC vermek istemiyor' ile yer tutucu", () => {
    expect(validateBuyer({ name: "Ahmet" }, place).ok).toBe(false);
    const r = validateBuyer({ name: "Ahmet", anonymous: true, tax_number: "123" }, place);
    expect(r.ok && r.buyer.taxNumber).toBe(ANONYMOUS_TCKN);
  });
  it("geçersiz numara reddedilir", () => {
    expect(validateBuyer({ name: "Ahmet", tax_number: "12345678901" }, place).ok).toBe(false);
  });
  it("kurumsal: VKN + vergi dairesi + adres zorunlu", () => {
    expect(validateBuyer({ name: "Örnek A.Ş.", tax_number: "1234567890" }, place).ok).toBe(false);
    expect(validateBuyer({ name: "Örnek A.Ş.", tax_number: "1234567890", tax_office: "Sarıyer" }, place).ok).toBe(false);
    const r = validateBuyer({ name: "Örnek A.Ş.", tax_number: "1234567890", tax_office: "Sarıyer", address: "Büyükdere Cad. 1" }, place);
    expect(r.ok && r.buyer.isCompany).toBe(true);
  });
  it("il/ilçe ne alıcıda ne firmada yoksa hata; ad zorunlu", () => {
    expect(validateBuyer({ name: "Ahmet", anonymous: true }, { city: null, district: null }).ok).toBe(false);
    expect(validateBuyer({ name: " ", anonymous: true }, place).ok).toBe(false);
  });
});
