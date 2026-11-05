// TC kimlik no (TCKN, 11 hane) ve vergi kimlik no (VKN, 10 hane) doğrulama —
// e-Fatura/e-Arşiv alıcısı için (bkz. docs/e-fatura-tasarim.md §5.1, §12.5).
// Saf fonksiyonlar; hem form hem API kullanır.

// GİB'in nihai tüketici yer tutucusu: bireysel müşteri TC vermek istemezse
// faturaya bu yazılır (kullanıcı kararı 2026-10-30: baştan seçenek olarak).
export const ANONYMOUS_TCKN = "11111111111";

export function normalizeTaxId(v: unknown): string {
  return String(v ?? "").replace(/\s+/g, "");
}

export function isValidTckn(v: string): boolean {
  if (!/^[1-9]\d{10}$/.test(v)) return false;
  const d = v.split("").map(Number);
  const odd = d[0] + d[2] + d[4] + d[6] + d[8];
  const even = d[1] + d[3] + d[5] + d[7];
  const d10 = (((odd * 7 - even) % 10) + 10) % 10;
  if (d10 !== d[9]) return false;
  const d11 = d.slice(0, 10).reduce((s, x) => s + x, 0) % 10;
  return d11 === d[10];
}

// GİB VKN kontrol hanesi algoritması.
export function isValidVkn(v: string): boolean {
  if (!/^\d{10}$/.test(v)) return false;
  const d = v.split("").map(Number);
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const t = (d[i] + 9 - i) % 10;
    let p = (t * 2 ** (9 - i)) % 9;
    if (t !== 0 && p === 0) p = 9;
    sum += p;
  }
  return (10 - (sum % 10)) % 10 === d[9];
}

export type TaxIdKind = "tckn" | "vkn";

// 10 hane VKN, 11 hane TCKN (şahıs şirketi de TCKN ile e-Fatura mükellefi
// olabilir). Geçersizse null.
export function classifyTaxId(raw: unknown): TaxIdKind | null {
  const v = normalizeTaxId(raw);
  if (v.length === 10) return isValidVkn(v) ? "vkn" : null;
  if (v.length === 11) return isValidTckn(v) ? "tckn" : null;
  return null;
}
