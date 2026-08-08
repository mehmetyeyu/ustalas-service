interface QueryClient {
  query<T = unknown>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

// Sipariş satırlarındaki "Yapılan İşlem" adlarını mevcut services kayıtlarıyla
// eşleştirir; eşleşmeyen adlar için (ör. Excel'den "Lastik Satışı") o satırdaki
// tutar varsayılan fiyat olacak şekilde otomatik yeni bir services kaydı açılır.
// Hem elle sipariş oluşturmada hem de Excel içe aktarımında kullanılır.
export async function resolveServiceIds(
  client: QueryClient,
  lines: { service_name: string; unit_price: number }[]
): Promise<Map<string, number>> {
  const names = Array.from(new Set(lines.map((l) => l.service_name.trim()).filter(Boolean)));
  const serviceIdByName = new Map<string, number>();
  if (names.length === 0) return serviceIdByName;

  const existing = await client.query<{ id: number; name: string }>(
    "SELECT id, name FROM services WHERE name = ANY($1)",
    [names]
  );
  for (const row of existing.rows) serviceIdByName.set(row.name, row.id);

  const missing = names.filter((n) => !serviceIdByName.has(n));
  for (const name of missing) {
    const firstLine = lines.find((l) => l.service_name.trim() === name);
    const inserted = await client.query<{ id: number }>(
      "INSERT INTO services (name, price) VALUES ($1, $2) RETURNING id",
      [name, firstLine?.unit_price ?? 0]
    );
    serviceIdByName.set(name, inserted.rows[0].id);
  }

  return serviceIdByName;
}
