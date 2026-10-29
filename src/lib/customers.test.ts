import { describe, it, expect } from "vitest";
import { applyDiscount, canonicalCustomerName, exceedsCreditLimit, parseCreditLimit, parseDiscountRate } from "./customers";

describe("parseCreditLimit", () => {
  it("alan yoksa dokunulmaz", () => {
    expect(parseCreditLimit({})).toEqual({ provided: false });
  });
  it("boş/null limiti kaldırır", () => {
    expect(parseCreditLimit({ credit_limit: null })).toEqual({ provided: true, value: null });
    expect(parseCreditLimit({ credit_limit: "" })).toEqual({ provided: true, value: null });
  });
  it("sayı ve virgüllü metin", () => {
    expect(parseCreditLimit({ credit_limit: 50000 })).toEqual({ provided: true, value: 50000 });
    expect(parseCreditLimit({ credit_limit: "1250,5" })).toEqual({ provided: true, value: 1250.5 });
  });
  it("negatif ve geçersiz reddedilir", () => {
    expect(parseCreditLimit({ credit_limit: -1 })).toHaveProperty("error");
    expect(parseCreditLimit({ credit_limit: "abc" })).toHaveProperty("error");
  });
});

describe("exceedsCreditLimit", () => {
  it("limit yoksa asla aşmaz", () => {
    expect(exceedsCreditLimit(null, 1e9, 1e9)).toBe(false);
  });
  it("limite eşit aşım sayılmaz, üstü sayılır", () => {
    expect(exceedsCreditLimit(10000, 8000, 2000)).toBe(false);
    expect(exceedsCreditLimit(10000, 8000, 2000.01)).toBe(true);
  });
  it("alacaklı müşteri (eksi bakiye) limitten düşülür", () => {
    expect(exceedsCreditLimit(1000, -500, 1400)).toBe(false);
  });
});

describe("parseDiscountRate", () => {
  it("geçerli oranlar", () => {
    expect(parseDiscountRate({ discount_rate: 10 })).toEqual({ provided: true, value: 10 });
    expect(parseDiscountRate({ discount_rate: "7,5" })).toEqual({ provided: true, value: 7.5 });
  });
  it("0/boş indirimi kaldırır", () => {
    expect(parseDiscountRate({ discount_rate: 0 })).toEqual({ provided: true, value: null });
    expect(parseDiscountRate({ discount_rate: "" })).toEqual({ provided: true, value: null });
  });
  it("aralık dışı reddedilir", () => {
    expect(parseDiscountRate({ discount_rate: 100 })).toHaveProperty("error");
    expect(parseDiscountRate({ discount_rate: -1 })).toHaveProperty("error");
  });
});

describe("applyDiscount", () => {
  it("kuruşa yuvarlar", () => {
    expect(applyDiscount(1000, 10)).toBe(900);
    expect(applyDiscount(333.33, 7.5)).toBe(308.33);
    expect(applyDiscount(500, null)).toBe(500);
  });
});

describe("canonicalCustomerName", () => {
  const names = ["Test Filo", "Ali", "ali", "İzmir Oto"];
  it("tek harf-duyarsız eşleşmede kayıtlı yazım", () => {
    expect(canonicalCustomerName("test filo ", names)).toBe("Test Filo");
    expect(canonicalCustomerName("izmir oto", names)).toBe("İzmir Oto");
  });
  it("tam eşleşme ve belirsizlik", () => {
    expect(canonicalCustomerName("ali", names)).toBe("ali");
    expect(canonicalCustomerName("ALI", names)).toBe("ALI");
    expect(canonicalCustomerName("Yeni Müşteri", names)).toBe("Yeni Müşteri");
  });
});
