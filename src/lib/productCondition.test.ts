import { describe, it, expect } from "vitest";
import { computeCondition } from "./productCondition";

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
