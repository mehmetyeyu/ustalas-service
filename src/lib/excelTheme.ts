import type { Cell, CellObject, Row } from "write-excel-file/node";
import { sanitizeExcelCell } from "./excelSafety";

// Elevire temalı tek sayfalık Excel: lacivert (kenar menüsü) sabit başlık,
// ince satır çizgileri, açık gri toplam satırları, büyük tutarlar. Renkler
// panelin v2 değişkenleriyle aynı (src/app/globals.css). SheetJS'in ücretsiz
// sürümü biçim yazamadığı için write-excel-file kullanılır; yalnızca
// indirmede yüklenir (dinamik import).
const COLOR = {
  headBg: "#0E1A2B", // v2-sidebar
  headFg: "#FFFFFF",
  headLine: "#6EA0F0", // v2-accent
  line: "#E3E7ED", // v2-line
  totalBg: "#F1F3F7", // v2-muted
  fg: "#0F172A", // v2-fg
  muted: "#475569", // v2-fg-muted
  subtle: "#64748B", // v2-fg-subtle
  link: "#1E4E9C", // v2-link
  red: "#DC2626",
  green: "#16A34A",
};
const FONT_SIZE = 10;
const MONEY_FONT_SIZE = 12;

export type ExcelCell = string | number | Date | null;

// head: başlık · row: normal · cont: önceki satırın devamı (tekrar eden
// sütunlar soluk) · total: ara/son toplam.
export interface ExcelThemeRow { kind: "head" | "row" | "cont" | "total"; cells: ExcelCell[] }

export interface ExcelThemeColumn {
  width: number;
  money?: boolean;
  tone?: "link" | "muted" | "red" | "green";
  repeats?: boolean; // devam satırlarında tekrar eden sütun
  wrap?: boolean;
}

// Sarılan sütunlardaki en uzun metne göre satır yüksekliği (punto) — elle
// verilen yükseklikte Excel kendisi büyütmez. 409: Excel'in üst sınırı.
export function excelRowHeight(row: ExcelThemeRow, columns: ExcelThemeColumn[]): number {
  if (row.kind === "head") return 28;
  const lines = Math.max(1, ...row.cells.map((v, c) =>
    columns[c]?.wrap && typeof v === "string"
      ? v.split("\n").reduce((n, part) => n + Math.max(1, Math.ceil(part.length / (columns[c].width * 0.95))), 0)
      : 1
  ));
  return Math.min(409, lines * 14 + 8);
}

export function excelThemeCells(row: ExcelThemeRow, columns: ExcelThemeColumn[]): Row {
  const height = excelRowHeight(row, columns);
  return row.cells.map((raw, c): Cell => {
    const col = columns[c];
    const head = row.kind === "head";
    const style: CellObject = {
      fontFamily: "Arial",
      fontSize: col.money && !head ? MONEY_FONT_SIZE : FONT_SIZE,
      align: col.money ? "right" : "left",
      alignVertical: "center",
      textColor: COLOR.fg,
      bottomBorderColor: COLOR.line,
      bottomBorderStyle: "thin",
      wrap: Boolean(col.wrap) && !head,
      height,
    };
    if (head) {
      Object.assign(style, { backgroundColor: COLOR.headBg, textColor: COLOR.headFg, fontWeight: "bold", bottomBorderColor: COLOR.headLine, bottomBorderStyle: "medium" });
    } else if (row.kind === "total") {
      Object.assign(style, { backgroundColor: COLOR.totalBg, fontWeight: "bold" });
    } else if (row.kind === "cont" && col.repeats) {
      style.textColor = COLOR.subtle;
    } else if (col.tone) {
      style.textColor = COLOR[col.tone];
    }
    const v = sanitizeExcelCell(raw);
    if (v === null || v === "") return style;
    if (v instanceof Date) return { ...style, value: v, type: Date, format: "dd.mm.yyyy" };
    if (typeof v === "number") return { ...style, value: v, type: Number, format: "#,##0.00" };
    return { ...style, value: v, type: String };
  });
}

// rows[0] başlıktır; süzgeç başlıktan son satıra. Date hücreleri UTC gece
// yarısı olmalı (kütüphane UTC'ye göre çevirir).
export async function buildThemedExcel(sheet: string, columns: ExcelThemeColumn[], rows: ExcelThemeRow[]): Promise<Buffer> {
  const [{ default: writeExcelFile }, { getCellAddress, getOrderOfSiblings, insertElementMarkupAccordingToOrderOfSiblings }] = await Promise.all([
    import("write-excel-file/node"),
    import("write-excel-file/utility"),
  ]);
  const sheetXml = "xl/worksheets/sheet{id}.xml";
  const ref = `A1:${getCellAddress(rows.length - 1, columns.length - 1)}`;
  const addAutoFilter = (xml: string) =>
    insertElementMarkupAccordingToOrderOfSiblings(xml, `<autoFilter ref="${ref}"/>`, getOrderOfSiblings(sheetXml, "worksheet") ?? [], "worksheet");
  return writeExcelFile(
    rows.map((r) => excelThemeCells(r, columns)),
    { sheet, columns: columns.map(({ width }) => ({ width })), stickyRowsCount: 1, showGridLines: false, orientation: "landscape" },
    { features: [{ files: { transform: { [sheetXml]: { transform: addAutoFilter } } } }] }
  ).toBuffer();
}
