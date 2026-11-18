import { describe, it, expect } from "vitest";
import { buildOrderQuery, needsCariStatuses } from "./orderQuery";

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
    expect(q.orderBy).toBe("os.unit_price DESC NULLS LAST, o.id ASC, os.id ASC");
  });

  it("sortDir belirtilmezse (ya da 'desc' değilse) ASC'ye düşer", () => {
    const q = buildOrderQuery(1, new URLSearchParams({ sortBy: "plate" }));
    expect(q.orderBy).toBe("o.plate ASC NULLS LAST, o.id ASC, os.id ASC");
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

  it("brand filtresi ILIKE ile %...% sarmalanır (sipariş satırında elle girilen Marka)", () => {
    const q = buildOrderQuery(1, new URLSearchParams({ brand: "Michelin" }));
    expect(q.where).toContain("os.brand ILIKE $2");
    expect(q.values).toEqual([1, "%Michelin%"]);
  });

  it("model_name filtresi ILIKE ile %...% sarmalanır (sipariş satırında elle girilen Model)", () => {
    const q = buildOrderQuery(1, new URLSearchParams({ model_name: "Primacy" }));
    expect(q.where).toContain("os.model_name ILIKE $2");
    expect(q.values).toEqual([1, "%Primacy%"]);
  });

  it("brand/model_name whitelist'teki geçerli sortBy değerleridir", () => {
    const q1 = buildOrderQuery(1, new URLSearchParams({ sortBy: "brand" }));
    expect(q1.orderBy).toBe("os.brand ASC NULLS LAST, o.id ASC, os.id ASC");
    const q2 = buildOrderQuery(1, new URLSearchParams({ sortBy: "model_name", sortDir: "desc" }));
    expect(q2.orderBy).toBe("os.model_name DESC NULLS LAST, o.id ASC, os.id ASC");
  });

  it("genel arama (search) terimi brand/model_name'i de kapsar, EK parametre eklemez ($2'yi yeniden kullanır)", () => {
    const q = buildOrderQuery(1, new URLSearchParams({ search: "Michelin" }));
    expect(q.values).toEqual([1, "%Michelin%", "%Michelin%"]);
    expect(q.where).toContain("os.brand ILIKE $2");
    expect(q.where).toContain("os.model_name ILIKE $2");
  });
});

describe("buildOrderQuery — cari durumu (kullanıcı kararı 2026-11-18)", () => {
  const statuses = new Map([
    [10, { originalAmount: 1000, remainingAmount: 0, paidVia: "Nazım Hesap" }],
    [11, { originalAmount: 1000, remainingAmount: 0, paidVia: null }],
    [12, { originalAmount: 1000, remainingAmount: 250, paidVia: null }],
    [13, { originalAmount: 1000, remainingAmount: 1000, paidVia: null }],
  ]);

  it("needsCariStatuses yalnızca Ödeme Şekli filtresi ya da sıralamasında true", () => {
    expect(needsCariStatuses(new URLSearchParams())).toBe(false);
    expect(needsCariStatuses(new URLSearchParams({ plate: "34" }))).toBe(false);
    expect(needsCariStatuses(new URLSearchParams({ payment_type: "Cari" }))).toBe(true);
    expect(needsCariStatuses(new URLSearchParams({ sortBy: "payment_type" }))).toBe(true);
  });

  it("cari durumu yoksa join eklenmez, filtre ham tiple çalışır", () => {
    const q = buildOrderQuery(1, new URLSearchParams({ payment_type: "Cari" }));
    expect(q.joins).toBe("");
    expect(q.where).toBe(" WHERE o.tenant_id = $1 AND COALESCE(os.payment_type, o.payment_type) = ANY($2)");
  });

  it("kapanmış cariler $2/$3 ile join'lenir; yöntemsiz kapanan etiketle gider", () => {
    const q = buildOrderQuery(1, new URLSearchParams({ payment_type: "Nazım Hesap", status: "TAMAMLANDI" }), statuses);
    expect(q.joins).toContain("unnest($2::int[], $3::text[]) AS cari_paid(order_id, paid_via)");
    expect(q.values[1]).toEqual([10, 11]);
    expect(q.values[2]).toEqual(["Nazım Hesap", "Cari (Ödendi)"]);
    expect(q.values[3]).toBe("TAMAMLANDI");
    expect(q.where).toContain("o.status = $4");
    expect(q.where).toContain("END = ANY($5)");
    expect(q.values[4]).toEqual(["Nazım Hesap"]);
    expect(q.where).not.toContain("'Karışık'");
  });

  it("Cari filtresi, açık cari kısmı olan parçalı siparişleri de alır (açık + kısmi id'ler)", () => {
    const q = buildOrderQuery(1, new URLSearchParams({ payment_type: "Cari" }), statuses);
    expect(q.where).toContain("OR (COALESCE(os.payment_type, o.payment_type) = 'Karışık' AND o.id = ANY($5::int[]))");
    expect(q.values[4]).toEqual([12, 13]);
    expect(q.values).toHaveLength(5);
  });

  it("Ödeme Şekli sıralaması görünen değerle ve satır düzeyinde eşitlik bozucuyla yapılır", () => {
    const q = buildOrderQuery(1, new URLSearchParams({ sortBy: "payment_type", sortDir: "desc" }), statuses);
    expect(q.orderBy).toMatch(/^CASE WHEN [\s\S]* END DESC NULLS LAST, o\.id ASC, os\.id ASC$/);
    expect(q.pageSort.outer).toBe("x.sort_1 DESC NULLS LAST, x.sort_2 ASC, x.sort_3 ASC");
  });

  it("kapanmış cari yoksa boş dizilerle de geçerli sorgu üretir", () => {
    const q = buildOrderQuery(1, new URLSearchParams({ payment_type: "POS" }), new Map());
    expect(q.values[1]).toEqual([]);
    expect(q.values[2]).toEqual([]);
  });
});
