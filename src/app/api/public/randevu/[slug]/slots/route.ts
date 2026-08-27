import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { resolveTenantBySlug } from "@/lib/publicTenant";
import { getAvailableSlots, DEFAULT_DURATION_MINUTES } from "@/lib/appointmentSlots";
import { getCachedBookingConfigRow } from "@/lib/publicBookingConfigCache";
import { withCors, corsPreflight } from "@/lib/publicCors";

export const OPTIONS = corsPreflight;

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
  if (!tenant) return withCors(NextResponse.json({ error: "Bulunamadı." }, { status: 404 }));

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const serviceIdParam = searchParams.get("service_id");
  if (!date || !DATE_RE.test(date)) {
    return withCors(NextResponse.json({ error: "Geçerli bir tarih (YYYY-MM-DD) gerekli." }, { status: 400 }));
  }

  try {
    const s = await getCachedBookingConfigRow(tenant.id);
    const capacity = s?.booking_capacity ?? 1;
    const workingHours = s?.booking_working_hours ?? null;
    const maxDaysAhead = s?.booking_max_days_ahead ?? 30;

    let durationMinutes = DEFAULT_DURATION_MINUTES;
    if (serviceIdParam) {
      const svc = await pool.query<{ duration_minutes: number | null }>(
        "SELECT duration_minutes FROM services WHERE id = $1 AND tenant_id = $2 AND bookable = true",
        [Number(serviceIdParam), tenant.id]
      );
      if (!svc.rows[0]) return withCors(NextResponse.json({ error: "Geçersiz hizmet." }, { status: 400 }));
      durationMinutes = svc.rows[0].duration_minutes ?? DEFAULT_DURATION_MINUTES;
    }

    const slots = await getAvailableSlots(pool, tenant.id, date, durationMinutes, workingHours, capacity, maxDaysAhead);
    return withCors(NextResponse.json({ slots }));
  } catch (error) {
    console.error(error);
    return withCors(NextResponse.json({ error: "Sunucu hatası." }, { status: 500 }));
  }
}
