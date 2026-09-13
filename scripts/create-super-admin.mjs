// Süper admin hesabı oluşturma aracı — hiçbir gerçek müşteriye ait olmayan,
// sadece Süper Admin Paneli (bkz. src/app/super-admin/) için var olan
// dahili "Platform Yönetimi" tenant'ı altında bir kullanıcı açar. İlk
// çalıştırmada bu tenant yoksa oluşturulur (is_platform = true); sonraki
// çalıştırmalarda mevcut tenant kullanılır (ikinci bir süper admin eklemek
// için script farklı bir kullanıcı adıyla tekrar çalıştırılabilir).
//
// Kullanım: node scripts/create-super-admin.mjs kullaniciadi sifre
//
// scripts/create-tenant.mjs ile aynı desende (bu script de düz `node` ile
// çalıştığından "@/" path alias'ını çözemez, src/lib/provisionTenant.ts'i
// import edemez — kod burada kasıtlı olarak bağımsız tutulur).
import path from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import { Client } from "pg";
import bcrypt from "bcryptjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
nextEnv.loadEnvConfig(path.join(__dirname, ".."));

const PLATFORM_SLUG = "platform-yonetimi";
const PLATFORM_NAME = "Platform Yönetimi";

function generateRandomCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}
async function generateUniqueCode(client) {
  for (;;) {
    const candidate = generateRandomCode();
    const existing = await client.query("SELECT 1 FROM tenants WHERE code = $1", [candidate]);
    if (existing.rows.length === 0) return candidate;
  }
}

async function main() {
  const [adminUsernameRaw, adminPassword] = process.argv.slice(2);
  const adminUsername = (adminUsernameRaw ?? "").trim();
  if (!adminUsername || !adminPassword) {
    console.error("Kullanım: node scripts/create-super-admin.mjs kullaniciadi sifre");
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

    let tenantResult = await client.query("SELECT id, code FROM tenants WHERE slug = $1", [PLATFORM_SLUG]);
    let tenantId, code;
    if (tenantResult.rows.length > 0) {
      tenantId = tenantResult.rows[0].id;
      code = tenantResult.rows[0].code;
    } else {
      code = await generateUniqueCode(client);
      tenantResult = await client.query(
        "INSERT INTO tenants (name, slug, code, is_platform) VALUES ($1, $2, $3, true) RETURNING id",
        [PLATFORM_NAME, PLATFORM_SLUG, code]
      );
      tenantId = tenantResult.rows[0].id;
    }

    const passwordHash = await bcrypt.hash(adminPassword, 10);
    const userResult = await client.query(
      `INSERT INTO users (tenant_id, username, password_hash, role)
       VALUES ($1, $2, $3, 'super_admin')
       RETURNING id`,
      [tenantId, adminUsername, passwordHash]
    );

    await client.query("COMMIT");
    console.log(`Süper admin oluşturuldu: user_id=${userResult.rows[0].id}, kullanıcı adı=${adminUsername}, Firma Kodu=${code}`);
    console.log(`Giriş: /admin/login ekranından Firma Kodu=${code}, kullanıcı adı=${adminUsername}, şifreniz ile giriş yapın.`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Süper admin oluşturma başarısız:", err);
  process.exit(1);
});
