import { isValidTrPlate, normalizePlate } from "./plate";

interface QueryClient {
  query<T = unknown>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

// Bir sipariş/depolama/randevu kaydına yazılan plakanın aracını bulur ya da
// açar, id'sini döner — kayıt bu id ile vehicle_id'ye bağlanır. Plaka Türk
// plaka biçimine uymuyorsa (uydurma/boş) null: kayıt araca bağlanmaz, plaka
// yalnızca metin olarak kalır (bkz. database/schema.sql vehicles notu).
// Kaydı yazan aynı transaction içinde çağrılmalı (varsa).
export async function linkVehicle(client: QueryClient, tenantId: number, rawPlate: string | null | undefined): Promise<number | null> {
  const plate = normalizePlate(rawPlate);
  if (!isValidTrPlate(plate)) return null;
  const result = await client.query<{ id: number }>(
    `INSERT INTO vehicles (tenant_id, plate) VALUES ($1, $2)
     ON CONFLICT (tenant_id, plate) DO UPDATE SET last_seen_at = NOW()
     RETURNING id`,
    [tenantId, plate]
  );
  return result.rows[0].id;
}

// normalizePlate'in SQL karşılığı — eski siparişlerin plaka METNİNİ (araç
// bağlantısı olmayan) bir müşterinin kendi siparişleri içinde araçla
// eşleştirmek için (Müşteri Detayı istatistikleri). Yalnızca okuma; eski
// kayıtlara vehicle_id yazılmaz.
export function plateNormalizeSql(column: string): string {
  return `regexp_replace(translate(upper(${column}), 'İ', 'I'), '[^0-9A-ZÇĞÖŞÜ]', '', 'g')`;
}
