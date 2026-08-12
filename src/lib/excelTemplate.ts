import * as XLSX from "xlsx";

// İçe aktarma sayfalarındaki "Şablon İndir" bağlantıları için: başlık satırı +
// bir örnek satırdan oluşan minimal bir .xlsx üretir (gerçek veri içermez).
export function buildTemplateBuffer(
  sheetName: string,
  headers: string[],
  exampleRow: (string | number | Date | null)[],
  colWidths: number[]
) {
  const ws = XLSX.utils.aoa_to_sheet([headers, exampleRow]);
  ws["!cols"] = colWidths.map((wch) => ({ wch }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}
