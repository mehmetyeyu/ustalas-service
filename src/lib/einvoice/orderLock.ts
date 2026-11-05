// Resmi faturası olan siparişin kilidi (docs/e-fatura-tasarim.md §7).
// Sipariş bir geçerli faturaya bağlıyken (invoice_orders.active) tutarı ya da
// satırları değiştirilemez, sipariş silinemez — fatura GİB'e gitmiş olabilir.
// Plaka, not, müşteri telefonu gibi tutarı etkilemeyen alanlar serbesttir
// (fatura alıcı/satır bilgilerini anlık görüntü olarak taşır). Fatura
// iptal/red edilince bağlantı active=false olur ve kilit kalkar.

interface QueryClient {
  query<T = unknown>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface ActiveInvoiceRef {
  id: number;
  status: string;
  gib_invoice_no: string | null;
}

export async function getActiveInvoiceForOrder(client: QueryClient, tenantId: number, orderId: number | string): Promise<ActiveInvoiceRef | null> {
  const result = await client.query<ActiveInvoiceRef>(
    `SELECT i.id, i.status, i.gib_invoice_no
     FROM invoice_orders io JOIN invoices i ON i.id = io.invoice_id AND i.tenant_id = io.tenant_id
     WHERE io.tenant_id = $1 AND io.order_id = $2 AND io.active
     LIMIT 1`,
    [tenantId, orderId]
  );
  return result.rows[0] ?? null;
}

export function orderLockedMessage(inv: ActiveInvoiceRef): string {
  return inv.status === "RESMILESTI"
    ? `Bu siparişin resmi faturası var${inv.gib_invoice_no ? ` (${inv.gib_invoice_no})` : ""}. Tutarı değiştirmek ya da silmek için önce faturayı iptal edin.`
    : "Bu sipariş için fatura kesiliyor ya da yarım kalmış bir fatura var. Önce faturayı tamamlayın ya da vazgeçin.";
}

export interface LockedLine {
  id: number | null;
  serviceId: number;
  quantity: number;
  unitPrice: number;
}

// Faturalı siparişte satırlar fatura açısından değişti mi: satır eklenmesi/
// silinmesi, hizmet, adet ya da tutar değişikliği. Tedarikçi/stok kodu gibi
// açıklama alanları faturayı değiştirmez (fatura satırları anlık görüntü).
export function invoicedLinesChanged(existing: LockedLine[], incoming: LockedLine[]): boolean {
  if (existing.length !== incoming.length) return true;
  const key = (l: LockedLine) => `${l.serviceId}|${l.quantity}|${Math.round(l.unitPrice * 100)}`;
  const byId = new Map(existing.map((l) => [l.id, l]));
  for (const l of incoming) {
    const old = l.id != null ? byId.get(l.id) : undefined;
    if (!old || key(old) !== key(l)) return true;
  }
  return false;
}
