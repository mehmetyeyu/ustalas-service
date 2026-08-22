// Yeni bir firma (tenant) oluşturur — tenant satırı + app_settings satırı +
// varsayılan hizmet/tedarikçi listesi + o firmanın ana admin kullanıcısı,
// tek bir transaction'da. HTTP'den bağımsız, saf bir fonksiyon: bugün
// scripts/create-tenant.mjs (dahili/manuel onboarding) tarafından çağrılıyor,
// ileride bir kayıt (register) sayfası eklenirse aynen (değiştirilmeden)
// oradan da çağrılabilir — bkz. ~/.claude/plans/joyful-kindling-badger.md.
import bcrypt from "bcryptjs";
import pool from "@/lib/db";

// database/schema.sql'deki varsayılan hizmet/tedarikçi seed listeleriyle
// birebir aynı — orası artık yeni firma oluştururken çalışmıyor (o INSERT'ler
// global/tekil bir kuruluma özeldi), bu yüzden liste burada tekrarlanıyor.
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

export interface ProvisionTenantInput {
  tenantName: string;
  adminUsername: string;
  adminPassword: string;
  slug?: string;
  plan?: string;
}

export interface ProvisionTenantResult {
  tenantId: number;
  adminUserId: number;
}

export async function provisionTenant(input: ProvisionTenantInput): Promise<ProvisionTenantResult> {
  const tenantName = input.tenantName.trim();
  const adminUsername = input.adminUsername.trim();
  if (!tenantName) throw new Error("Firma adı zorunludur.");
  if (!adminUsername) throw new Error("Yönetici kullanıcı adı zorunludur.");
  if (input.adminPassword.length < 6) throw new Error("Şifre en az 6 karakter olmalıdır.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const tenantResult = await client.query(
      `INSERT INTO tenants (name, slug, plan) VALUES ($1, $2, $3) RETURNING id`,
      [tenantName, input.slug ?? null, input.plan ?? null]
    );
    const tenantId: number = tenantResult.rows[0].id;

    await client.query(
      `INSERT INTO app_settings (tenant_id, business_name) VALUES ($1, $2)`,
      [tenantId, tenantName]
    );

    // Yeni bir tenant_id için hiçbir satır zaten var olamayacağından ON
    // CONFLICT'e gerek yok. Tek tek 21+7 INSERT yerine (100 firma
    // provizyonunda gereksiz round-trip biriktirirdi) tek sorguda toplu insert.
    await client.query(
      `INSERT INTO services (tenant_id, name) SELECT $1, unnest($2::text[])`,
      [tenantId, DEFAULT_SERVICE_NAMES]
    );
    await client.query(
      `INSERT INTO suppliers (tenant_id, name) SELECT $1, unnest($2::text[])`,
      [tenantId, DEFAULT_SUPPLIER_NAMES]
    );

    const passwordHash = await bcrypt.hash(input.adminPassword, 10);
    const userResult = await client.query(
      `INSERT INTO users (tenant_id, username, password_hash, role, is_primary_admin)
       VALUES ($1, $2, $3, 'admin', true)
       RETURNING id`,
      [tenantId, adminUsername, passwordHash]
    );
    const adminUserId: number = userResult.rows[0].id;

    await client.query("COMMIT");
    return { tenantId, adminUserId };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
