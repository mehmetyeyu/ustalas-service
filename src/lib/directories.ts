interface QueryClient {
  query<T = unknown>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

// customers/suppliers "dizin" tabloları — orders.customer_name ve
// order_services.supplier serbest metin kalır (FK değil); bu tablolar sadece
// öneri listesi + yönetim ekranı içindir. Sipariş oluşturma/içe aktarma sırasında
// yeni bir isim görülürse burada otomatik olarak açılır.
export async function upsertDirectoryNames(
  client: QueryClient,
  table: "customers" | "suppliers",
  tenantId: number,
  names: (string | null | undefined)[]
): Promise<void> {
  const unique = Array.from(
    new Set(names.map((n) => (n ?? "").trim()).filter((n) => n.length > 0))
  );
  if (unique.length === 0) return;

  const placeholders = unique.map((_, i) => `($1, $${i + 2})`).join(",");
  await client.query(
    `INSERT INTO ${table} (tenant_id, name) VALUES ${placeholders} ON CONFLICT (tenant_id, name) DO NOTHING`,
    [tenantId, ...unique]
  );
}
