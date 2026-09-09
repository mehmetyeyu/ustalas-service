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
  await client.query(
    "DELETE FROM customer_ledger_entries WHERE order_id = $1 AND tenant_id = $2 AND entry_type = 'SIPARIS'",
    [orderId, tenantId]
  );

  const cariResult = await client.query<{ total: string }>(
    `SELECT COALESCE(SUM(total), 0) AS total FROM (
       SELECT amount AS total FROM order_payments
       WHERE order_id = $1 AND tenant_id = $2 AND payment_type = 'Cari'
       UNION ALL
       SELECT unit_price AS total FROM order_services
       WHERE order_id = $1 AND tenant_id = $2 AND payment_type = 'Cari'
         AND NOT EXISTS (SELECT 1 FROM order_payments WHERE order_id = $1 AND tenant_id = $2)
     ) combined`,
    [orderId, tenantId]
  );
  const cariTotal = Number(cariResult.rows[0]?.total ?? 0);
  if (cariTotal <= 0.009) return;

  const name = customerName?.trim();
  if (!name) throw new LedgerCustomerRequiredError();

  // auto_register_customers ayarından BAĞIMSIZ upsert — o ayar sadece
  // "kolaylık dizini"ni kontrol eder, ama Cari borcun bir customer_id'ye
  // ihtiyacı var, ayar kapalı olsa bile burada yine de oluşturulmalı.
  const customerResult = await client.query<{ id: number }>(
    `INSERT INTO customers (tenant_id, name) VALUES ($1, $2)
     ON CONFLICT (tenant_id, name) DO UPDATE SET name = customers.name
     RETURNING id`,
    [tenantId, name]
  );
  const customerId = customerResult.rows[0].id;

  await client.query(
    `INSERT INTO customer_ledger_entries (tenant_id, customer_id, order_id, entry_type, direction, amount, entry_date, created_by)
     VALUES ($1, $2, $3, 'SIPARIS', 1, $4, CURRENT_DATE, $5)`,
    [tenantId, customerId, orderId, cariTotal, userId ?? null]
  );
}
