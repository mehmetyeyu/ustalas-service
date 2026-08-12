// Excel, hücre değeri =, +, -, @ ile başlıyorsa bunu formül sanıp açılışta
// çalıştırabilir (CSV/Excel injection). Serbest metin alanları (müşteri adı,
// açıklama, marka vb.) dışa aktarılırken önlerine tek tırnak eklenerek metne
// zorlanır.
const FORMULA_PREFIXES = ["=", "+", "-", "@"];

function escapeExcelFormula(value: string): string {
  return FORMULA_PREFIXES.some((p) => value.startsWith(p)) ? `'${value}` : value;
}

export function sanitizeExcelRow<T extends Record<string, unknown>>(row: T): T {
  const out = { ...row };
  for (const key in out) {
    const v = out[key];
    if (typeof v === "string") {
      (out as Record<string, unknown>)[key] = escapeExcelFormula(v) as T[typeof key];
    }
  }
  return out;
}
