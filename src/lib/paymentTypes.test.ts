import { describe, it, expect } from "vitest";
import { isValidPaymentType, flatPaymentOptions, PROTECTED_PAYMENT_TYPES } from "./paymentTypes";

describe("isValidPaymentType", () => {
  const flatOptions = ["Nakit", "POS", "Cari", "Garanti Hesap"];

  it("listede birebir olan bir tipi geçerli sayar", () => {
    expect(isValidPaymentType("Nakit", flatOptions)).toBe(true);
  });

  it("'<Tedarikçi> Mail Order' biçimindeki bir tipi geçerli sayar", () => {
    expect(isValidPaymentType("FB Lastik Mail Order", flatOptions)).toBe(true);
  });

  it("tedarikçisiz, çıplak 'Mail Order'ı GEÇERSİZ sayar (tek başına anlamsız)", () => {
    expect(isValidPaymentType("Mail Order", flatOptions)).toBe(false);
  });

  it("listede olmayan ve Mail Order son eki taşımayan bir tipi geçersiz sayar", () => {
    expect(isValidPaymentType("Rastgele Bir Şey", flatOptions)).toBe(false);
  });

  it("boş metni geçersiz sayar", () => {
    expect(isValidPaymentType("", flatOptions)).toBe(false);
  });
});

describe("flatPaymentOptions", () => {
  it("'Mail Order'ı listeden çıkarır, geri kalanı korur", () => {
    expect(flatPaymentOptions(["Nakit", "POS", "Mail Order", "Cari"])).toEqual(["Nakit", "POS", "Cari"]);
  });

  it("'Mail Order' hiç yoksa listeyi olduğu gibi döner", () => {
    expect(flatPaymentOptions(["Nakit", "POS"])).toEqual(["Nakit", "POS"]);
  });
});

describe("PROTECTED_PAYMENT_TYPES", () => {
  it("dört temel ödeme tipini içerir ve boş değildir", () => {
    expect(PROTECTED_PAYMENT_TYPES).toEqual(["Nakit", "POS", "Cari", "Mail Order"]);
  });
});
