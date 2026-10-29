import { describe, it, expect } from "vitest";
import { oppositeMevsim, parseSeasonChangeInput, SeasonChangeValidationError } from "./seasonChange";

const T = "2026-10-29";

describe("oppositeMevsim", () => {
  it("kış ↔ yaz, diğerleri boş", () => {
    expect(oppositeMevsim("Kışlık")).toBe("Yazlık");
    expect(oppositeMevsim("Yazlık")).toBe("Kışlık");
    expect(oppositeMevsim("Dört Mevsim")).toBe("");
    expect(oppositeMevsim(null)).toBe("");
  });
});

describe("parseSeasonChangeInput", () => {
  it("varsayılanlar", () => {
    const r = parseSeasonChangeInput({ items: [{ storage_id: 5, ebat: " 205/55R16 " }] }, T);
    expect(r.islem_tarihi).toBe(T);
    expect(r.items[0]).toMatchObject({ storage_id: 5, ebat: "205/55R16", adet: 4, marka: null });
    expect(r.order).toBeNull();
  });
  it("sipariş seçeneği", () => {
    const r = parseSeasonChangeInput({ items: [{ storage_id: 1 }], order: { service_name: "Mevsim Değişimi", unit_price: "750.5" } }, T);
    expect(r.order).toEqual({ service_name: "Mevsim Değişimi", unit_price: 750.5 });
  });
  it.each<[unknown, string]>([
    [{ items: [] }, "boş liste"],
    [{ items: [{ storage_id: "x" }] }, "geçersiz id"],
    [{ items: [{ storage_id: 1 }, { storage_id: 1 }] }, "tekrar eden kayıt"],
    [{ items: [{ storage_id: 1, adet: 0 }] }, "adet 0"],
    [{ items: [{ storage_id: 1 }], islem_tarihi: "29.10.2026" }, "tarih biçimi"],
    [{ items: [{ storage_id: 1 }], islem_tarihi: "2026-10-30" }, "ileri tarih"],
    [{ items: [{ storage_id: 1 }], order: { service_name: "", unit_price: 10 } }, "hizmetsiz sipariş"],
    [{ items: [{ storage_id: 1 }], order: { service_name: "X", unit_price: -1 } }, "eksi tutar"],
    [{ items: Array.from({ length: 101 }, (_, i) => ({ storage_id: i + 1 })) }, "100 sınırı"],
    [null, "boş gövde"],
  ])("reddedilir: %j (%s)", (body) => {
    expect(() => parseSeasonChangeInput(body, T)).toThrow(SeasonChangeValidationError);
  });
});
