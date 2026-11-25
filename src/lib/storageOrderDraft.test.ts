import { describe, it, expect } from "vitest";
import { buildTireDraft, type OrderDraftLine } from "./storageOrderDraft";

const line = (v: Partial<OrderDraftLine>): OrderDraftLine => ({
  service_name: "Lastik Satışı", tracks_size: true, quantity: 4, size_desc: "205/55R16", product_type: "Lastik", season: "Kış", ...v,
});

describe("buildTireDraft", () => {
  it("satılan lastikten adet, ebat ve ters mevsim", () => {
    expect(buildTireDraft([line({})], null)).toEqual({ adet: 4, ebat: "205/55R16", mevsim: "Yazlık", aciklama: "" });
    expect(buildTireDraft([line({ season: "Yaz" })], null).mevsim).toBe("Kışlık");
  });
  it("Dört Mevsim ya da bilinmeyen mevsimde tahmin yok", () => {
    expect(buildTireDraft([line({ season: "Dört Mevsim" })], null).mevsim).toBe("");
    expect(buildTireDraft([line({ season: null })], null).mevsim).toBe("");
    expect(buildTireDraft([line({ season: "Yaz" }), line({ season: "Kış" })], null).mevsim).toBe("");
  });
  it("jant, aksesuar ve işçilik satırları sayılmaz", () => {
    const d = buildTireDraft([
      line({ quantity: 2 }),
      line({ service_name: "Jant Satışı", product_type: "Jant", season: null, size_desc: "16 inç" }),
      line({ service_name: "Jant Satışı", product_type: null, season: null, size_desc: "16 inç" }),
      line({ service_name: "Balans", tracks_size: false, product_type: null, season: null, size_desc: null }),
    ], null);
    expect(d).toMatchObject({ adet: 2, ebat: "205/55R16", mevsim: "Yazlık" });
  });
  it("farklı ebatlarda ebat boş, adet toplanır", () => {
    expect(buildTireDraft([line({ quantity: 2 }), line({ quantity: 2, size_desc: "225/45R17" })], null)).toMatchObject({ adet: 4, ebat: "" });
  });
  it("lastik satırı yoksa 4 adet", () => {
    expect(buildTireDraft([], null)).toMatchObject({ adet: 4, ebat: "", mevsim: "" });
  });
  it("adet depodaki üst sınırı aşmaz", () => {
    expect(buildTireDraft([line({ quantity: 50 })], null).adet).toBe(20);
  });
  it("aracı getiren açıklamaya yazılır", () => {
    expect(buildTireDraft([line({})], " Ali Veli ").aciklama).toBe("Aracı getiren: Ali Veli");
  });
});
