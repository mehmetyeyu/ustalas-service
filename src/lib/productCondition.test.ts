import { describe, it, expect } from "vitest";
import { computeCondition, stockLevel } from "./productCondition";

describe("computeCondition", () => {
  it("7mm ve üzeri için 'Çok İyi' döner", () => {
    expect(computeCondition(7)).toBe("Çok İyi");
    expect(computeCondition(8.5)).toBe("Çok İyi");
  });

  it("7mm'nin altı için 'İyi' döner", () => {
    expect(computeCondition(6.9)).toBe("İyi");
    expect(computeCondition(3)).toBe("İyi");
    expect(computeCondition(0)).toBe("İyi");
  });

  it("null girdi için null döner (Diş Derinliği henüz girilmemiş)", () => {
    expect(computeCondition(null)).toBe(null);
  });

  it("negatif (mantıksız) bir değer için null döner", () => {
    expect(computeCondition(-1)).toBe(null);
  });

  it("NaN için null döner", () => {
    expect(computeCondition(NaN)).toBe(null);
  });
});

describe("stockLevel", () => {
  it("stok 0 veya altındaysa (eşik ne olursa olsun) 'out' döner", () => {
    expect(stockLevel(0, null)).toBe("out");
    expect(stockLevel(0, 5)).toBe("out");
  });

  it("eşik tanımlanmamışsa stok > 0 için her zaman 'ok' döner", () => {
    expect(stockLevel(1, null)).toBe("ok");
    expect(stockLevel(100, null)).toBe("ok");
  });

  it("stok eşiğin altında veya eşite ise 'low' döner", () => {
    expect(stockLevel(4, 4)).toBe("low");
    expect(stockLevel(2, 4)).toBe("low");
  });

  it("stok eşiğin üzerindeyse 'ok' döner", () => {
    expect(stockLevel(5, 4)).toBe("ok");
  });
});
