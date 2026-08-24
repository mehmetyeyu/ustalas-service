import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { resolveTenantBySlug } from "@/lib/publicTenant";
import { getAvailableSlots, DEFAULT_DURATION_MINUTES, type WorkingHours } from "@/lib/appointmentSlots";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Kimlik doğrulamasız. Bir gün için gerçek zamanlı müsait slot listesi —
// bkz. src/lib/appointmentSlots.ts (naif saat-sayacı değil, gerçek
// zaman-aralığı çakışma hesabı).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const tenant = await resolveTenantBySlug(slug);
  if (!tenant) return NextResponse.json({ error: "Bulunamadı." }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const serviceIdParam = searchParams.get("service_id");
  if (!date || !DATE_RE.test(date)) {
    return NextResponse.json({ error: "Geçerli bir tarih (YYYY-MM-DD) gerekli." }, { status: 400 });
  }

  try {
    const settings = await pool.query<{ booking_capacity: number; booking_working_hours: WorkingHours | null; booking_max_days_ahead: number }>(
      "SELECT booking_capacity, booking_working_hours, booking_max_days_ahead FROM app_settings WHERE tenant_id = $1",
      [tenant.id]
    );
    const capacity = settings.rows[0]?.booking_capacity ?? 1;
    const workingHours = settings.rows[0]?.booking_working_hours ?? null;
    const maxDaysAhead = settings.rows[0]?.booking_max_days_ahead ?? 30;

    let durationMinutes = DEFAULT_DURATION_MINUTES;
    if (serviceIdParam) {
      const svc = await pool.query<{ duration_minutes: number | null }>(
        "SELECT duration_minutes FROM services WHERE id = $1 AND tenant_id = $2 AND bookable = true",
        [Number(serviceIdParam), tenant.id]
      );
      if (!svc.rows[0]) return NextResponse.json({ error: "Geçersiz hizmet." }, { status: 400 });
      durationMinutes = svc.rows[0].duration_minutes ?? DEFAULT_DURATION_MINUTES;
    }

    const slots = await getAvailableSlots(pool, tenant.id, date, durationMinutes, workingHours, capacity, maxDaysAhead);
    return NextResponse.json({ slots });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
