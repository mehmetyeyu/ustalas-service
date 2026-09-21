import { describe, it, expect } from "vitest";
import { buildOrderQuery } from "./orderQuery";

describe("buildOrderQuery", () => {
  it("filtre yokken sadece tenant_id koşuluyla WHERE üretir", () => {
    const q = buildOrderQuery(1, new URLSearchParams());
    expect(q.where).toBe(" WHERE o.tenant_id = $1");
    expect(q.values).toEqual([1]);
    expect(q.orderBy).toBe("o.created_at DESC, os.id ASC");
  });

  it("tenant_id, başka filtreler olsa bile HER ZAMAN $1 ve WHERE'in ilk koşuludur (çok kiracılı izolasyonun temeli)", () => {
    const q = buildOrderQuery(42, new URLSearchParams({ status: "TAMAMLANDI", plate: "34 ABC" }));
    expect(q.values[0]).toBe(42);
    expect(q.where.startsWith(" WHERE o.tenant_id = $1")).toBe(true);
  });

  it("status filtresi doğru parametre index'iyle eklenir", () => {
    const q = buildOrderQuery(1, new URLSearchParams({ status: "BEKLEMEDE" }));
    expect(q.where).toBe(" WHERE o.tenant_id = $1 AND o.status = $2");
    expect(q.values).toEqual([1, "BEKLEMEDE"]);
  });

  it("dateFrom, İstanbul yerel gece yarısını doğru UTC anına çevirir (UTC+3 sabit)", () => {
    const q = buildOrderQuery(1, new URLSearchParams({ dateFrom: "2026-08-01" }));
    // 1 Ağustos 00:00 İstanbul = 31 Temmuz 21:00 UTC.
    expect((q.values[1] as Date).toISOString()).toBe("2026-07-31T21:00:00.000Z");
    expect(q.where).toContain("o.created_at >= $2");
  });

  it("dateTo, bir SONRAKİ günün İstanbul yerel gece yarısını kullanır (< karşılaştırması için)", () => {
    const q = buildOrderQuery(1, new URLSearchParams({ dateTo: "2026-08-01" }));
    // 2 Ağustos 00:00 İstanbul = 1 Ağustos 21:00 UTC.
    expect((q.values[1] as Date).toISOString()).toBe("2026-08-01T21:00:00.000Z");
    expect(q.where).toContain("o.created_at < $2");
  });

  it("customer_name, escapeLike ile kaçışlanıp %...% ile sarmalanır", () => {
    const q = buildOrderQuery(1, new URLSearchParams({ customer_name: "50%" }));
    expect(q.values[1]).toBe("%50\\%%");
    expect(q.where).toContain("o.customer_name ILIKE $2");
  });

  it("geçersiz/kötücül bir sortBy değeri ham SQL'e sızmaz, varsayılan sıralamaya düşer", () => {
    const q = buildOrderQuery(1, new URLSearchParams({ sortBy: "id; DROP TABLE orders; --" }));
    expect(q.orderBy).toBe("o.created_at DESC, os.id ASC");
  });

  it("geçerli bir sortBy + sortDir=desc, whitelist'teki gerçek kolon adını kullanır", () => {
    const q = buildOrderQuery(1, new URLSearchParams({ sortBy: "unit_price", sortDir: "desc" }));
    expect(q.orderBy).toBe("os.unit_price DESC NULLS LAST, o.id ASC");
  });

  it("sortDir belirtilmezse (ya da 'desc' değilse) ASC'ye düşer", () => {
    const q = buildOrderQuery(1, new URLSearchParams({ sortBy: "plate" }));
    expect(q.orderBy).toBe("o.plate ASC NULLS LAST, o.id ASC");
  });

  it("çoklu değerli (getAll) bir filtre (service_name) ANY($n) ile diziyi tek parametre olarak taşır", () => {
    const params = new URLSearchParams();
    params.append("service_name", "Lastik Değişimi");
    params.append("service_name", "Balans");
    const q = buildOrderQuery(1, params);
    expect(q.values[1]).toEqual(["Lastik Değişimi", "Balans"]);
    expect(q.where).toContain("s.name = ANY($2)");
  });

  it("search terimi, slash'siz varyantla birlikte İKİ parametre üretir ve ikisini de kullanır", () => {
    const q = buildOrderQuery(1, new URLSearchParams({ search: "205/55" }));
    expect(q.values).toEqual([1, "%205/55%", "%20555%"]);
    expect(q.where).toContain("$2");
    expect(q.where).toContain("$3");
  });

  it("birden fazla filtre birlikte kullanıldığında parametre index'leri sırayla ve çakışmadan artar", () => {
    const q = buildOrderQuery(7, new URLSearchParams({ status: "BEKLEMEDE", plate: "34 ABC" }));
    expect(q.where).toBe(" WHERE o.tenant_id = $1 AND o.status = $2 AND o.plate ILIKE $3");
    expect(q.values).toEqual([7, "BEKLEMEDE", "%34 ABC%"]);
  });
});
