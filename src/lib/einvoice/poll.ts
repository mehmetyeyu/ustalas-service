// Fatura işlenirken ekranların durum ucunu yoklama aralığı. Paraşüt'te
// webhook yok; her yoklama sunucuda bir istek (ve çoğu zaman Paraşüt'e bir
// çağrı) demek — Vercel CPU'su için ilk 30 sn sık, sonra seyrek yoklanır
// (fatura başına en çok ~25 istek, sabit 3 sn'de ~60 idi; performans
// incelemesi 2026-11-06). 3 dk'da bitmezse yoklama bırakılır; günlük bakım
// (sweep.ts) tamamlar.
export const POLL_MAX_MS = 3 * 60 * 1000;

export function pollDelay(startedAt: number, now = Date.now()): number {
  return now - startedAt < 30_000 ? 3000 : 10_000;
}
