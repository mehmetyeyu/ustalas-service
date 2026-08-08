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
  names: (string | null | undefined)[]
): Promise<void> {
  const unique = Array.from(
    new Set(names.map((n) => (n ?? "").trim()).filter((n) => n.length > 0))
  );
  if (unique.length === 0) return;

  const placeholders = unique.map((_, i) => `($${i + 1})`).join(",");
  await client.query(
    `INSERT INTO ${table} (name) VALUES ${placeholders} ON CONFLICT (name) DO NOTHING`,
    unique
  );
}
