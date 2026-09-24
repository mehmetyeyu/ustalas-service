import * as XLSX from "xlsx";

// İçe aktarma sayfalarındaki "Şablon İndir" bağlantıları için: başlık satırı +
// bir örnek satırdan oluşan minimal bir .xlsx üretir (gerçek veri içermez).
// extraSheets: kapalı listeli alanlar (ör. Mevsim) için "Geçerli Değerler"
// gibi bir referans sayfası eklemek isteyen çağıranlar için — opsiyonel,
// mevcut çağıranları etkilemez. Ücretsiz xlsx sürümü hücre içi açılır liste
// (DataValidation) YAZMAYI desteklemiyor (kontrol edildi) — bu yüzden gerçek
// bir dropdown yerine, kullanıcının başvurabileceği ayrı bir sayfa.
export function buildTemplateBuffer(
  sheetName: string,
  headers: string[],
  exampleRow: (string | number | Date | null)[],
  colWidths: number[],
  extraSheets?: { name: string; rows: (string | number | null)[][] }[]
) {
  const ws = XLSX.utils.aoa_to_sheet([headers, exampleRow]);
  ws["!cols"] = colWidths.map((wch) => ({ wch }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  for (const sheet of extraSheets ?? []) {
    const extraWs = XLSX.utils.aoa_to_sheet(sheet.rows);
    XLSX.utils.book_append_sheet(wb, extraWs, sheet.name);
  }

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}
