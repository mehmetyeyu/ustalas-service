interface QueryClient {
  query<T = unknown>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export class InvalidKasaError extends Error {
  constructor() {
    super("Geçersiz kasa.");
    this.name = "InvalidKasaError";
  }
}

// Sipariş/masraf/Cari/manuel kasa hareketi route'larının ortak kasa_id
// doğrulaması — kasa_id verilmemişse (null/undefined) hiçbir sorgu bile
// çalıştırmadan geçer (özellik hiç kullanılmayan firmalarda maliyetsiz).
export async function assertKasaBelongsToTenant(
  client: QueryClient,
  kasaId: unknown,
  tenantId: number
): Promise<void> {
  if (kasaId == null || kasaId === "") return;
  const id = Number(kasaId);
  if (!Number.isFinite(id)) throw new InvalidKasaError();
  const result = await client.query(
    "SELECT 1 FROM kasalar WHERE id = $1 AND tenant_id = $2",
    [id, tenantId]
  );
  if (result.rows.length === 0) throw new InvalidKasaError();
}
