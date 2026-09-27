// Takvim (Google Takvim benzeri ay görünümü) için 6x7'lik hücre ızgarası —
// önceki/sonraki aydan taşan günler dahil, Pazartesi başlangıçlı (Raporlar
// sayfasındaki weekRange ile aynı hafta-başlangıcı konvansiyonu, bkz.
// src/app/admin/reports/page.tsx). Saf fonksiyon — saat dilimi kayması riski
// olmasın diye her yerde yerel (Date.UTC değil, native Date) tarih aritmetiği
// kullanılır, tarihler her zaman YYYY-MM-DD string olarak üretilir.

export interface CalendarDay {
  date: string; // YYYY-MM-DD
  day: number;
  inCurrentMonth: boolean;
  isToday: boolean;
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Ayın 1'inin haftanın kaçıncı günü olduğuna bakılmaksızın, HER ZAMAN
// Pazartesi'den başlayan tam haftalar halinde 6x7=42 hücre döner — ay
// değiştikçe ızgara boyu sabit kalsın diye (5 haftaya sığan aylarda bile
// 6. hafta bir sonraki aydan taşan günlerle doldurulur).
export function buildMonthGrid(year: number, month: number, today: Date = new Date()): CalendarDay[] {
  const firstOfMonth = new Date(year, month - 1, 1);
  const firstWeekday = (firstOfMonth.getDay() + 6) % 7; // 0=Pazartesi
  const gridStart = new Date(year, month - 1, 1 - firstWeekday);
  const todayStr = toDateStr(today);

  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    const dateStr = toDateStr(d);
    return {
      date: dateStr,
      day: d.getDate(),
      inCurrentMonth: d.getMonth() === month - 1 && d.getFullYear() === year,
      isToday: dateStr === todayStr,
    };
  });
}

// Izgaranın kapsadığı tam aralık — appointments/calendar_notes'u tek bir
// from/to sorgusuyla çekebilmek için (taşan günler dahil, böylece önceki/
// sonraki aydan görünen günlerin randevusu da eksiksiz gelir).
export function monthGridRange(year: number, month: number): { from: string; to: string } {
  const grid = buildMonthGrid(year, month);
  return { from: grid[0].date, to: grid[grid.length - 1].date };
}
