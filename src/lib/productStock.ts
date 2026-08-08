interface QueryClient {
  query<T = unknown>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

// "Lastik Satışı" işlem satırları belirli bir parti (products satırı) ile
// bağlantılıysa, o partinin stock_qty'si sipariş satırıyla senkron tutulur —
// satır eklenince düşülür, silinince/miktarı azalınca geri eklenir. Yetersiz
// stokta InsufficientStockError fırlatılır; çağıran uç bunu yakalayıp 400 döner.
export class InsufficientStockError extends Error {
  constructor(public available: number) {
    super(`Yetersiz stok: sadece ${available} adet mevcut.`);
    this.name = "InsufficientStockError";
  }
}

// Satırın product_id'si varsa stock_qty'den quantity kadar düşer. Satır (ve
// kilit) transaction içinde FOR UPDATE ile korunur — eşzamanlı iki siparişin
// aynı partiyi eksiye düşürmesi engellenir.
export async function deductStock(client: QueryClient, productId: number, quantity: number): Promise<void> {
  if (quantity <= 0) return;
  const result = await client.query<{ stock_qty: number }>(
    "SELECT stock_qty FROM products WHERE id = $1 FOR UPDATE",
    [productId]
  );
  const current = result.rows[0]?.stock_qty ?? 0;
  if (current < quantity) throw new InsufficientStockError(current);
  await client.query("UPDATE products SET stock_qty = stock_qty - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2", [quantity, productId]);
}

// Silinen/azaltılan bir satırın daha önce düştüğü miktarı geri ekler.
export async function restoreStock(client: QueryClient, productId: number, quantity: number): Promise<void> {
  if (quantity <= 0) return;
  await client.query("UPDATE products SET stock_qty = stock_qty + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2", [quantity, productId]);
}
