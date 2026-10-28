import { describe, it, expect } from "vitest";
import {
  addDaysISO, computeQuoteTotals, formatISODate, formatQuoteNo, isQuoteExpired, isQuoteLocked, lineTotal, nextQuoteNo,
  orderLineAmounts, priceForVatMode, todayIstanbul,
} from "./quotes";

describe("computeQuoteTotals", () => {
  it("KDV dahil: toplam satırların toplamı, KDV içinden ayrışır", () => {
    const t = computeQuoteTotals([{ quantity: 4, unit_price: 3000 }], "dahil", 20);
    expect(t).toEqual({ net: 10000, vat: 2000, total: 12000 });
  });

  it("KDV hariç: KDV satır toplamının üstüne eklenir", () => {
    const t = computeQuoteTotals([{ quantity: 4, unit_price: 2500 }, { quantity: 1, unit_price: 400 }], "haric", 20);
    expect(t).toEqual({ net: 10400, vat: 2080, total: 12480 });
  });

  it("net + KDV her zaman toplamı kuruşu kuruşuna verir", () => {
    const t = computeQuoteTotals([{ quantity: 3, unit_price: 1234.57 }], "dahil", 10);
    expect(Math.round((t.net + t.vat) * 100)).toBe(Math.round(t.total * 100));
  });

  it("%0 KDV ve boş teklif", () => {
    expect(computeQuoteTotals([{ quantity: 2, unit_price: 100 }], "dahil", 0)).toEqual({ net: 200, vat: 0, total: 200 });
    expect(computeQuoteTotals([], "haric", 20)).toEqual({ net: 0, vat: 0, total: 0 });
  });

  it("satır toplamı kuruşa yuvarlanır", () => {
    expect(lineTotal(3, 0.1)).toBe(0.3);
  });
});

describe("formatQuoteNo", () => {
  it("biçimler", () => {
    expect(formatQuoteNo("simple", 2026, 7)).toBe("T-0007");
    expect(formatQuoteNo("yearly", 2026, 12)).toBe("T-2026-0012");
    expect(formatQuoteNo("simple", 2026, 12345)).toBe("T-12345");
  });
});

describe("nextQuoteNo", () => {
  function fakeClient(lastNo: number) {
    const calls: unknown[][] = [];
    return {
      calls,
      query: async <T,>(_text: string, params?: unknown[]) => {
        calls.push(params ?? []);
        return { rows: [{ last_no: lastNo }] as T[] };
      },
    };
  }

  it("yıllık seri yılı İstanbul saatine göre alır", async () => {
    const c = fakeClient(1);
    // 31 Aralık 22:30 UTC = 1 Ocak 01:30 İstanbul
    expect(await nextQuoteNo(c, 5, "yearly", new Date("2026-12-31T22:30:00Z"))).toBe("T-2027-0001");
    expect(c.calls[0]).toEqual([5, 2027]);
  });

  it("basit seri year=0 sayacını kullanır", async () => {
    const c = fakeClient(42);
    expect(await nextQuoteNo(c, 5, "simple")).toBe("T-0042");
    expect(c.calls[0]).toEqual([5, 0]);
  });
});

describe("durum kuralları", () => {
  it("süresi doldu sadece açık tekliflerde", () => {
    expect(isQuoteExpired("GONDERILDI", "2026-10-01", "2026-10-28")).toBe(true);
    expect(isQuoteExpired("TASLAK", "2026-10-28", "2026-10-28")).toBe(false);
    expect(isQuoteExpired("KABUL", "2026-10-01", "2026-10-28")).toBe(false);
  });

  it("sadece siparişe dönüşen kilitli", () => {
    expect(isQuoteLocked("SIPARIS")).toBe(true);
    expect(isQuoteLocked("RED")).toBe(false);
  });
});

describe("tarih ve fiyat yardımcıları", () => {
  it("İstanbul günü ve gün ekleme", () => {
    expect(todayIstanbul(new Date("2026-10-28T22:30:00Z"))).toBe("2026-10-29");
    expect(addDaysISO("2026-12-25", 15)).toBe("2027-01-09");
    expect(formatISODate("2026-11-02")).toBe("02.11.2026");
  });

  it("KDV hariç teklifte katalog fiyatı nete çevrilir", () => {
    expect(priceForVatMode(1200, "haric", 20)).toBe(1000);
    expect(priceForVatMode(1200, "dahil", 20)).toBe(1200);
  });
});

describe("orderLineAmounts", () => {
  it("KDV dahil: satır toplamları aynen", () => {
    expect(orderLineAmounts([{ quantity: 4, unit_price: 3100 }, { quantity: 4, unit_price: 150 }], "dahil", 20)).toEqual([12400, 600]);
  });

  it("KDV hariç: KDV eklenir, toplam teklifin genel toplamına eşit", () => {
    const lines = [{ quantity: 4, unit_price: 2583.33 }, { quantity: 4, unit_price: 125 }, { quantity: 1, unit_price: 0.05 }];
    const amounts = orderLineAmounts(lines, "haric", 20);
    const sum = Math.round(amounts.reduce((s, a) => s + a, 0) * 100) / 100;
    expect(sum).toBe(computeQuoteTotals(lines, "haric", 20).total);
    expect(amounts[1]).toBe(600);
  });
});
