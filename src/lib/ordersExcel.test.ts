import { describe, it, expect } from "vitest";
import { parseOrderRows } from "./ordersExcel";

// Sütun sırası: Tarih, Müşteri, Plaka, Yapılan İşlem, Tedarikçi, Stok Kodu,
// Ebat, Adet, Tutar, Maliyet, Ödeme Şekli, Açıklama.
const HEADER = ["Tarih", "Müşteri", "Plaka", "Yapılan İşlem", "Tedarikçi", "Stok Kodu", "Ebat", "Adet", "Tutar", "Maliyet", "Ödeme Şekli", "Açıklama"];

// 46235 = 2026-08-01, 46236 = 2026-08-02 (Excel seri tarihi, dosya başındaki
// yorumla ve bu oturumda gerçek bir hesapla doğrulandı).
const DAY1 = 46235;
const DAY2 = 46236;

function row(fields: {
  date?: number; customer?: string; plate?: string; service?: string; supplier?: string;
  stockCode?: string; size?: string; qty?: number | string; amount?: number; cost?: number;
  paymentType?: string; note?: string;
}): unknown[] {
  return [
    fields.date ?? "", fields.customer ?? "", fields.plate ?? "", fields.service ?? "",
    fields.supplier ?? "", fields.stockCode ?? "", fields.size ?? "", fields.qty ?? "",
    fields.amount ?? "", fields.cost ?? "", fields.paymentType ?? "", fields.note ?? "",
  ];
}

const FLAT_TYPES = ["Nakit", "POS", "Cari"];

describe("parseOrderRows", () => {
  it("'Tarih' veya 'Plaka' sütunu yoksa hata fırlatır", () => {
    const rows = [["Müşteri", "Yapılan İşlem"], ["Ahmet", "Lastik"]];
    expect(() => parseOrderRows(rows, FLAT_TYPES)).toThrow(/Tarih.*Plaka|Plaka.*Tarih/);
  });

  it("boş satır dizisi için boş sonuç döner", () => {
    expect(parseOrderRows([], FLAT_TYPES)).toEqual({ orders: [], skipped: 0 });
  });

  it("tek bir satırdan tek satırlı bir sipariş üretir", () => {
    const rows = [HEADER, row({ date: DAY1, customer: "Ahmet Yılmaz", plate: "34 ABC 1", service: "Balans", amount: 500, paymentType: "Nakit" })];
    const { orders, skipped } = parseOrderRows(rows, FLAT_TYPES);
    expect(skipped).toBe(0);
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({
      date: "2026-08-01",
      plate: "34 ABC 1",
      customer_name: "Ahmet Yılmaz",
      payment_type: "Nakit",
    });
    expect(orders[0].lines).toHaveLength(1);
    expect(orders[0].lines[0]).toMatchObject({ service_name: "Balans", unit_price: 500, payment_type: "Nakit" });
  });

  it("aynı gün+müşteri+plakaya sahip satırları TEK siparişte birden fazla satır olarak gruplar", () => {
    const rows = [
      HEADER,
      row({ date: DAY1, customer: "Ahmet Yılmaz", plate: "34 ABC 1", service: "Balans", amount: 500 }),
      row({ date: DAY1, customer: "ahmet yılmaz", plate: "34 abc 1", service: "Rot Ayarı", amount: 300 }),
    ];
    const { orders } = parseOrderRows(rows, FLAT_TYPES);
    expect(orders).toHaveLength(1);
    expect(orders[0].lines).toHaveLength(2);
  });

  it("anonim müşteriyi ('Perakende Müşteri') AYRI siparişler olarak tutar, birleştirmez", () => {
    const rows = [
      HEADER,
      row({ date: DAY1, customer: "Perakende Müşteri", plate: "34??", service: "Balans", amount: 500 }),
      row({ date: DAY1, customer: "Perakende Müşteri", plate: "34??", service: "Rot Ayarı", amount: 300 }),
    ];
    const { orders } = parseOrderRows(rows, FLAT_TYPES);
    expect(orders).toHaveLength(2);
    expect(orders[0].lines).toHaveLength(1);
    expect(orders[1].lines).toHaveLength(1);
  });

  it("plakası '?' içeren bir satırı, müşteri adı gerçek olsa bile anonim sayar", () => {
    const rows = [
      HEADER,
      row({ date: DAY1, customer: "Ahmet Yılmaz", plate: "34??123", service: "Balans", amount: 500 }),
      row({ date: DAY1, customer: "Ahmet Yılmaz", plate: "34?abc", service: "Rot Ayarı", amount: 300 }),
    ];
    const { orders } = parseOrderRows(rows, FLAT_TYPES);
    // Anonim gruplama satır index'ine göre benzersiz olduğundan iki AYRI sipariş olmalı.
    expect(orders).toHaveLength(2);
  });

  it("tarihi veya işlem adı boş olan (blank olmayan) bir satırı atlar ve skipped'i artırır", () => {
    const rows = [
      HEADER,
      row({ date: DAY1, customer: "Ahmet", plate: "34 ABC 1", service: "", amount: 500 }), // işlem adı yok
      row({ customer: "Mehmet", plate: "06 DEF 2", service: "Balans", amount: 300 }), // tarih yok
    ];
    const { orders, skipped } = parseOrderRows(rows, FLAT_TYPES);
    expect(orders).toHaveLength(0);
    expect(skipped).toBe(2);
  });

  it("tamamen boş bir satırı sessizce atlar (skipped'e SAYMAZ)", () => {
    const rows = [HEADER, ["", "", "", "", "", "", "", "", "", "", "", ""]];
    const { orders, skipped } = parseOrderRows(rows, FLAT_TYPES);
    expect(orders).toHaveLength(0);
    expect(skipped).toBe(0);
  });

  it("bilinmeyen bir Ödeme Şekli değerini '<değer> Mail Order' olarak normalize eder", () => {
    const rows = [HEADER, row({ date: DAY1, customer: "Ahmet", plate: "34 ABC 1", service: "Balans", amount: 500, paymentType: "FB Lastik" })];
    const { orders } = parseOrderRows(rows, FLAT_TYPES);
    expect(orders[0].lines[0].payment_type).toBe("FB Lastik Mail Order");
    expect(orders[0].payment_type).toBe("FB Lastik Mail Order");
  });

  it("bilinen bir Ödeme Şekli değerini OLDUĞU GİBİ bırakır (Mail Order eklemez)", () => {
    const rows = [HEADER, row({ date: DAY1, customer: "Ahmet", plate: "34 ABC 1", service: "Balans", amount: 500, paymentType: "Nakit" })];
    const { orders } = parseOrderRows(rows, FLAT_TYPES);
    expect(orders[0].lines[0].payment_type).toBe("Nakit");
  });

  it("aynı siparişte farklı ödeme tipleri karışırsa sipariş seviyesinde 'Karışık' işaretler", () => {
    const rows = [
      HEADER,
      row({ date: DAY1, customer: "Ahmet", plate: "34 ABC 1", service: "Balans", amount: 500, paymentType: "Nakit" }),
      row({ date: DAY1, customer: "Ahmet", plate: "34 ABC 1", service: "Rot Ayarı", amount: 300, paymentType: "POS" }),
    ];
    const { orders } = parseOrderRows(rows, FLAT_TYPES);
    expect(orders[0].payment_type).toBe("Karışık");
  });

  it("Adet sütunu boş/0 ise 1 varsayılan olarak kullanılır", () => {
    const rows = [HEADER, row({ date: DAY1, customer: "Ahmet", plate: "34 ABC 1", service: "Balans", amount: 500, qty: "" })];
    const { orders } = parseOrderRows(rows, FLAT_TYPES);
    expect(orders[0].lines[0].quantity).toBe(1);
  });

  it("plaka boşsa '??' olarak işaretlenir", () => {
    const rows = [HEADER, row({ date: DAY1, customer: "", plate: "", service: "Balans", amount: 500 })];
    const { orders } = parseOrderRows(rows, FLAT_TYPES);
    expect(orders[0].plate).toBe("??");
  });

  it("aynı gruptaki birden fazla satırın notlarını '; ' ile birleştirir", () => {
    const rows = [
      HEADER,
      row({ date: DAY1, customer: "Ahmet", plate: "34 ABC 1", service: "Balans", amount: 500, note: "İlk not" }),
      row({ date: DAY1, customer: "Ahmet", plate: "34 ABC 1", service: "Rot Ayarı", amount: 300, note: "İkinci not" }),
    ];
    const { orders } = parseOrderRows(rows, FLAT_TYPES);
    expect(orders[0].notes).toBe("İlk not; İkinci not");
  });

  it("farklı bir güne ait aynı müşteri+plaka satırını AYRI bir sipariş sayar", () => {
    const rows = [
      HEADER,
      row({ date: DAY1, customer: "Ahmet", plate: "34 ABC 1", service: "Balans", amount: 500 }),
      row({ date: DAY2, customer: "Ahmet", plate: "34 ABC 1", service: "Rot Ayarı", amount: 300 }),
    ];
    const { orders } = parseOrderRows(rows, FLAT_TYPES);
    expect(orders).toHaveLength(2);
  });
});
