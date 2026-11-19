import { describe, it, expect } from "vitest";
import {
  parseStorageTires, summarizeStorageTires, resolveStorageTireColumns, layoutOf, rftLabel,
  StorageTiresValidationError,
} from "./storageTires";

const year = (y: number) => (y < 100 ? y + 2000 : y);
const tire = (konum: string, extra: Record<string, unknown> = {}) => ({ konum, ebat: "225/45R18", marka: "Michelin", ...extra });

describe("parseStorageTires", () => {
  it("null → hepsi aynı", () => {
    expect(parseStorageTires(null, year)).toBeNull();
    expect(parseStorageTires(undefined, year)).toBeNull();
  });

  it("ön/arka düzeni, adetler düzenden gelir", () => {
    const t = parseStorageTires([tire("Ön", { adet: 9 }), tire("Arka", { production_year: 24, production_week: 10 })], year)!;
    expect(t.map((x) => [x.konum, x.adet])).toEqual([["Ön", 2], ["Arka", 2]]);
    expect(t[1].production_year).toBe(2024);
  });

  it("dört konum", () => {
    const t = parseStorageTires(["Ön Sol", "Ön Sağ", "Arka Sol", "Arka Sağ"].map((k) => tire(k)), year)!;
    expect(t).toHaveLength(4);
    expect(layoutOf(t)).toBe("tek");
  });

  it("geçersiz konum/sıra/uzunluk reddedilir", () => {
    expect(() => parseStorageTires([tire("Arka"), tire("Ön")], year)).toThrow(StorageTiresValidationError);
    expect(() => parseStorageTires([tire("Ön")], year)).toThrow(StorageTiresValidationError);
    expect(() => parseStorageTires("x", year)).toThrow(StorageTiresValidationError);
  });

  it("metin yerine nesne gelirse boş sayılır", () => {
    const t = parseStorageTires([tire("Ön", { ebat: { $gt: 1 }, marka: ["x"] }), tire("Arka")], year)!;
    expect(t[0].ebat).toBeNull();
    expect(t[0].marka).toBeNull();
  });

  it("geçersiz hafta düşer, metinler kırpılır", () => {
    const t = parseStorageTires([tire("Ön", { production_week: 60, marka: "  Pirelli " }), tire("Arka")], year)!;
    expect(t[0].production_week).toBeNull();
    expect(t[0].marka).toBe("Pirelli");
  });
});

describe("summarizeStorageTires", () => {
  it("tekrarsız özet, konumlu diş, en eski DOT, toplam adet", () => {
    const t = parseStorageTires([
      tire("Ön", { dis_derinligi: "6-6", production_week: 30, production_year: 25 }),
      tire("Arka", { ebat: "255/40R18", dis_derinligi: "5-5", production_week: 10, production_year: 25 }),
    ], year)!;
    expect(summarizeStorageTires(t)).toMatchObject({
      ebat: "225/45R18 · 255/40R18",
      marka: "Michelin",
      dis_derinligi: "Ön 6-6 · Arka 5-5",
      adet: 4,
      production_week: 10,
      production_year: 2025,
    });
  });

  it("kolon uzunluklarını aşmaz", () => {
    const t = parseStorageTires(["Ön Sol", "Ön Sağ", "Arka Sol", "Arka Sağ"].map((k, i) => tire(k, { dis_derinligi: `${i}.5mm`, load_speed_index: `9${i}W XL` })), year)!;
    const s = summarizeStorageTires(t);
    expect(s.dis_derinligi!.length).toBeLessThanOrEqual(50);
    expect(s.load_speed_index!.length).toBeLessThanOrEqual(20);
  });
});

describe("resolveStorageTireColumns", () => {
  it("hepsi aynı: gövdedeki alanlar, işaretler", () => {
    const c = resolveStorageTireColumns({ ebat: "205/55R16", adet: 2, production_year: 26, rft: true }, year);
    expect(c).toMatchObject({ ebat: "205/55R16", adet: 2, production_year: 2026, lastikler: null, rft: true, jantli: false });
  });

  it("farklı lastikler: özet + JSON metni", () => {
    const c = resolveStorageTireColumns({ ebat: "eski", lastikler: [tire("Ön"), tire("Arka", { ebat: "255/40R18" })], jantli: true }, year);
    expect(c.ebat).toBe("225/45R18 · 255/40R18");
    expect(JSON.parse(c.lastikler!)).toHaveLength(2);
    expect(c.jantli).toBe(true);
  });

  it("işaretler yalnızca true ise açılır", () => {
    expect(resolveStorageTireColumns({ rft: "true" }, year).rft).toBe(false);
  });

  it("farklı lastiklerde RFT konum başına, kayıttaki rft = en az biri", () => {
    const four = ["Ön Sol", "Ön Sağ", "Arka Sol", "Arka Sağ"];
    const some = resolveStorageTireColumns({ rft: false, lastikler: four.map((k, i) => tire(k, { rft: i !== 3 })) }, year);
    expect(some.rft).toBe(true);
    expect(JSON.parse(some.lastikler!).map((t: { rft: boolean }) => t.rft)).toEqual([true, true, true, false]);
    // gövdedeki ortak rft farklı lastiklerde dikkate alınmaz
    expect(resolveStorageTireColumns({ rft: true, lastikler: [tire("Ön"), tire("Arka")] }, year).rft).toBe(false);
  });
});

describe("rftLabel", () => {
  const t = (rft: boolean) => ({ ...parseStorageTires([tire("Ön"), tire("Arka")], year)![0], rft });
  it("hepsi aynı / hepsi / kısmi / hiçbiri", () => {
    expect(rftLabel({ rft: true, lastikler: null })).toBe("RFT");
    expect(rftLabel({ rft: false, lastikler: null })).toBeNull();
    expect(rftLabel({ rft: true, lastikler: [t(true), t(true)] })).toBe("RFT");
    expect(rftLabel({ rft: true, lastikler: [t(true), t(false)] })).toBe("RFT (kısmi)");
    expect(rftLabel({ rft: false, lastikler: [t(false), t(false)] })).toBeNull();
  });
});
