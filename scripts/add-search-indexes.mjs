// Siparişler/Ürünler/Malzeme Hareketleri/Depolama arama kutularının kullandığı
// ILIKE '%...%' sorgularını (bkz. src/lib/orderQuery.ts, src/app/api/products/
// route.ts, src/app/api/products/movements/route.ts, src/app/api/storage/
// route.ts) gerçek bir index taramasıyla karşılamak için pg_trgm/GIN index'leri.
//
// Neden migrate.mjs/schema.sql İÇİNDE DEĞİL, ayrı bir script: migrate.mjs
// schema.sql'i TEK bir çok-ifadeli query olarak gönderiyor, Postgres bunu
// örtük bir transaction içinde çalıştırıyor — CREATE INDEX CONCURRENTLY bir
// transaction bloğu içinde ÇALIŞAMAZ (yazma kilidi almadan index kurmanın
// koşulu budur). Bu yüzden her CREATE INDEX burada kendi ayrı sorgusu olarak
// gönderiliyor. IF NOT EXISTS sayesinde tekrar tekrar çalıştırmak güvenlidir.
//
// Kullanım: node scripts/add-search-indexes.mjs (DATABASE_URL neyi
// gösteriyorsa ona uygulanır — npm run env:local / env:prod ile kontrol edin).
import path from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import { Client } from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
nextEnv.loadEnvConfig(path.join(__dirname, ".."));

// [indexName, tableName, indexedExpression]
const INDEXES = [
  ["orders_customer_name_trgm_idx", "orders", "customer_name"],
  ["orders_plate_trgm_idx", "orders", "plate"],
  ["order_services_supplier_trgm_idx", "order_services", "supplier"],
  ["order_services_stock_code_trgm_idx", "order_services", "stock_code"],
  ["order_services_size_desc_trgm_idx", "order_services", "size_desc"],
  // "205/45" yazılınca da "20545" yazılınca da eşleşsin diye (bkz. yukarıdaki
  // dosyalardaki REPLACE(size_desc, '/', '') ILIKE deseni) — normal trgm
  // index'i bu ifadeyi karşılamaz, ayrı bir expression index gerekir.
  ["order_services_size_desc_noslash_trgm_idx", "order_services", "(REPLACE(size_desc, '/', ''))"],
  ["order_services_brand_trgm_idx", "order_services", "brand"],
  ["order_services_model_name_trgm_idx", "order_services", "model_name"],
  ["products_code_trgm_idx", "products", "code"],
  ["products_brand_trgm_idx", "products", "brand"],
  ["products_supplier_trgm_idx", "products", "supplier"],
  ["products_size_desc_trgm_idx", "products", "size_desc"],
  ["products_size_desc_noslash_trgm_idx", "products", "(REPLACE(size_desc, '/', ''))"],
  ["storage_plate_trgm_idx", "storage", "plate"],
  ["storage_customer_name_trgm_idx", "storage", "customer_name"],
];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL tanımlı değil.");
    process.exit(1);
  }

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");
    for (const [name, table, expr] of INDEXES) {
      const start = Date.now();
      await client.query(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${name} ON ${table} USING gin (${expr} gin_trgm_ops)`
      );
      console.log(`${name} (${Date.now() - start}ms)`);
    }
    console.log("Tamamlandı.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Index oluşturma başarısız:", err);
  process.exit(1);
});
