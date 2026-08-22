// Dahili/manuel firma (tenant) oluşturma aracı — "her müşteriye ayrı
// deployment" yerine artık paylaşılan deploymentta yeni bir müşteri
// eklemenin yolu budur (bkz. ~/.claude/plans/joyful-kindling-badger.md).
//
// Kullanım: node scripts/create-tenant.mjs "Firma Adı" kullaniciadi sifre
//
// Bu script src/lib/provisionTenant.ts'in AYNI mantığını (kasıtlı olarak)
// kendi başına tekrarlar — o dosya Next.js/webpack üzerinden "@/" path
// alias'ını çözebiliyor, ama bu script düz `node` ile (scripts/migrate.mjs
// gibi) çalıştığından o alias'ı çözemez. İkisi de değişirse birlikte
// güncellenmeli (varsayılan hizmet/tedarikçi listeleri de dahil).
import path from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import { Client } from "pg";
import bcrypt from "bcryptjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
nextEnv.loadEnvConfig(path.join(__dirname, ".."));

const DEFAULT_SERVICE_NAMES = [
  "Rot Ayarı", "Lastik Satışı", "Lastik Değişimi", "Lastik Tamiri", "Depolama",
  "Diğer", "Jant Düzeltme", "Sensör", "Balans Ayarı", "Far Ayarı",
  "Kargo Geliri", "Subap Değişimi", "Bijon", "Jant Satışı", "Ön Düzen Kontrolü",
  "İkinci El Jant", "İkinci El Lastik", "Nitrojen Hava", "Klima Gazı",
  "Jant Boyama", "Yerinde Montaj Hizmeti",
];

const DEFAULT_SUPPLIER_NAMES = [
  "Servis İşçiliği", "Merkez Lastik Dağıtım", "Anadolu Oto Yedek Parça",
  "Batı Jant", "Örnek Lastik A.Ş.", "İkinci El", "Diğer",
];

// Kolon DEFAULT'una güvenmek yerine açıkça listeleniyor — bkz.
// src/lib/provisionTenant.ts'teki aynı sabitin yanındaki not.
const DEFAULT_PAYMENT_TYPES = ["Nakit", "POS", "Cari", "Fatura Edildi.", "Havale/EFT", "Mail Order"];

async function main() {
  const [tenantNameRaw, adminUsernameRaw, adminPassword] = process.argv.slice(2);
  const tenantName = (tenantNameRaw ?? "").trim();
  const adminUsername = (adminUsernameRaw ?? "").trim();
  if (!tenantName || !adminUsername || !adminPassword) {
    console.error('Kullanım: node scripts/create-tenant.mjs "Firma Adı" kullaniciadi sifre');
    process.exit(1);
  }
  if (adminPassword.length < 6) {
    console.error("Şifre en az 6 karakter olmalıdır.");
    process.exit(1);
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL tanımlı değil.");
    process.exit(1);
  }

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("BEGIN");

    const tenantResult = await client.query(
      "INSERT INTO tenants (name) VALUES ($1) RETURNING id",
      [tenantName]
    );
    const tenantId = tenantResult.rows[0].id;

    await client.query(
      "INSERT INTO app_settings (tenant_id, business_name, payment_types) VALUES ($1, $2, $3)",
      [tenantId, tenantName, DEFAULT_PAYMENT_TYPES]
    );

    await client.query("INSERT INTO services (tenant_id, name) SELECT $1, unnest($2::text[])", [tenantId, DEFAULT_SERVICE_NAMES]);
    await client.query("INSERT INTO suppliers (tenant_id, name) SELECT $1, unnest($2::text[])", [tenantId, DEFAULT_SUPPLIER_NAMES]);

    const passwordHash = await bcrypt.hash(adminPassword, 10);
    const userResult = await client.query(
      `INSERT INTO users (tenant_id, username, password_hash, role, is_primary_admin)
       VALUES ($1, $2, $3, 'admin', true)
       RETURNING id`,
      [tenantId, adminUsername, passwordHash]
    );

    await client.query("COMMIT");
    console.log(`Firma oluşturuldu: tenant_id=${tenantId}, admin user_id=${userResult.rows[0].id}, kullanıcı adı=${adminUsername}`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Firma oluşturma başarısız:", err);
  process.exit(1);
});
