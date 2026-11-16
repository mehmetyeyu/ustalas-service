import { describe, it, expect } from "vitest";
import { formatOrderLine, sanitizeOrderLineDisplay, DEFAULT_ORDER_LINE_DISPLAY } from "./orderLineDisplay";

const row = { size_desc: "235/40R18", brand: "Pirelli", model_name: "P Zero", quantity: 2, stock_code: "PZ1", supplier: "Tedarikçi" };

describe("formatOrderLine", () => {
  it("varsayılan: ebat + adet", () => {
    expect(formatOrderLine(row, DEFAULT_ORDER_LINE_DISPLAY)).toBe("235/40R18 2 adet");
  });

  it("firmanın seçtiği sıra", () => {
    expect(formatOrderLine(row, ["size", "brand", "model", "qty"])).toBe("235/40R18 Pirelli P Zero 2 adet");
    expect(formatOrderLine(row, ["brand", "size", "model", "qty"])).toBe("Pirelli 235/40R18 P Zero 2 adet");
  });

  it("boş alanlar atlanır, hiçbiri yoksa boş", () => {
    expect(formatOrderLine({ ...row, brand: null, model_name: " " }, ["size", "brand", "model", "qty"])).toBe("235/40R18 2 adet");
    expect(formatOrderLine({ ...row, size_desc: null, quantity: null }, ["size", "qty"])).toBe("");
    expect(formatOrderLine(row, [])).toBe("");
  });
});

describe("sanitizeOrderLineDisplay", () => {
  it("bilinmeyen ve tekrar eden alanlar atılır, sıra korunur", () => {
    expect(sanitizeOrderLineDisplay(["brand", "x", "size", "brand", 3])).toEqual(["brand", "size"]);
  });
  it("dizi değilse null, boş dizi geçerli", () => {
    expect(sanitizeOrderLineDisplay("size")).toBeNull();
    expect(sanitizeOrderLineDisplay(null)).toBeNull();
    expect(sanitizeOrderLineDisplay([])).toEqual([]);
  });
});
