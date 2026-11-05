import { describe, it, expect } from "vitest";
import { invoicedLinesChanged } from "./orderLock";

const l = (id: number | null, serviceId: number, quantity: number, unitPrice: number) => ({ id, serviceId, quantity, unitPrice });

describe("invoicedLinesChanged", () => {
  const existing = [l(1, 10, 4, 9600), l(2, 11, 1, 400)];
  it("aynı satırlar değişmemiş sayılır (sıra önemsiz)", () => {
    expect(invoicedLinesChanged(existing, [l(2, 11, 1, 400), l(1, 10, 4, 9600)])).toBe(false);
  });
  it("tutar, adet ya da hizmet değişirse değişmiş", () => {
    expect(invoicedLinesChanged(existing, [l(1, 10, 4, 9601), l(2, 11, 1, 400)])).toBe(true);
    expect(invoicedLinesChanged(existing, [l(1, 10, 3, 9600), l(2, 11, 1, 400)])).toBe(true);
    expect(invoicedLinesChanged(existing, [l(1, 12, 4, 9600), l(2, 11, 1, 400)])).toBe(true);
  });
  it("satır eklenir/silinir ya da yeni id'li satır gelirse değişmiş", () => {
    expect(invoicedLinesChanged(existing, [l(1, 10, 4, 9600)])).toBe(true);
    expect(invoicedLinesChanged(existing, [l(1, 10, 4, 9600), l(null, 11, 1, 400)])).toBe(true);
  });
});
