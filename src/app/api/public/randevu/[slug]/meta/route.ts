import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { resolveTenantBySlug } from "@/lib/publicTenant";
import { getCachedBookingConfigRow } from "@/lib/publicBookingConfigCache";
import { withCors, corsPreflight } from "@/lib/publicCors";

export const OPTIONS = corsPreflight;

// Kimlik doğrulamasız — bkz. src/lib/publicTenant.ts. Randevu formunun ilk
// adımını (firma adı + randevuya açık hizmetler) doldurmak için.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const tenant = await resolveTenantBySlug(slug);
  if (!tenant) return withCors(NextResponse.json({ error: "Bulunamadı." }, { status: 404 }));

  try {
    const [s, services] = await Promise.all([
      getCachedBookingConfigRow(tenant.id),
      pool.query<{ id: number; name: string; duration_minutes: number | null }>(
        `SELECT id, name, duration_minutes FROM services
         WHERE tenant_id = $1 AND bookable = true AND is_active = 1
         ORDER BY name`,
        [tenant.id]
      ),
    ]);

    // Vercel CDN önbelleği: widget firmanın sitesinin her sayfa görüntülemesinde
    // bunu ister — önbelleksiz, yoğun bir site tek başına tüm platformun
    // (bütün firmaların paneli dahil) Vercel CPU bütçesini tüketebilirdi.
    // CDN'de 1 saat taze, süre dolunca 1 güne kadar eski yanıt anında verilip
    // arka planda yenilenir → firma başına saatte ~1 fonksiyon çağrısı.
    // Hizmet/çalışma saati/görünüm değişikliği widget'a en geç ~1 saatte
    // yansır (kullanıcı onayladı); randevu kaydı (POST) ve müsait saatler
    // (/slots) canlı kalır, yani önbellek yüzünden hatalı randevu oluşmaz.
    // CORS başlığı joker (*) — yanıt ziyaretçinin origin'ine göre değişmediği
    // için paylaşımlı önbellekte güvenli. Sadece başarılı yanıt önbelleklenir.
    const cacheHeaders = {
      "Cache-Control": "public, max-age=300",
      "Vercel-CDN-Cache-Control": "max-age=3600, stale-while-revalidate=86400",
    };
    return withCors(NextResponse.json({
      tenant: { name: tenant.name, slug: tenant.slug },
      workingHours: s?.booking_working_hours ?? null,
      services: services.rows,
      maxDaysAhead: s?.booking_max_days_ahead ?? 30,
      style: {
        preset: s?.booking_widget_preset ?? "card",
        accentColor: s?.booking_widget_accent_color ?? "#2563eb",
        columnsTablet: s?.booking_widget_columns_tablet ?? 1,
        columnsDesktop: s?.booking_widget_columns_desktop ?? 1,
        title: s?.booking_widget_title ?? null,
        description: s?.booking_widget_description ?? null,
        showHeadingInEmbed: s?.booking_widget_show_heading_embed ?? false,
        radius: s?.booking_widget_radius ?? "lg",
        density: s?.booking_widget_density ?? "normal",
        headingSize: s?.booking_widget_heading_size ?? "md",
      },
    }, { headers: cacheHeaders }));
  } catch (error) {
    console.error(error);
    return withCors(NextResponse.json({ error: "Sunucu hatası." }, { status: 500 }));
  }
}
