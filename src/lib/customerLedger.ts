interface QueryClient {
  query<T = unknown>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

// PATCH/PUT /api/orders/:id sırasında bir siparişin ödeme kırılımında "Cari"
// tutar kalıyorsa ama customer_name boşsa (borcun kime ait olduğu bilinemez)
// fırlatılır — çağıran uç bunu yakalayıp 400 döner.
export class LedgerCustomerRequiredError extends Error {
  constructor() {
    super("Cari seçmek için müşteri adı girilmelidir.");
    this.name = "LedgerCustomerRequiredError";
  }
}

// Bir siparişin Cari'ye düşen kısmını customer_ledger_entries ile senkron
// tutar — "sil, yeniden hesapla, gerekiyorsa tek satır ekle" (idempotent).
// Kalan bakiye SADECE ödeme tipi "Cari" seçilirse yansır; Nakit/POS/Havale
// gibi diğer tipler bu fonksiyona hiç girmez. order_payments/order_services
// fallback mantığı src/app/api/reports/route.ts'teki paymentBreakdownResult
// sorgusuyla BİREBİR aynıdır (order_payments varsa oradan, yoksa satır bazlı
// payment_type'a düşülür, iki kaynak asla toplanmaz).
export async function syncOrderLedger(
  client: QueryClient,
  tenantId: number,
  orderId: number,
  customerName: string | null | undefined,
  userId?: number | null
): Promise<void> {
  await syncOrderLedgerBatch(client, tenantId, new Map([[orderId, customerName]]), userId);
}

// syncOrderLedger'ın çoklu-sipariş (toplu ödeme şekli değiştirme, bkz.
// src/app/api/orders/bulk-payment-type/route.ts) sürümü — aynı mantığı sipariş
// başına tek tek 4 sorgu yerine, kaç sipariş etkilenirse etkilensin sabit 4
// sorguda uygular. syncOrderLedger de dahil TEK doğruluk kaynağı burasıdır.
export async function syncOrderLedgerBatch(
  client: QueryClient,
  tenantId: number,
  customerNameByOrderId: Map<number, string | null | undefined>,
  userId?: number | null
): Promise<void> {
  const orderIds = Array.from(customerNameByOrderId.keys());
  if (orderIds.length === 0) return;

  await client.query(
    "DELETE FROM customer_ledger_entries WHERE order_id = ANY($1) AND tenant_id = $2 AND entry_type = 'SIPARIS'",
    [orderIds, tenantId]
  );

  const cariResult = await client.query<{ order_id: number; total: string }>(
    `SELECT order_id, SUM(total) AS total FROM (
       SELECT order_id, amount AS total FROM order_payments
       WHERE order_id = ANY($1) AND tenant_id = $2 AND payment_type = 'Cari'
       UNION ALL
       SELECT os.order_id, os.unit_price AS total FROM order_services os
       WHERE os.order_id = ANY($1) AND os.tenant_id = $2 AND os.payment_type = 'Cari'
         AND NOT EXISTS (SELECT 1 FROM order_payments op WHERE op.order_id = os.order_id AND op.tenant_id = $2)
     ) combined
     GROUP BY order_id`,
    [orderIds, tenantId]
  );

  const dueOrders = cariResult.rows
    .map((r) => ({ orderId: r.order_id, total: Number(r.total) }))
    .filter((r) => r.total > 0.009);
  if (dueOrders.length === 0) return;

  const nameByOrderId = new Map<number, string>();
  for (const { orderId } of dueOrders) {
    const name = customerNameByOrderId.get(orderId)?.trim();
    if (!name) throw new LedgerCustomerRequiredError();
    nameByOrderId.set(orderId, name);
  }

  // auto_register_customers ayarından BAĞIMSIZ upsert — o ayar sadece
  // "kolaylık dizini"ni kontrol eder, ama Cari borcun bir customer_id'ye
  // ihtiyacı var, ayar kapalı olsa bile burada yine de oluşturulmalı.
  const distinctNames = Array.from(new Set(nameByOrderId.values()));
  const customerRows = await client.query<{ id: number; name: string }>(
    `INSERT INTO customers (tenant_id, name)
     SELECT $1, unnest($2::text[])
     ON CONFLICT (tenant_id, name) DO UPDATE SET name = customers.name
     RETURNING id, name`,
    [tenantId, distinctNames]
  );
  const customerIdByName = new Map(customerRows.rows.map((r) => [r.name, r.id]));

  const values = dueOrders
    .map((_, i) => `($${i * 5 + 1}::int, $${i * 5 + 2}::int, $${i * 5 + 3}::int, $${i * 5 + 4}::decimal, $${i * 5 + 5}::int)`)
    .join(", ");
  const params = dueOrders.flatMap(({ orderId, total }) => [
    tenantId, customerIdByName.get(nameByOrderId.get(orderId)!), orderId, total, userId ?? null,
  ]);
  await client.query(
    `INSERT INTO customer_ledger_entries (tenant_id, customer_id, order_id, entry_type, direction, amount, entry_date, created_by)
     SELECT tenant_id, customer_id, order_id, 'SIPARIS', 1, amount, CURRENT_DATE, created_by
     FROM (VALUES ${values}) AS v(tenant_id, customer_id, order_id, amount, created_by)`,
    params
  );
}
