// Depolama "Teslim Et" açıklaması — ekran ve API aynı sınırı kullanır.
export const TESLIM_ACIKLAMA_MAX = 300;

// Boş/geçersiz → null (açıklama isteğe bağlı).
export function normalizeTeslimAciklama(v: unknown): string | null {
  if (typeof v !== "string") return null;
  return v.trim().slice(0, TESLIM_ACIKLAMA_MAX).trim() || null;
}
