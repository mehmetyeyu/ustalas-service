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
export async function deductStock(client: QueryClient, tenantId: number, productId: number, quantity: number): Promise<void> {
  if (quantity <= 0) return;
  // tenant_id kontrolü burada da var — productId başka bir firmaya aitse
  // (olmaması gereken bir durum, çağıran route zaten kendi tenant'ının
  // ürünlerinden seçtirir) satır bulunamaz, current 0 kalır ve aşağıdaki
  // kontrol isteği güvenle reddeder.
  const result = await client.query<{ stock_qty: number }>(
    "SELECT stock_qty FROM products WHERE id = $1 AND tenant_id = $2 FOR UPDATE",
    [productId, tenantId]
  );
  const current = result.rows[0]?.stock_qty ?? 0;
  if (current < quantity) throw new InsufficientStockError(current);
  await client.query("UPDATE products SET stock_qty = stock_qty - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND tenant_id = $3", [quantity, productId, tenantId]);
}

// Silinen/azaltılan bir satırın daha önce düştüğü miktarı geri ekler.
export async function restoreStock(client: QueryClient, tenantId: number, productId: number, quantity: number): Promise<void> {
  if (quantity <= 0) return;
  await client.query("UPDATE products SET stock_qty = stock_qty + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND tenant_id = $3", [quantity, productId, tenantId]);
}

// Ürün Kataloğu'ndaki "Alış Maliyeti (Ort.)"/"Satış Fiyatı (Ort.)" (bkz.
// GET /api/products avg_purchase_price) products.purchase_price/sale_price'tan
// DEĞİL, product_stock_entries'teki miktar ağırlıklı ortalamadan hesaplanır —
// bu iki alan birbirinden bağımsız yaşar. "Partiyi Düzenle" ile fiyat
// değiştirilince bu senkronizasyon olmadan "Ort." sütunu hiç değişmez
// (gerçek bir üretim raporuydu, bkz. PATCH /api/products/[id]).
//
// Partinin SADECE TEK bir stok girişi varsa hangi girişin güncelleneceği
// belirsizlik taşımaz, o girişi de senkronlar. Birden fazla giriş varsa
// (farklı zamanlarda farklı fiyatlarla alınmış gerçek ayrı partiler) BİLEREK
// dokunulmaz — aksi halde gerçek maliyet geçmişini sessizce ezip yanlış
// (ve tespit edilemez) bir ortalamaya yol açardık.
export async function syncSingleStockEntryPrice(
  client: QueryClient,
  tenantId: number,
  productId: number,
  purchasePrice: number,
  salePrice: number | null
): Promise<void> {
  const entryCount = await client.query<{ count: string }>(
    "SELECT COUNT(*) AS count FROM product_stock_entries WHERE product_id = $1 AND tenant_id = $2",
    [productId, tenantId]
  );
  if (Number(entryCount.rows[0].count) !== 1) return;
  await client.query(
    "UPDATE product_stock_entries SET purchase_price = $1, sale_price = $2 WHERE product_id = $3 AND tenant_id = $4",
    [purchasePrice, salePrice, productId, tenantId]
  );
}
