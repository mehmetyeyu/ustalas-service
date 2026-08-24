import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { resolveTenantBySlug } from "@/lib/publicTenant";

// Kimlik doğrulamasız — bkz. src/lib/publicTenant.ts. Randevu formunun ilk
// adımını (firma adı + randevuya açık hizmetler) doldurmak için.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const tenant = await resolveTenantBySlug(slug);
  if (!tenant) return NextResponse.json({ error: "Bulunamadı." }, { status: 404 });

  try {
    const settings = await pool.query<{ booking_capacity: number; booking_working_hours: unknown; booking_max_days_ahead: number }>(
      "SELECT booking_capacity, booking_working_hours, booking_max_days_ahead FROM app_settings WHERE tenant_id = $1",
      [tenant.id]
    );
    const services = await pool.query<{ id: number; name: string; duration_minutes: number | null }>(
      `SELECT id, name, duration_minutes FROM services
       WHERE tenant_id = $1 AND bookable = true AND is_active = 1
       ORDER BY name`,
      [tenant.id]
    );

    return NextResponse.json({
      tenant: { name: tenant.name, slug: tenant.slug },
      workingHours: settings.rows[0]?.booking_working_hours ?? null,
      services: services.rows,
      maxDaysAhead: settings.rows[0]?.booking_max_days_ahead ?? 30,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
