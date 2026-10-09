import { describe, it, expect, vi } from "vitest";
import { createKasaResolver, InvalidKasaError } from "./kasalar";

// Gerçek pg Pool/Client yerine çağrı sayısını izleyen sahte bir client —
// createKasaResolver'ın aynı (payment_type, kasa_id) çifti için SQL'i
// tekrar çalıştırmadığını (cache hit) ama farklı çiftler için bağımsız
// çalıştırdığını (cache miss) doğrulamak için.
function fakeClient(kasaRows: { id: number; tenant_id: number; linked_payment_type: string | null }[]) {
  const calls: { text: string; params: unknown[] }[] = [];
  const query = vi.fn(async (text: string, params: unknown[] = []) => {
    calls.push({ text, params });
    if (text.includes("linked_payment_type")) {
      const [tenantId, paymentType] = params as [number, string];
      const row = kasaRows.find((k) => k.tenant_id === tenantId && k.linked_payment_type === paymentType);
      return { rows: row ? [{ id: row.id }] : [] };
    }
    // assertKasaBelongsToTenant sorgusu: "id = $1 AND tenant_id = $2"
    const [id, tenantId] = params as [number, number];
    const row = kasaRows.find((k) => k.id === id && k.tenant_id === tenantId);
    return { rows: row ? [{}] : [] };
  });
  return { query, calls };
}

// vi.fn() gerçek pg Client'ın generic query<T>() imzasını birebir
// taşımadığından (Mock'un çıkarılan tipi daha dar), createKasaResolver'a
// verirken burada tek bir yerden cast edilir — test assertion'ları
// (client.query üzerindeki toHaveBeenCalledTimes vb.) fakeClient'ın kendi
// nesnesi üzerinden hâlâ tam Mock tipiyle çalışmaya devam eder.
function asQueryClient(client: ReturnType<typeof fakeClient>): Parameters<typeof createKasaResolver>[0] {
  return client as unknown as Parameters<typeof createKasaResolver>[0];
}

describe("createKasaResolver", () => {
  it("aynı (payment_type, kasa_id) çiftini tekrar sorgulamaz (cache hit)", async () => {
    const client = fakeClient([{ id: 5, tenant_id: 1, linked_payment_type: "Garanti Hesap" }]);
    const resolve = createKasaResolver(asQueryClient(client), 1);

    const a = await resolve("Garanti Hesap", null);
    const b = await resolve("Garanti Hesap", null);
    const c = await resolve("Garanti Hesap", null);

    expect(a).toBe(5);
    expect(b).toBe(5);
    expect(c).toBe(5);
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it("farklı payment_type'lar bağımsız sorgulanır (cache miss)", async () => {
    const client = fakeClient([
      { id: 5, tenant_id: 1, linked_payment_type: "Garanti Hesap" },
      { id: 7, tenant_id: 1, linked_payment_type: "Nazım Hesap" },
    ]);
    const resolve = createKasaResolver(asQueryClient(client), 1);

    expect(await resolve("Garanti Hesap", null)).toBe(5);
    expect(await resolve("Nazım Hesap", null)).toBe(7);
    expect(client.query).toHaveBeenCalledTimes(2);
  });

  it("Nakit'te aynı kasa_id tekrar doğrulanmaz, farklı kasa_id ayrı doğrulanır", async () => {
    const client = fakeClient([
      { id: 1, tenant_id: 1, linked_payment_type: null },
      { id: 2, tenant_id: 1, linked_payment_type: null },
    ]);
    const resolve = createKasaResolver(asQueryClient(client), 1);

    expect(await resolve("Nakit", 1)).toBe(1);
    expect(await resolve("Nakit", 1)).toBe(1); // cache hit, tekrar sorgulanmaz
    expect(await resolve("Nakit", 2)).toBe(2); // farklı kasa_id, yeni sorgu
    expect(client.query).toHaveBeenCalledTimes(2);
  });

  it("geçersiz bir kasa_id'yi cache'lese bile her çağrıda aynı hatayı fırlatır", async () => {
    const client = fakeClient([{ id: 1, tenant_id: 1, linked_payment_type: null }]);
    const resolve = createKasaResolver(asQueryClient(client), 1);

    await expect(resolve("Nakit", 999)).rejects.toThrow(InvalidKasaError);
    await expect(resolve("Nakit", 999)).rejects.toThrow(InvalidKasaError);
    // Hata fırlatan çağrı da cache'lenir — ikinci çağrı SQL'i tekrar çalıştırmaz.
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it("boş/null payment_type hiç sorgu çalıştırmadan null döner (ve cache'lenir)", async () => {
    const client = fakeClient([]);
    const resolve = createKasaResolver(asQueryClient(client), 1);

    expect(await resolve(null, null)).toBeNull();
    expect(await resolve(undefined, null)).toBeNull();
    expect(client.query).not.toHaveBeenCalled();
  });

  it("farklı tenant'lar için ayrı resolver'lar birbirinden bağımsızdır", async () => {
    const client = fakeClient([
      { id: 5, tenant_id: 1, linked_payment_type: "Garanti Hesap" },
      { id: 9, tenant_id: 2, linked_payment_type: "Garanti Hesap" },
    ]);
    const resolveT1 = createKasaResolver(asQueryClient(client), 1);
    const resolveT2 = createKasaResolver(asQueryClient(client), 2);

    expect(await resolveT1("Garanti Hesap", null)).toBe(5);
    expect(await resolveT2("Garanti Hesap", null)).toBe(9);
    expect(client.query).toHaveBeenCalledTimes(2);
  });
});
