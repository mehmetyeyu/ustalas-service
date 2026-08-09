interface QueryClient {
  query<T = unknown>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

// Sipariş satırlarındaki "Yapılan İşlem" adlarını mevcut services kayıtlarıyla
// eşleştirir; eşleşmeyen adlar için (ör. Excel'den "Lastik Satışı") fiyatsız
// otomatik yeni bir services kaydı açılır. Hem elle sipariş oluşturmada hem de
// Excel içe aktarımında kullanılır.
export async function resolveServiceIds(
  client: QueryClient,
  lines: { service_name: string }[]
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
    // Satırdaki tutar (unit_price) adet dahil bir toplamdır, tek birimlik bir
    // katalog fiyatı değil — bu yüzden burada asla fiyat tahmini yapılmaz;
    // kullanıcı isterse Hizmetler sayfasından sonradan fiyat girer.
    const inserted = await client.query<{ id: number }>(
      "INSERT INTO services (name, price) VALUES ($1, NULL) RETURNING id",
      [name]
    );
    serviceIdByName.set(name, inserted.rows[0].id);
  }

  return serviceIdByName;
}
