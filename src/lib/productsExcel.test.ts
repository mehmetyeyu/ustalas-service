import { describe, it, expect } from "vitest";
import { parseProductRows, normalizeYear, validateProductRows, type ParsedProductRow } from "./productsExcel";

function row(overrides: Partial<ParsedProductRow>): ParsedProductRow {
  return {
    code: "A1", brand: null, size_desc: null, season: null, supplier: null,
    production_week: null, production_year: null, purchase_price: null, sale_price: null, stock_qty: 0,
    ...overrides,
  };
}

describe("normalizeYear", () => {
  it("2 haneli bir yılı 2000'lere tamamlar (DOT kodu kısa yıl biçimi)", () => {
    expect(normalizeYear(26)).toBe(2026);
  });

  it("zaten 4 haneli bir yılı değiştirmeden bırakır", () => {
    expect(normalizeYear(2026)).toBe(2026);
  });
});

describe("parseProductRows", () => {
  it("'Ürün Kodu' sütunu yoksa hata fırlatır", () => {
    expect(() => parseProductRows([["Marka", "Ebat"], ["Michelin", "205/55R16"]])).toThrow(/Ürün Kodu/);
  });

  it("boş satır dizisi için boş sonuç döner", () => {
    expect(parseProductRows([])).toEqual({ rows: [], skipped: 0 });
  });

  it("temel (Kod/Marka/Ebat/Stok) bir içe aktarma dosyasını doğru ayrıştırır", () => {
    const rows = [
      ["Ürün Kodu", "Marka", "Ebat", "Stok Miktarı"],
      ["ABC123", "Michelin", "205/55R16", "12"],
    ];
    const { rows: parsed, skipped } = parseProductRows(rows);
    expect(skipped).toBe(0);
    expect(parsed).toEqual([
      {
        code: "ABC123", brand: "Michelin", size_desc: "205/55R16", season: null, supplier: null,
        production_week: null, production_year: null, purchase_price: null, sale_price: null, stock_qty: 12,
      },
    ]);
  });

  it("genişletilmiş (round-trip) bir dosyadaki TÜM alanları doğru ayrıştırır", () => {
    const rows = [
      ["Kod", "Marka", "Ebat", "Mevsim", "Tedarikçi", "Üretim Haftası/Yılı", "Alış Fiyatı", "Satış Fiyatı", "Stok Miktarı"],
      ["XYZ1", "Bridgestone", "225/45R17", "Kış", "FB Lastik", "10/26", "1500", "1800.50", "3"],
    ];
    const { rows: parsed } = parseProductRows(rows);
    expect(parsed[0]).toMatchObject({
      code: "XYZ1", brand: "Bridgestone", season: "Kış", supplier: "FB Lastik",
      production_week: 10, production_year: 2026, purchase_price: 1500, sale_price: 1800.5, stock_qty: 3,
    });
  });

  it("gerçek koda sahip olmayan, sadece dolgu değeri ('-') içeren satırları atlar", () => {
    const rows = [
      ["Ürün Kodu", "Marka"],
      ["-", "Bilinmeyen"],
      ["–", "Bilinmeyen"],
      ["   ", "Bilinmeyen"],
      ["ABC123", "Michelin"],
    ];
    const { rows: parsed, skipped } = parseProductRows(rows);
    expect(skipped).toBe(3);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].code).toBe("ABC123");
  });

  it("tamamen boş bir satırı atlar", () => {
    const rows = [["Ürün Kodu", "Marka"], ["", ""], ["ABC123", "Michelin"]];
    const { rows: parsed } = parseProductRows(rows);
    expect(parsed).toHaveLength(1);
  });

  it("Üretim Haftası/Yılı metnini ('10/26') hafta+yıla ayrıştırır, farklı ayraçları destekler", () => {
    const rows = [
      ["Ürün Kodu", "Üretim Haftası/Yılı"],
      ["A1", "10/26"],
      ["A2", "5-2026"],
      ["A3", "52.99"],
    ];
    const { rows: parsed } = parseProductRows(rows);
    expect(parsed[0]).toMatchObject({ production_week: 10, production_year: 2026 });
    expect(parsed[1]).toMatchObject({ production_week: 5, production_year: 2026 });
    expect(parsed[2]).toMatchObject({ production_week: 52, production_year: 2099 });
  });

  it("53'ten büyük geçersiz bir hafta numarası için null/null döner", () => {
    const rows = [["Ürün Kodu", "Üretim Haftası/Yılı"], ["A1", "60/26"]];
    const { rows: parsed } = parseProductRows(rows);
    expect(parsed[0]).toMatchObject({ production_week: null, production_year: null });
  });

  it("tanınmayan bir Üretim Haftası/Yılı biçimi için null/null döner (hata fırlatmaz)", () => {
    const rows = [["Ürün Kodu", "Üretim Haftası/Yılı"], ["A1", "geçersiz metin"]];
    const { rows: parsed } = parseProductRows(rows);
    expect(parsed[0]).toMatchObject({ production_week: null, production_year: null });
  });

  it("Excel'in metni otomatik tarihe çevirdiği (seri sayı olarak gelen) durumu hafta/yıla düşürür", () => {
    // 46235 = 2026-08-01 (bu oturumda doğrulandı), o tarihin ISO haftası 31.
    const rows = [["Ürün Kodu", "Üretim Haftası/Yılı"], ["A1", 46235]];
    const { rows: parsed } = parseProductRows(rows);
    expect(parsed[0]).toMatchObject({ production_week: 31, production_year: 2026 });
  });

  it("Stok Miktarı'nı en yakın tam sayıya yuvarlar, sütun yoksa 0 varsayar", () => {
    const rows = [["Ürün Kodu", "Stok Miktarı"], ["A1", "4.7"], ["A2", ""]];
    const { rows: parsed } = parseProductRows(rows);
    expect(parsed[0].stock_qty).toBe(5);
    expect(parsed[1].stock_qty).toBe(0);
  });

  it("geçersiz bir fiyat metni için null döner (0'a düşmez, NaN'a da düşmez)", () => {
    const rows = [["Ürün Kodu", "Alış Fiyatı"], ["A1", "geçersiz"]];
    const { rows: parsed } = parseProductRows(rows);
    expect(parsed[0].purchase_price).toBe(null);
  });
});

describe("validateProductRows", () => {
  it("geçerli bir Mevsim değeri için uyarı üretmez", () => {
    expect(validateProductRows([row({ season: "Yaz" })])).toEqual([]);
  });

  it("Mevsim hiç girilmemişse uyarı üretmez (opsiyonel alan)", () => {
    expect(validateProductRows([row({ season: null })])).toEqual([]);
  });

  it("büyük/küçük harf farkını göz ardı eder", () => {
    expect(validateProductRows([row({ season: "yaz" })])).toEqual([]);
    expect(validateProductRows([row({ season: "DÖRT MEVSİM" })])).toEqual([]);
  });

  it("tanınmayan bir Mevsim değeri için satır numarası ve kodla birlikte uyarı üretir", () => {
    const warnings = validateProductRows([row({ code: "XYZ1", season: "Yaz Lastiği" })]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ row: 1, code: "XYZ1", field: "Mevsim" });
    expect(warnings[0].message).toContain("Yaz Lastiği");
  });

  it("birden fazla satırda 1-tabanlı satır numarasını doğru raporlar", () => {
    const warnings = validateProductRows([
      row({ code: "A1", season: "Yaz" }),
      row({ code: "A2", season: "Kışın" }),
      row({ code: "A3", season: "İlkbahar" }),
    ]);
    expect(warnings.map((w) => w.row)).toEqual([2, 3]);
  });
});
