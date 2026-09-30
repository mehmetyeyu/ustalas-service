// Bir firmanın DENEME verilerini sıfırlayıp gerçek girişlere hazır hâle
// getirmek için — Tedarikçiler ve Hizmetler HARİÇ, o firmaya ait her şeyi
// siler (Siparişler, Müşteriler, Depolama, Randevular, Masraflar/Sabit
// Giderler, Kasa hareketleri + tanımları, Ürün kataloğu tamamen). Kullanıcı/
// Genel Ayarlar/firma kaydının kendisi hiç dokunulmaz.
//
// GÜVENLİK: varsayılan olarak DRY-RUN'dır — sadece silinecek satır sayılarını
// gösterir, hiçbir şey silmez. Gerçekten silmek için --confirm gerekir.
//
// Silme SIRASI rastgele değil — database/schema.sql'deki foreign key
// kurallarına göre (ör. customer_ledger_entries.customer_id CASCADE değil,
// kasa_id'ye bağlı 6 tablo var) elle çıkarıldı: önce customer_ledger_entries
// + appointments (orders'a CASCADE/SET NULL ile bağlı ama bazı satırlar
// bağımsız olabilir), sonra orders (order_services/order_payments'ı
// CASCADE ile götürür), sonra customers/storage/expenses/recurring_expenses/
// cash_ledger_entries, sonra products (product_stock_entries'i CASCADE ile
// götürür), EN SON kasalar (yukarıdaki hiçbir tablo artık ona referans
// vermediği için).
//
// Kullanım:
//   node scripts/reset-tenant-data.mjs --code=338176            (dry-run, sayım gösterir)
//   node scripts/reset-tenant-data.mjs --code=338176 --confirm  (gerçekten siler)
import path from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import { Client } from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
nextEnv.loadEnvConfig(path.join(__dirname, ".."));

const args = process.argv.slice(2);
const codeArg = args.find((a) => a.startsWith("--code="));
const confirm = args.includes("--confirm");
const code = codeArg?.split("=")[1]?.trim();

if (!code) {
  console.error("Kullanım: node scripts/reset-tenant-data.mjs --code=FIRMA_KODU [--confirm]");
  process.exit(1);
}

// Silme sırası önemli — yorumdaki gerekçeye bkz.
const DELETE_STEPS = [
  ["customer_ledger_entries", "Cari hareketleri"],
  ["appointments", "Randevular"],
  ["orders", "Siparişler (+ satırları + ödemeleri otomatik)"],
  ["customers", "Müşteriler"],
  ["storage", "Depolama kayıtları"],
  ["expenses", "Masraflar"],
  ["recurring_expenses", "Sabit Giderler"],
  ["cash_ledger_entries", "Kasa hareketleri"],
  ["products", "Ürün kataloğu (+ stok girişleri otomatik)"],
  ["kasalar", "Kasa tanımları"],
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
    const tenantResult = await client.query(
      "SELECT id, name FROM tenants WHERE code = $1",
      [code]
    );
    if (tenantResult.rows.length === 0) {
      console.error(`Firma kodu bulunamadı: ${code}`);
      process.exit(1);
    }
    const { id: tenantId, name } = tenantResult.rows[0];
    console.log(`Firma: ${name} (tenant_id=${tenantId}, kod=${code})`);
    console.log(confirm ? "MOD: GERÇEKTEN SİLİNECEK\n" : "MOD: DRY-RUN (sadece sayım, hiçbir şey silinmeyecek)\n");

    if (!confirm) {
      for (const [table, label] of DELETE_STEPS) {
        const r = await client.query(`SELECT COUNT(*)::int AS n FROM ${table} WHERE tenant_id = $1`, [tenantId]);
        console.log(`${label.padEnd(45)} ${r.rows[0].n} kayıt silinecek`);
      }
      console.log("\nGerçekten silmek için aynı komutu --confirm ile tekrar çalıştırın.");
      return;
    }

    await client.query("BEGIN");
    try {
      for (const [table, label] of DELETE_STEPS) {
        const r = await client.query(`DELETE FROM ${table} WHERE tenant_id = $1`, [tenantId]);
        console.log(`${label.padEnd(45)} ${r.rowCount} kayıt silindi`);
      }
      await client.query("COMMIT");
      console.log("\nTamamlandı — Tedarikçiler ve Hizmetler dokunulmadı.");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Sıfırlama başarısız:", err);
  process.exit(1);
});
