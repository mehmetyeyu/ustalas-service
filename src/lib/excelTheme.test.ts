import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { buildThemedExcel, excelRowHeight, excelThemeCells, type ExcelThemeColumn, type ExcelThemeRow } from "./excelTheme";

const cols: ExcelThemeColumn[] = [{ width: 12, tone: "link", repeats: true }, { width: 12 }, { width: 20, wrap: true }, { width: 15, money: true, tone: "red" }];
const rows: ExcelThemeRow[] = [
  { kind: "head", cells: ["No", "Tarih", "Açıklama", "Borç"] },
  { kind: "row", cells: ["#1", new Date(Date.UTC(2026, 10, 24)), "=HYPERLINK(\"x\") <&> \u0007 İğneğç", 1234.5] },
  { kind: "cont", cells: ["#1", "", "", ""] },
  { kind: "total", cells: ["", "", "Toplam", 0] },
];

describe("excelTheme", () => {
  it("okunabilir xlsx: süzgeç, gerçek tarih (saatsiz) ve sayı, formül enjeksiyonu yok", async () => {
    const wb = XLSX.read(await buildThemedExcel("Cari Hareketler", cols, rows), { cellFormula: true, cellNF: true });
    expect(wb.SheetNames).toEqual(["Cari Hareketler"]);
    const ws = wb.Sheets["Cari Hareketler"];
    expect(ws["!autofilter"]).toEqual({ ref: "A1:D4" });
    expect(ws.B2).toMatchObject({ t: "n", v: 46350, z: "dd.mm.yyyy" });
    expect(ws.D2).toMatchObject({ t: "n", v: 1234.5, z: "#,##0.00" });
    expect(ws.D4.v).toBe(0);
    expect(ws.C2.t).toBe("s");
    expect(ws.C2.f).toBeUndefined();
    expect(ws.C2.v).toContain("'=HYPERLINK(\"x\") <&>");
    expect(ws.C2.v).toContain("İğneğç");
  });
  it("biçim: tutar büyük, devam satırı soluk, toplam kalın", () => {
    const [row, cont, total] = rows.slice(1).map((r) => excelThemeCells(r, cols));
    expect(row[3]).toMatchObject({ fontSize: 12, align: "right", textColor: "#DC2626" });
    expect(row[0]).toMatchObject({ fontSize: 10, textColor: "#1E4E9C" });
    expect(cont[0]).toMatchObject({ textColor: "#64748B" });
    expect(total[3]).toMatchObject({ fontWeight: "bold", textColor: "#0F172A" });
  });
  it("uzun açıklamada satır yükselir", () => {
    expect(excelRowHeight({ kind: "row", cells: ["", "", "kısa", 1] }, cols)).toBe(22);
    expect(excelRowHeight({ kind: "row", cells: ["", "", "x".repeat(50), 1] }, cols)).toBe(50);
    expect(excelRowHeight({ kind: "row", cells: ["", "", "a\nb", 1] }, cols)).toBe(36);
    expect(excelRowHeight({ kind: "row", cells: ["", "", "x".repeat(5000), 1] }, cols)).toBe(409);
  });
});
