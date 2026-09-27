import { describe, it, expect } from "vitest";
import { buildMonthGrid, monthGridRange } from "./calendarGrid";

describe("buildMonthGrid", () => {
  it("her zaman 42 (6x7) hücre döner", () => {
    expect(buildMonthGrid(2026, 9).length).toBe(42);
    expect(buildMonthGrid(2026, 2).length).toBe(42); // Şubat gibi kısa bir ay da
  });

  it("ızgara Pazartesi ile başlar", () => {
    const grid = buildMonthGrid(2026, 9);
    const firstDate = new Date(`${grid[0].date}T00:00:00`);
    expect(firstDate.getDay()).toBe(1); // 1 = Pazartesi
  });

  it("ayın kendi günleri inCurrentMonth=true, taşan günler false işaretlenir", () => {
    // Eylül 2026: 1 Eylül Salı — ızgara bir önceki Pazartesi'den (31 Ağustos) başlar.
    const grid = buildMonthGrid(2026, 9);
    expect(grid[0].date).toBe("2026-08-31");
    expect(grid[0].inCurrentMonth).toBe(false);
    const sep1 = grid.find((d) => d.date === "2026-09-01");
    expect(sep1?.inCurrentMonth).toBe(true);
    const sep30 = grid.find((d) => d.date === "2026-09-30");
    expect(sep30?.inCurrentMonth).toBe(true);
  });

  it("isToday sadece verilen referans tarihe eşit günde true olur", () => {
    const grid = buildMonthGrid(2026, 9, new Date("2026-09-15T12:00:00"));
    const match = grid.filter((d) => d.isToday);
    expect(match.length).toBe(1);
    expect(match[0].date).toBe("2026-09-15");
  });
});

describe("monthGridRange", () => {
  it("ızgaranın ilk ve son hücresinin tarihini (taşan günler dahil) döner", () => {
    const range = monthGridRange(2026, 9);
    const grid = buildMonthGrid(2026, 9);
    expect(range.from).toBe(grid[0].date);
    expect(range.to).toBe(grid[41].date);
  });
});
