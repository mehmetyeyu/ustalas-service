interface QueryClient {
  query<T = unknown>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface DayWindow {
  open: string;  // "HH:MM"
  close: string; // "HH:MM"
}

export type WorkingHours = Partial<Record<"sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat", DayWindow | null>>;

// JS Date#getDay() sırasıyla aynı (0=Pazar).
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

const SLOT_STEP_MINUTES = 15;
const DEFAULT_DURATION_MINUTES = 30;

// Türkiye sabit UTC+3 kullanır (2016'dan beri yaz saati yok) — bkz.
// src/lib/orderQuery.ts'teki istanbulDayStartUTC ile aynı gerekçe/desen,
// burada gün + saat:dakika birlikte UTC'ye çevriliyor.
function istanbulLocalToUTC(dateStr: string, hh: number, mm: number): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh - 3, mm, 0));
}

function dayKeyForDate(dateStr: string): (typeof DAY_KEYS)[number] {
  // Gün adını hesaplamak için gerçek takvim gününü (yerel gece yarısı UTC+3)
  // baz alıyoruz — sunucunun kendi saat dilimine bağlı kalmamak için.
  const noonUTC = istanbulLocalToUTC(dateStr, 12, 0);
  return DAY_KEYS[noonUTC.getUTCDay()];
}

export function getDayWindow(workingHours: WorkingHours | null | undefined, dateStr: string): DayWindow | null {
  if (!workingHours) return null;
  return workingHours[dayKeyForDate(dateStr)] ?? null;
}

// UTC bir Date'i Istanbul yerel (YYYY-MM-DD, gece yarısından bu yana dakika)
// bileşenlerine çevirir — istanbulLocalToUTC'nin tersi.
function toIstanbulLocalParts(date: Date): { dateStr: string; minutesSinceMidnight: number } {
  const shifted = new Date(date.getTime() + 3 * 60 * 60000);
  const dateStr = shifted.toISOString().slice(0, 10);
  const minutesSinceMidnight = shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
  return { dateStr, minutesSinceMidnight };
}

export const DEFAULT_MAX_DAYS_AHEAD = 30;

// requested_at'in GERÇEKTEN randevuya açık bir zaman dilimine düştüğünü
// doğrular — client'ın (veya doğrudan API'ye istek atan herhangi birinin,
// ör. Postman) hangi saati "gösterdiğine" güvenilmez. Kontrol eder:
// geçmişte olmama, firmanın belirlediği gelecek penceresi içinde olma
// (bkz. app_settings.booking_max_days_ahead — sınırsız olursa IP/telefon
// limitleri takvime yayılarak aşılabilir), o günün açık olması ve saatin
// çalışma saatleri + hizmet süresi içine sığması. isSlotStillAvailable
// SADECE kapasiteyi kontrol eder, bu fonksiyon SADECE zamanın kendisinin
// geçerli olup olmadığını — ikisi birlikte kullanılmalı.
export function isWithinBookableWindow(
  requestedAt: Date,
  durationMinutes: number,
  workingHours: WorkingHours | null | undefined,
  maxDaysAhead: number = DEFAULT_MAX_DAYS_AHEAD
): boolean {
  const now = new Date();
  if (requestedAt.getTime() <= now.getTime()) return false;
  const maxDate = new Date(now.getTime() + maxDaysAhead * 24 * 60 * 60000);
  if (requestedAt.getTime() > maxDate.getTime()) return false;

  const { dateStr, minutesSinceMidnight } = toIstanbulLocalParts(requestedAt);
  const window = getDayWindow(workingHours, dateStr);
  if (!window) return false;

  const [oh, om] = window.open.split(":").map(Number);
  const [ch, cm] = window.close.split(":").map(Number);
  const openMinutes = oh * 60 + om;
  const closeMinutes = ch * 60 + cm;
  if (minutesSinceMidnight < openMinutes) return false;
  if (minutesSinceMidnight + durationMinutes > closeMinutes) return false;
  return true;
}

interface BusyInterval {
  start: Date;
  end: Date;
}

// O tenant için verilen gün aralığındaki (henüz reddedilmemiş/iptal edilmemiş)
// tüm randevuların dolu zaman aralıklarını getirir. Süre, randevunun bağlı
// olduğu hizmetin duration_minutes'ından gelir; hizmet yoksa/süresi
// tanımlanmamışsa varsayılan süre kullanılır.
async function getBusyIntervals(
  client: QueryClient,
  tenantId: number,
  dayStartUTC: Date,
  dayEndUTC: Date
): Promise<BusyInterval[]> {
  const result = await client.query<{ requested_at: string; duration: number }>(
    `SELECT a.requested_at, COALESCE(s.duration_minutes, $4) AS duration
     FROM appointments a
     LEFT JOIN services s ON s.id = a.service_id
     WHERE a.tenant_id = $1 AND a.status IN ('BEKLEMEDE', 'ONAYLANDI')
       AND a.requested_at >= $2 AND a.requested_at < $3`,
    [tenantId, dayStartUTC.toISOString(), dayEndUTC.toISOString(), DEFAULT_DURATION_MINUTES]
  );
  return result.rows.map((r) => {
    const start = new Date(r.requested_at);
    return { start, end: new Date(start.getTime() + r.duration * 60000) };
  });
}

function countOverlaps(intervals: BusyInterval[], start: Date, end: Date): number {
  return intervals.filter((iv) => iv.start < end && iv.end > start).length;
}

// Bir gün için, seçilen hizmetin süresine göre müsait randevu başlangıç
// saatlerini (ISO string, UTC) döndürür. Naif saat-sayacı DEĞİL, gerçek
// zaman-aralığı çakışma sayımı — bkz. proje planı "kapasite matematiği" notu.
export async function getAvailableSlots(
  client: QueryClient,
  tenantId: number,
  dateStr: string,
  durationMinutes: number,
  workingHours: WorkingHours | null | undefined,
  capacity: number,
  maxDaysAhead: number = DEFAULT_MAX_DAYS_AHEAD
): Promise<string[]> {
  const window = getDayWindow(workingHours, dateStr);
  if (!window) return [];

  // isWithinBookableWindow'daki üst sınırla tutarlı olsun diye — bu sayede
  // form, kayıt anında zaten reddedilecek bir tarih için "müsait" slot
  // göstermez.
  const now = new Date();
  const maxDate = new Date(now.getTime() + maxDaysAhead * 24 * 60 * 60000);
  const requestedDayStart = istanbulLocalToUTC(dateStr, 0, 0);
  if (requestedDayStart.getTime() > maxDate.getTime()) return [];

  const [oh, om] = window.open.split(":").map(Number);
  const [ch, cm] = window.close.split(":").map(Number);
  const dayStartUTC = istanbulLocalToUTC(dateStr, oh, om);
  const closeUTC = istanbulLocalToUTC(dateStr, ch, cm);
  // Meşgul aralıkları çekerken güne biraz taşan (bir önceki günden başlayıp
  // bu güne sarkan) randevuları da yakalamak için 24 saatlik geniş bir
  // pencere kullanılıyor — gün sınırı tam olarak sadece çalışma saatleri
  // penceresiyle sınırlı değil.
  const scanStartUTC = new Date(dayStartUTC.getTime() - 24 * 60 * 60000);
  const scanEndUTC = new Date(closeUTC.getTime() + 24 * 60 * 60000);
  const busy = await getBusyIntervals(client, tenantId, scanStartUTC, scanEndUTC);

  const slots: string[] = [];
  const stepMs = SLOT_STEP_MINUTES * 60000;
  const durationMs = durationMinutes * 60000;
  for (let t = dayStartUTC.getTime(); t + durationMs <= closeUTC.getTime(); t += stepMs) {
    const start = new Date(t);
    const end = new Date(t + durationMs);
    if (countOverlaps(busy, start, end) < capacity) {
      slots.push(start.toISOString());
    }
  }
  return slots;
}

// Kayıt anında (POST) tekrar doğrulama — iki müşteri aynı slotu aynı anda
// seçebilir (yarış durumu). Çağıran, bunu bir transaction içinde ve ilgili
// randevu satırlarını FOR UPDATE ile kilitleyerek çağırmalı (bkz.
// src/lib/productStock.ts'teki desen) ki eşzamanlı iki istek kapasiteyi
// aşarak ikisi de kabul edilmesin.
export async function isSlotStillAvailable(
  client: QueryClient,
  tenantId: number,
  requestedAt: Date,
  durationMinutes: number,
  capacity: number
): Promise<boolean> {
  const end = new Date(requestedAt.getTime() + durationMinutes * 60000);
  // FOR UPDATE: bu aralıkla çakışabilecek randevu satırlarını kilitler —
  // aynı anda çalışan başka bir istek aynı satırları görene kadar bekler.
  const result = await client.query<{ requested_at: string; duration: number }>(
    `SELECT a.requested_at, COALESCE(s.duration_minutes, $4) AS duration
     FROM appointments a
     LEFT JOIN services s ON s.id = a.service_id
     WHERE a.tenant_id = $1 AND a.status IN ('BEKLEMEDE', 'ONAYLANDI')
       AND a.requested_at >= $2 AND a.requested_at < $3
     FOR UPDATE OF a`,
    [
      tenantId,
      new Date(requestedAt.getTime() - 24 * 60 * 60000).toISOString(),
      new Date(end.getTime() + 24 * 60 * 60000).toISOString(),
      DEFAULT_DURATION_MINUTES,
    ]
  );
  const busy: BusyInterval[] = result.rows.map((r) => {
    const start = new Date(r.requested_at);
    return { start, end: new Date(start.getTime() + r.duration * 60000) };
  });
  return countOverlaps(busy, requestedAt, end) < capacity;
}

export { DEFAULT_DURATION_MINUTES };
