import { describe, it, expect } from "vitest";
import {
  countWorkingDays,
  hasAnyWorkingDay,
  isWithinBookableWindow,
  countOverlaps,
  type WorkingHours,
} from "./appointmentSlots";

describe("hasAnyWorkingDay", () => {
  it("null/undefined için false döner", () => {
    expect(hasAnyWorkingDay(null)).toBe(false);
    expect(hasAnyWorkingDay(undefined)).toBe(false);
  });

  it("hiçbir gün tanımlı değilse (boş obje) false döner", () => {
    expect(hasAnyWorkingDay({})).toBe(false);
  });

  it("tüm günler kapalı (hepsi null) işaretliyse false döner", () => {
    expect(hasAnyWorkingDay({ sun: null, mon: null })).toBe(false);
  });

  it("en az bir gün açıksa true döner", () => {
    expect(hasAnyWorkingDay({ sun: null, mon: { open: "09:00", close: "18:00" } })).toBe(true);
  });
});

describe("countWorkingDays", () => {
  it("çalışma saati hiç tanımlı değilse 0 döner", () => {
    expect(countWorkingDays(null, "2026-08-01", "2026-08-07")).toBe(0);
  });

  it("gerçek Ustalas verisiyle doğrulanmış senaryo: Pzt-Cmt açık, Pazar kapalı, 1 Ağu - 21 Eyl 2026 -> 44 iş günü", () => {
    // Bu oturumda gerçek prod veritabanına karşı çalıştırılıp doğrulanmış
    // sonuç (Ort. Günlük Tutar/Kâr özelliği) — regresyona karşı sabitleniyor.
    const workingHours: WorkingHours = {
      mon: { open: "08:30", close: "18:00" },
      tue: { open: "08:30", close: "18:00" },
      wed: { open: "08:30", close: "18:00" },
      thu: { open: "08:30", close: "18:00" },
      fri: { open: "08:30", close: "18:00" },
      sat: { open: "08:30", close: "16:00" },
      sun: null,
    };
    expect(countWorkingDays(workingHours, "2026-08-01", "2026-09-21")).toBe(44);
  });

  it("tek bir gün aralığı, o gün açıksa 1 döner", () => {
    // 2026-08-03 bir Pazartesi.
    const workingHours: WorkingHours = { mon: { open: "09:00", close: "18:00" } };
    expect(countWorkingDays(workingHours, "2026-08-03", "2026-08-03")).toBe(1);
  });

  it("tek bir gün aralığı, o gün kapalıysa 0 döner", () => {
    // 2026-08-02 bir Pazar.
    const workingHours: WorkingHours = { sun: null, mon: { open: "09:00", close: "18:00" } };
    expect(countWorkingDays(workingHours, "2026-08-02", "2026-08-02")).toBe(0);
  });

  it("tam bir hafta, sadece Pazar kapalıysa 6 döner", () => {
    const workingHours: WorkingHours = {
      sun: null,
      mon: { open: "09:00", close: "18:00" },
      tue: { open: "09:00", close: "18:00" },
      wed: { open: "09:00", close: "18:00" },
      thu: { open: "09:00", close: "18:00" },
      fri: { open: "09:00", close: "18:00" },
      sat: { open: "09:00", close: "18:00" },
    };
    // 2026-08-02 (Pazar) - 2026-08-08 (Cumartesi): tam 7 günlük bir hafta.
    expect(countWorkingDays(workingHours, "2026-08-02", "2026-08-08")).toBe(6);
  });
});

describe("isWithinBookableWindow", () => {
  const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

  // Testler HANGİ gün çalıştırılırsa çalıştırılsın deterministik kalsın diye
  // "yarın" (İstanbul yerel günü) baz alınıyor — fonksiyon gerçek Date.now()'a
  // göre "gelecekte mi" kontrolü yaptığından sabit geçmiş bir tarih kullanılamaz.
  function tomorrowIstanbul(): { dateStr: string; dayKey: (typeof DAY_KEYS)[number] } {
    const istanbulNow = new Date(Date.now() + 3 * 60 * 60000);
    const tomorrow = new Date(istanbulNow.getTime() + 24 * 60 * 60000);
    return { dateStr: tomorrow.toISOString().slice(0, 10), dayKey: DAY_KEYS[tomorrow.getUTCDay()] };
  }

  function istanbulTime(dateStr: string, hh: number, mm: number): Date {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d, hh - 3, mm, 0));
  }

  it("geçmişteki bir zamanı reddeder", () => {
    const past = new Date(Date.now() - 60 * 60000);
    const { dayKey } = tomorrowIstanbul();
    const workingHours: WorkingHours = { [dayKey]: { open: "00:00", close: "23:59" } };
    expect(isWithinBookableWindow(past, 30, workingHours)).toBe(false);
  });

  it("maxDaysAhead sınırının ötesindeki bir zamanı reddeder", () => {
    const farFuture = new Date(Date.now() + 60 * 24 * 60 * 60000);
    expect(isWithinBookableWindow(farFuture, 30, { mon: { open: "00:00", close: "23:59" } }, 30)).toBe(false);
  });

  it("çalışma saatleri hiç tanımlı değilse (o gün kapalı) reddeder", () => {
    const { dateStr } = tomorrowIstanbul();
    expect(isWithinBookableWindow(istanbulTime(dateStr, 12, 0), 30, null)).toBe(false);
  });

  it("çalışma saatleri içindeki bir zamanı kabul eder", () => {
    const { dateStr, dayKey } = tomorrowIstanbul();
    const workingHours: WorkingHours = { [dayKey]: { open: "09:00", close: "18:00" } };
    expect(isWithinBookableWindow(istanbulTime(dateStr, 10, 0), 30, workingHours)).toBe(true);
  });

  it("açılıştan önceki bir zamanı reddeder", () => {
    const { dateStr, dayKey } = tomorrowIstanbul();
    const workingHours: WorkingHours = { [dayKey]: { open: "09:00", close: "18:00" } };
    expect(isWithinBookableWindow(istanbulTime(dateStr, 8, 30), 30, workingHours)).toBe(false);
  });

  it("süre eklenince kapanışı aşan bir zamanı reddeder", () => {
    const { dateStr, dayKey } = tomorrowIstanbul();
    const workingHours: WorkingHours = { [dayKey]: { open: "09:00", close: "18:00" } };
    // 17:45 + 30dk = 18:15 > 18:00
    expect(isWithinBookableWindow(istanbulTime(dateStr, 17, 45), 30, workingHours)).toBe(false);
  });

  it("süre eklenince TAM kapanışa denk gelen bir zamanı kabul eder (sınır dahil)", () => {
    const { dateStr, dayKey } = tomorrowIstanbul();
    const workingHours: WorkingHours = { [dayKey]: { open: "09:00", close: "18:00" } };
    // 17:30 + 30dk = 18:00, kapanışa TAM denk geliyor.
    expect(isWithinBookableWindow(istanbulTime(dateStr, 17, 30), 30, workingHours)).toBe(true);
  });
});

describe("countOverlaps", () => {
  const iv = (startISO: string, endISO: string) => ({ start: new Date(startISO), end: new Date(endISO) });

  it("hiç aralık yoksa 0 döner", () => {
    expect(countOverlaps([], new Date("2026-01-01T10:00:00Z"), new Date("2026-01-01T10:30:00Z"))).toBe(0);
  });

  it("tamamen içindeki bir aralığı sayar", () => {
    const busy = [iv("2026-01-01T10:00:00Z", "2026-01-01T10:30:00Z")];
    expect(countOverlaps(busy, new Date("2026-01-01T09:00:00Z"), new Date("2026-01-01T12:00:00Z"))).toBe(1);
  });

  it("sorgu penceresinden tamamen ÖNCEKİ bir aralığı saymaz", () => {
    const busy = [iv("2026-01-01T07:00:00Z", "2026-01-01T08:00:00Z")];
    expect(countOverlaps(busy, new Date("2026-01-01T09:00:00Z"), new Date("2026-01-01T10:00:00Z"))).toBe(0);
  });

  it("sorgu penceresinden tamamen SONRAKİ bir aralığı saymaz", () => {
    const busy = [iv("2026-01-01T12:00:00Z", "2026-01-01T13:00:00Z")];
    expect(countOverlaps(busy, new Date("2026-01-01T09:00:00Z"), new Date("2026-01-01T10:00:00Z"))).toBe(0);
  });

  it("tam sınırda dokunan (çakışmayan) aralıkları saymaz — bitiş=başlangıç", () => {
    const busy = [iv("2026-01-01T08:00:00Z", "2026-01-01T09:00:00Z")];
    // busy.end (09:00) === query start (09:00) -> strict "<"/">" ile çakışma yok.
    expect(countOverlaps(busy, new Date("2026-01-01T09:00:00Z"), new Date("2026-01-01T10:00:00Z"))).toBe(0);
  });

  it("kısmen çakışan bir aralığı sayar", () => {
    const busy = [iv("2026-01-01T09:45:00Z", "2026-01-01T10:15:00Z")];
    expect(countOverlaps(busy, new Date("2026-01-01T10:00:00Z"), new Date("2026-01-01T10:30:00Z"))).toBe(1);
  });

  it("birden fazla çakışan aralığı doğru sayar, çakışmayanları saymaz", () => {
    const busy = [
      iv("2026-01-01T10:00:00Z", "2026-01-01T10:30:00Z"), // çakışıyor
      iv("2026-01-01T10:15:00Z", "2026-01-01T10:45:00Z"), // çakışıyor
      iv("2026-01-01T07:00:00Z", "2026-01-01T08:00:00Z"), // çakışmıyor
    ];
    expect(countOverlaps(busy, new Date("2026-01-01T10:00:00Z"), new Date("2026-01-01T10:30:00Z"))).toBe(2);
  });
});
