import { describe, it, expect } from "vitest";
import { sanitizeExcelRow } from "./excelSafety";

describe("sanitizeExcelRow", () => {
  it.each(["=", "+", "-", "@"])("'%s' ile başlayan bir hücreyi tek tırnakla metne zorlar", (prefix) => {
    const row = { note: `${prefix}cmd|'/C calc'!A1` };
    expect(sanitizeExcelRow(row).note).toBe(`'${prefix}cmd|'/C calc'!A1`);
  });

  it("formül önekiyle başlamayan normal metne dokunmaz", () => {
    const row = { name: "Ahmet Yılmaz", note: "Normal bir not" };
    expect(sanitizeExcelRow(row)).toEqual(row);
  });

  it("sayısal ve boolean alanları (string olmadıkları için) değiştirmez", () => {
    const row = { amount: 1000, active: true, note: "=SUM(A1:A2)" };
    const result = sanitizeExcelRow(row);
    expect(result.amount).toBe(1000);
    expect(result.active).toBe(true);
    expect(result.note).toBe("'=SUM(A1:A2)");
  });

  it("orijinal nesneyi mutasyona uğratmaz (yeni bir nesne döner)", () => {
    const row = { note: "=1+1" };
    const result = sanitizeExcelRow(row);
    expect(row.note).toBe("=1+1");
    expect(result.note).toBe("'=1+1");
    expect(result).not.toBe(row);
  });

  it("birden fazla string alanı olan bir satırda hepsini ayrı ayrı kontrol eder", () => {
    const row = { a: "=A", b: "safe", c: "+B", d: "@C", e: "-D" };
    expect(sanitizeExcelRow(row)).toEqual({ a: "'=A", b: "safe", c: "'+B", d: "'@C", e: "'-D" });
  });
});
