import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { getAppSettings } from "@/lib/settings";
import { PROTECTED_PAYMENT_TYPES } from "@/lib/paymentTypes";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  const settings = await getAppSettings(user.tenantId!);
  // slug bir "ayar" değil, kiracı kimliği — Randevu Ayarları'ndaki "Embed
  // Kodu" bölümünün doğru /randevu/<slug> URL'ini gösterebilmesi için burada
  // ayrıca ekleniyor.
  const tenantResult = await pool.query<{ slug: string }>("SELECT slug FROM tenants WHERE id = $1", [user.tenantId]);
  return NextResponse.json({ ...settings, slug: tenantResult.rows[0]?.slug ?? null });
}

export async function PUT(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const body = await request.json();
    const business_name = String(body.business_name ?? "").trim();
    const storage_overdue_months = Number(body.storage_overdue_months);
    const payment_types = Array.isArray(body.payment_types)
      ? Array.from(new Set(body.payment_types.map((v: unknown) => String(v ?? "").trim()).filter(Boolean)))
      : [];
    const booking_capacity = Number(body.booking_capacity ?? 1);
    const booking_working_hours = body.booking_working_hours ?? null;
    const booking_auto_approve = !!body.booking_auto_approve;
    const booking_max_days_ahead = Number(body.booking_max_days_ahead ?? 30);

    if (!business_name) {
      return NextResponse.json({ error: "İşletme adı zorunludur." }, { status: 400 });
    }
    if (!Number.isInteger(storage_overdue_months) || storage_overdue_months < 1 || storage_overdue_months > 60) {
      return NextResponse.json({ error: "Depo bekleme uyarı eşiği 1-60 ay arasında olmalıdır." }, { status: 400 });
    }
    if (payment_types.length === 0) {
      return NextResponse.json({ error: "En az bir ödeme şekli tanımlı olmalıdır." }, { status: 400 });
    }
    const missingProtected = PROTECTED_PAYMENT_TYPES.filter((t) => !payment_types.includes(t));
    if (missingProtected.length > 0) {
      return NextResponse.json({ error: `${missingProtected.join(", ")} kaldırılamaz.` }, { status: 400 });
    }
    if (!Number.isInteger(booking_capacity) || booking_capacity < 1) {
      return NextResponse.json({ error: "Randevu kapasitesi en az 1 olmalıdır." }, { status: 400 });
    }
    if (!Number.isInteger(booking_max_days_ahead) || booking_max_days_ahead < 1 || booking_max_days_ahead > 365) {
      return NextResponse.json({ error: "İleri randevu süresi 1-365 gün arasında olmalıdır." }, { status: 400 });
    }

    await pool.query(
      `UPDATE app_settings
       SET business_name=$1, storage_overdue_months=$2, payment_types=$3,
           booking_capacity=$4, booking_working_hours=$5, booking_auto_approve=$6,
           booking_max_days_ahead=$7, updated_at=CURRENT_TIMESTAMP
       WHERE tenant_id=$8`,
      [business_name, storage_overdue_months, payment_types, booking_capacity, JSON.stringify(booking_working_hours), booking_auto_approve, booking_max_days_ahead, user.tenantId]
    );

    return NextResponse.json({ business_name, storage_overdue_months, payment_types, booking_capacity, booking_working_hours, booking_auto_approve, booking_max_days_ahead });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
