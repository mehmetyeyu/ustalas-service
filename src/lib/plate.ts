// Plaka biçimi — araç kaydının (vehicles) anahtarı. Firmalar geçmişte
// perakende satışlarda plakayı "sallama" giriyordu (zorunlu alan); bu yüzden
// yalnızca gerçek Türk plaka biçimine uyan plakalar araç olarak kaydedilir,
// geri kalanı siparişte metin olarak kalır ama hiçbir araca bağlanmaz.

// "34 abc 123", "34-ABC-123" → "34ABC123". Türkçe klavyede küçük "i" büyük
// harfe "İ" olur; plakada noktalı İ yok, I'ya çevrilir.
export function normalizePlate(raw: string | null | undefined): string {
  return String(raw ?? "")
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I")
    .replace(/[^0-9A-ZÇĞÖŞÜ]/g, "");
}

// Plakalarda kullanılan harfler: Q, W, X ve Türkçe karakterler yok.
const L = "[ABCDEFGHIJKLMNOPRSTUVYZ]";
// İl kodu 01–81; harf sayısına göre rakam sayısı:
// 1 harf → 4–5 rakam, 2 harf → 3–4, 3 harf → 2–3. Rakamların hepsi 0 olamaz.
const PLATE_RE = new RegExp(`^(0[1-9]|[1-7][0-9]|8[01])(${L}\\d{4,5}|${L}{2}\\d{3,4}|${L}{3}\\d{2,3})$`);

export function isValidTrPlate(normalized: string): boolean {
  if (!PLATE_RE.test(normalized)) return false;
  return !/^\d{2}[A-Z]+0+$/.test(normalized);
}

// Ekranda okunaklı yazım: "34ABC123" → "34 ABC 123". Biçime uymayan
// değer olduğu gibi döner.
export function formatPlate(normalized: string): string {
  const m = normalized.match(/^(\d{2})([A-Z]{1,3})(\d+)$/);
  return m ? `${m[1]} ${m[2]} ${m[3]}` : normalized;
}
