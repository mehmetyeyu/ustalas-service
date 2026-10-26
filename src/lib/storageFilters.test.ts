import { describe, it, expect } from "vitest";
import { parseStorageFilters, buildStorageQuery } from "./storageFilters";

const parse = (qs: string) => parseStorageFilters(new URLSearchParams(qs));

describe("parseStorageFilters", () => {
  it("parametresiz: aktif kayıtlar, filtre yok", () => {
    expect(parse("")).toEqual({
      search: "", delivered: false, overdue: false, mevsim: [], marka: "", ebat: "", model: "", dateFrom: "", dateTo: "",
    });
  });

  it("teslim edilenlerde bekleyenler filtresi uygulanmaz", () => {
    expect(parse("delivered=true&overdue=true").overdue).toBe(false);
    expect(parse("overdue=true").overdue).toBe(true);
  });

  it("geçersiz tarihleri yok sayar, çoklu mevsimi toplar", () => {
    const f = parse("dateFrom=2026-01-01&dateTo=dün&mevsim=Kışlık&mevsim=Yazlık&mevsim=");
    expect(f.dateFrom).toBe("2026-01-01");
    expect(f.dateTo).toBe("");
    expect(f.mevsim).toEqual(["Kışlık", "Yazlık"]);
  });
});

describe("buildStorageQuery", () => {
  it("parametresiz: eski sorguyla aynı (aktif, en yeni üstte)", () => {
    const q = buildStorageQuery(parse(""), 7, 0);
    expect(q.where).toBe(" WHERE tenant_id = $1 AND teslim_edildi = false");
    expect(q.values).toEqual([7]);
    expect(q.orderBy).toBe(" ORDER BY created_at DESC");
  });

  it("bekleyenler: eşik parametreli, en uzun bekleyen üstte", () => {
    const q = buildStorageQuery(parse("overdue=true"), 7, 6);
    expect(q.where).toContain("islem_tarihi < NOW() - ($2 * INTERVAL '1 month')");
    expect(q.values).toEqual([7, 6]);
    expect(q.orderBy).toBe(" ORDER BY islem_tarihi ASC NULLS LAST, created_at ASC");
  });

  it("tüm filtreler sırayla parametre alır, LIKE jokerleri kaçışlanır", () => {
    const q = buildStorageQuery(parse("search=34ab&mevsim=Kışlık&marka=50%25&ebat=205/55&model=P7&dateFrom=2026-01-01&dateTo=2026-06-30"), 7, 0);
    expect(q.values).toEqual([7, "%34ab%", ["Kışlık"], "%50\\%%", "%205/55%", "%P7%", "2026-01-01", "2026-06-30"]);
    expect(q.where).toContain("btrim(m) = ANY($3::text[])");
    expect(q.where).toContain("islem_tarihi >= $7::date AND islem_tarihi <= $8::date");
  });
});
