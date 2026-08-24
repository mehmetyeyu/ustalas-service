// Yeni bir firma (tenant) oluşturur — tenant satırı + app_settings satırı +
// varsayılan hizmet/tedarikçi listesi + o firmanın ana admin kullanıcısı,
// tek bir transaction'da. HTTP'den bağımsız, saf bir fonksiyon: bugün
// scripts/create-tenant.mjs (dahili/manuel onboarding) tarafından çağrılıyor,
// ileride bir kayıt (register) sayfası eklenirse aynen (değiştirilmeden)
// oradan da çağrılabilir — bkz. ~/.claude/plans/joyful-kindling-badger.md.
import bcrypt from "bcryptjs";
import pool from "@/lib/db";

interface QueryClient {
  query<T = unknown>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

const TURKISH_MAP: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" };

function slugifyBase(name: string): string {
  const ascii = name
    .toLocaleLowerCase("tr-TR")
    .replace(/[çğıöşü]/g, (ch) => TURKISH_MAP[ch] ?? ch)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return ascii || "firma";
}

// tenants.slug artık NOT NULL (bkz. database/schema.sql, "Online Randevu"
// bölümü) — /randevu/<slug> public rotasının kiracıyı çözümleyebilmesi için
// her firmanın benzersiz bir slug'ı olmak zorunda. database/schema.sql'deki
// mevcut-firma backfill'iyle aynı çakışma-çözme mantığı (base, base-2, ...).
async function generateUniqueSlug(client: QueryClient, name: string): Promise<string> {
  const base = slugifyBase(name);
  let candidate = base;
  let suffix = 2;
  for (;;) {
    const existing = await client.query("SELECT 1 FROM tenants WHERE slug = $1", [candidate]);
    if (existing.rows.length === 0) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}

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

// app_settings.payment_types'ın kolon DEFAULT'una güvenmek yerine burada
// açıkça listeleniyor — o DEFAULT bir süre (yanlışlıkla) Ustalas'a özel bir
// listeye sabitlenmişti ve "CREATE TABLE IF NOT EXISTS" bunu canlı
// veritabanında asla düzeltmediğinden yeni firmalar o özel listeyi miras
// alıyordu (bkz. database/schema.sql notu). Açıkça belirtmek bu sınıf
// hatayı bir daha imkansız kılar.
const DEFAULT_PAYMENT_TYPES = ["Nakit", "POS", "Cari", "Fatura Edildi.", "Havale/EFT", "Mail Order"];

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

    const slug = input.slug?.trim() || await generateUniqueSlug(client, tenantName);
    const tenantResult = await client.query(
      `INSERT INTO tenants (name, slug, plan) VALUES ($1, $2, $3) RETURNING id`,
      [tenantName, slug, input.plan ?? null]
    );
    const tenantId: number = tenantResult.rows[0].id;

    await client.query(
      `INSERT INTO app_settings (tenant_id, business_name, payment_types) VALUES ($1, $2, $3)`,
      [tenantId, tenantName, DEFAULT_PAYMENT_TYPES]
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
