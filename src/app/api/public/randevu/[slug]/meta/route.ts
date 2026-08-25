import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { resolveTenantBySlug } from "@/lib/publicTenant";
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
    const settings = await pool.query<{
      booking_capacity: number; booking_working_hours: unknown; booking_max_days_ahead: number;
      booking_widget_preset: string; booking_widget_accent_color: string;
      booking_widget_columns_tablet: number; booking_widget_columns_desktop: number;
      booking_widget_title: string | null; booking_widget_description: string | null;
      booking_widget_show_heading_embed: boolean;
    }>(
      `SELECT booking_capacity, booking_working_hours, booking_max_days_ahead,
              booking_widget_preset, booking_widget_accent_color,
              booking_widget_columns_tablet, booking_widget_columns_desktop,
              booking_widget_title, booking_widget_description, booking_widget_show_heading_embed
       FROM app_settings WHERE tenant_id = $1`,
      [tenant.id]
    );
    const services = await pool.query<{ id: number; name: string; duration_minutes: number | null }>(
      `SELECT id, name, duration_minutes FROM services
       WHERE tenant_id = $1 AND bookable = true AND is_active = 1
       ORDER BY name`,
      [tenant.id]
    );
    const s = settings.rows[0];

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
      },
    }));
  } catch (error) {
    console.error(error);
    return withCors(NextResponse.json({ error: "Sunucu hatası." }, { status: 500 }));
  }
}
