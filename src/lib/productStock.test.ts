import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { syncSingleStockEntryPrice } from "./productStock";
import pool from "./db";

// Bu dosya, projenin geri kalanının aksine (bkz. vitest.config.mts) BİLEREK
// gerçek veritabanına dokunuyor — mock'lu bir birim test tam olarak bu tür
// bir hatayı (bir tabloyu güncelleyip ilişkili başka bir tabloyu unutmak)
// hiç yakalayamazdı, çünkü mock zaten "doğru" davranacak şekilde yazılırdı.
// Ustalas'ta gerçek bir üretim raporuna yol açan bug buradan geldi (bkz.
// PATCH /api/products/[id] — "Alış Maliyeti Ort." sütunu products.
// purchase_price'tan değil product_stock_entries'ten hesaplanıyor, ikisi
// senkron değildi). DATABASE_URL yoksa (ör. DB'siz bir CI ortamı) test
// sessizce atlanır, başarısız olmaz.
const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("syncSingleStockEntryPrice (gerçek DB)", () => {
  let tenantId: number;
  const createdProductIds: number[] = [];

  beforeAll(async () => {
    // Standing test tenant (338176 / Yeyu Lastik, bkz. proje hafızası) —
    // ID'yi koddan sabit yazmak yerine kod üzerinden çözerek, farklı bir
    // ortamda ID farklı olsa bile testin kırılmamasını sağlarız.
    const result = await pool.query<{ id: number }>("SELECT id FROM tenants WHERE code = '338176'");
    tenantId = result.rows[0].id;
  });

  afterEach(async () => {
    if (createdProductIds.length > 0) {
      await pool.query("DELETE FROM products WHERE id = ANY($1)", [createdProductIds]);
      createdProductIds.length = 0;
    }
  });

  async function createProductWithEntries(
    entries: { quantity: number; purchase_price: number; sale_price: number }[]
  ): Promise<number> {
    const productResult = await pool.query<{ id: number }>(
      `INSERT INTO products (tenant_id, code, brand, size_desc, purchase_price, sale_price, stock_qty)
       VALUES ($1, 'TEST-SYNC-PRICE', 'TestBrand', '200/50R17', $2, $3, $4) RETURNING id`,
      [tenantId, entries[0]?.purchase_price ?? 0, entries[0]?.sale_price ?? 0, entries.reduce((s, e) => s + e.quantity, 0)]
    );
    const productId = productResult.rows[0].id;
    createdProductIds.push(productId);
    for (const e of entries) {
      await pool.query(
        `INSERT INTO product_stock_entries (tenant_id, product_id, entry_date, quantity, purchase_price, sale_price)
         VALUES ($1, $2, CURRENT_DATE, $3, $4, $5)`,
        [tenantId, productId, e.quantity, e.purchase_price, e.sale_price]
      );
    }
    return productId;
  }

  it("tek stok girişi varsa fiyatı yeni değere senkronlar", async () => {
    const productId = await createProductWithEntries([{ quantity: 5, purchase_price: 100, sale_price: 150 }]);

    await syncSingleStockEntryPrice(pool, tenantId, productId, 200, 250);

    const entries = await pool.query<{ purchase_price: string; sale_price: string }>(
      "SELECT purchase_price, sale_price FROM product_stock_entries WHERE product_id = $1",
      [productId]
    );
    expect(entries.rows).toHaveLength(1);
    expect(Number(entries.rows[0].purchase_price)).toBe(200);
    expect(Number(entries.rows[0].sale_price)).toBe(250);
  });

  it("birden fazla stok girişi varsa gerçek maliyet geçmişine DOKUNMAZ", async () => {
    const productId = await createProductWithEntries([
      { quantity: 5, purchase_price: 100, sale_price: 150 },
      { quantity: 3, purchase_price: 120, sale_price: 180 },
    ]);

    await syncSingleStockEntryPrice(pool, tenantId, productId, 999, 999);

    const entries = await pool.query<{ purchase_price: string; sale_price: string }>(
      "SELECT purchase_price, sale_price FROM product_stock_entries WHERE product_id = $1 ORDER BY id",
      [productId]
    );
    expect(entries.rows).toHaveLength(2);
    expect(Number(entries.rows[0].purchase_price)).toBe(100);
    expect(Number(entries.rows[1].purchase_price)).toBe(120);
  });

  it("hiç stok girişi yoksa sessizce hiçbir şey yapmaz (hata fırlatmaz)", async () => {
    const productId = await createProductWithEntries([]);
    await expect(syncSingleStockEntryPrice(pool, tenantId, productId, 200, 250)).resolves.toBeUndefined();
  });
});
