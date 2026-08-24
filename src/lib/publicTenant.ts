import pool from "./db";

export interface PublicTenant {
  id: number;
  name: string;
  slug: string;
}

// Oturum açmamış müşteri sayfalarının (bkz. /randevu/[slug] ve
// /api/public/randevu/[slug]/*) kiracıyı çözümleme yolu — getAuthUser()'ın
// aksine bir oturuma değil, URL'deki slug'a dayanır. is_active=false olan
// bir firma (bkz. tenants.is_active, oturumlu tarafta da aynı şekilde
// kontrol edilir) hiçbir public veri döndürmez.
export async function resolveTenantBySlug(slug: string): Promise<PublicTenant | null> {
  if (!slug) return null;
  const result = await pool.query<PublicTenant>(
    "SELECT id, name, slug FROM tenants WHERE slug = $1 AND is_active = true",
    [slug]
  );
  return result.rows[0] ?? null;
}
