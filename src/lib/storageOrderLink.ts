import { parseStorageId } from "@/lib/storageInput";

interface QueryClient {
  query<T = unknown>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export class StorageOrderLinkError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

// Depo kaydının bağlanacağı sipariş (body.order_id, isteğe bağlı) — firmanın
// kendi siparişi olmalı ve daha önce depo kaydı açılmamış olmalı.
export async function resolveStorageOrderId(client: QueryClient, tenantId: number, raw: unknown): Promise<number | null> {
  if (raw == null || raw === "") return null;
  const id = parseStorageId(String(raw));
  if (id === null) throw new StorageOrderLinkError("Geçersiz sipariş.", 400);
  const { rows } = await client.query<{ taken: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM storage s WHERE s.order_id = o.id AND s.tenant_id = o.tenant_id) AS taken
     FROM orders o WHERE o.id = $1 AND o.tenant_id = $2`,
    [id, tenantId]
  );
  if (rows.length === 0) throw new StorageOrderLinkError("Sipariş bulunamadı.", 404);
  if (rows[0].taken) throw new StorageOrderLinkError(ORDER_ALREADY_STORED, 409);
  return id;
}

export const ORDER_ALREADY_STORED = "Bu siparişin lastikleri zaten depoya alınmış.";

// Aynı anda iki istek (storage_order_unique).
export function isOrderAlreadyStoredError(error: unknown): boolean {
  return !!error && typeof error === "object" && "constraint" in error && error.constraint === "storage_order_unique";
}
