interface QueryClient {
  query<T = unknown>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

// Boşta kalan en küçük depo no, yoksa max+1 (yeni kayıt ve Teslimi Geri Al).
// Eşzamanlı iki istek aynı numarayı bulabilir — storage_active_depo_no_unique
// ikincisini 23505 ile engeller, çağıran 409 döner.
export async function nextFreeDepoNo(client: QueryClient, tenantId: number): Promise<number> {
  const result = await client.query<{ next: number }>(`
    WITH active_nos AS (
      SELECT depo_no FROM storage WHERE tenant_id = $1 AND teslim_edildi = false AND depo_no IS NOT NULL
    ),
    max_no AS (SELECT COALESCE(MAX(depo_no), 0) AS m FROM storage WHERE tenant_id = $1)
    SELECT MIN(n)::int AS next
    FROM generate_series(1, (SELECT m + 1 FROM max_no)) n
    WHERE n NOT IN (SELECT depo_no FROM active_nos)
  `, [tenantId]);
  return result.rows[0].next;
}
