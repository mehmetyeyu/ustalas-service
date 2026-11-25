import { describe, it, expect } from "vitest";
import { CUSTOMER_EXAMPLE_NAME, CUSTOMER_EXCEL_COLUMNS, CustomerImportError, customerNameKey, matchCustomers, parseCustomerRows } from "./customersExcel";

const HEADERS = CUSTOMER_EXCEL_COLUMNS.map((c) => c.header);
const row = (v: Record<string, unknown>) => CUSTOMER_EXCEL_COLUMNS.map((c) => v[c.key] ?? null);

describe("parseCustomerRows", () => {
  it("şablon başlıklarıyla tüm alanlar", () => {
    const { rows, errors, skipped } = parseCustomerRows([HEADERS, row({
      name: "  Yılmaz   Filo A.Ş. ", phone: "0555 123 45 67", is_corporate: "Evet", tax_no: "9490849993", tax_office: "Zincirlikuyu",
      contact_name: "Ayşe Yılmaz", email: "info@yilmaz.com", address: "Esentepe Mah.\nNo:5", city: "İstanbul", district: "Şişli",
    })]);
    expect(errors).toEqual([]);
    expect(skipped).toBe(0);
    expect(rows).toEqual([{
      name: "Yılmaz Filo A.Ş.", phone: "0555 123 45 67", is_corporate: true, tax_no: "9490849993", tax_office: "Zincirlikuyu",
      contact_name: "Ayşe Yılmaz", email: "info@yilmaz.com", address: "Esentepe Mah. No:5", city: "İstanbul", district: "Şişli",
    }]);
  });

  it("sütun sırası ve başlık yazımı serbest, tanınmayan sütun yok sayılır", () => {
    const { rows } = parseCustomerRows([["Bakiye", "GSM", "CARİ ADI"], [100, 5551234567, "Can Aydın"]]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Can Aydın", phone: "0555 123 45 67", is_corporate: false });
  });

  it("ad sütunu yoksa hata", () => {
    expect(() => parseCustomerRows([["Telefon"], ["0555"]])).toThrow(CustomerImportError);
    expect(() => parseCustomerRows([])).toThrow(CustomerImportError);
  });

  it("boş satır, adsız satır ve şablonun örnek satırı", () => {
    const { rows, skipped } = parseCustomerRows([HEADERS, row({}), row({ phone: "0555 111 22 33" }), row({ name: CUSTOMER_EXAMPLE_NAME }), row({ name: "Elif" })]);
    expect(rows.map((r) => r.name)).toEqual(["Elif"]);
    expect(skipped).toBe(1);
  });

  it("aynı ad (harf/boşluk farkıyla) tek müşteride birleşir", () => {
    const { rows } = parseCustomerRows([HEADERS, row({ name: "İSMAİL KIR" }), row({ name: "ismail  kır", phone: "0555 111 22 33", is_corporate: "x" })]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "İSMAİL KIR", phone: "0555 111 22 33", is_corporate: true });
  });

  it("sayı olarak saklanan VKN'nin baştaki sıfırı geri gelir", () => {
    // 0123456788: kontrol hanesi tutmuyorsa hata vermeli, tutuyorsa 10 hane olmalı.
    const ok = Array.from({ length: 10 }, (_, d) => Number(`12345678${d}`))
      .map((n) => parseCustomerRows([HEADERS, row({ name: "A", tax_no: n })]))
      .filter((r) => r.errors.length === 0);
    expect(ok).toHaveLength(1);
    expect(ok[0].rows[0].tax_no).toMatch(/^012345678\d$/);
  });

  it("hatalı hücreler satır numarasıyla bildirilir", () => {
    const { rows, errors } = parseCustomerRows([HEADERS,
      row({ name: "A", tax_no: "123" }), row({ name: "B", is_corporate: "belki" }), row({ name: "C", email: "yok" }), row({ name: "D", phone: "1".repeat(21) }), row({ name: "E".repeat(101) })]);
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(5);
    expect(errors[0]).toContain("Satır 2 (A)");
    expect(errors[1]).toContain("Evet ya da Hayır");
    expect(errors[2]).toContain("E-posta");
    expect(errors[3]).toContain("Telefon en fazla 20");
    expect(errors[4]).toContain("Müşteri Adı en fazla 100");
  });

  it("NUL karakteri temizlenir", () => {
    expect(parseCustomerRows([HEADERS, row({ name: "Ali\u0000 Veli" })]).rows[0].name).toBe("Ali Veli");
  });
});

describe("matchCustomers", () => {
  const r = (name: string) => parseCustomerRows([HEADERS, row({ name })]).rows[0];
  it("tam eşleşme, harf-duyarsız tek aday, belirsiz ve yeni", () => {
    const existing = [{ id: 1, name: "Can Aydın" }, { id: 2, name: "test filo" }, { id: 3, name: "Test Filo" }, { id: 4, name: "ISMAIL" }];
    const m = matchCustomers([r("CAN AYDIN"), r("Test Filo"), r("TEST FİLO"), r("ismail"), r("Yeni Kişi")], existing);
    expect(m.toUpdate.map((x) => x.id)).toEqual([1, 3, 4]);
    expect(m.ambiguous).toBe(1);
    expect(m.toInsert.map((x) => x.name)).toEqual(["Yeni Kişi"]);
  });
  it("anahtar", () => {
    expect(customerNameKey(" İSMAİL   Kır ")).toBe(customerNameKey("ismail kır"));
  });
});
