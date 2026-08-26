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
    const booking_widget_preset = String(body.booking_widget_preset ?? "card");
    const booking_widget_accent_color = String(body.booking_widget_accent_color ?? "#2563eb");
    const booking_widget_columns_tablet = Number(body.booking_widget_columns_tablet ?? 1);
    const booking_widget_columns_desktop = Number(body.booking_widget_columns_desktop ?? 1);
    const booking_widget_title = body.booking_widget_title ? String(body.booking_widget_title).trim().slice(0, 120) || null : null;
    const booking_widget_description = body.booking_widget_description ? String(body.booking_widget_description).trim().slice(0, 300) || null : null;
    const booking_widget_show_heading_embed = !!body.booking_widget_show_heading_embed;
    const booking_widget_radius = String(body.booking_widget_radius ?? "lg");
    const booking_widget_density = String(body.booking_widget_density ?? "normal");
    const booking_widget_heading_size = String(body.booking_widget_heading_size ?? "md");
    const auto_register_customers = !!body.auto_register_customers;

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
    if (!["card", "seamless", "outlined"].includes(booking_widget_preset)) {
      return NextResponse.json({ error: "Geçersiz görünüm stili." }, { status: 400 });
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(booking_widget_accent_color)) {
      return NextResponse.json({ error: "Geçersiz vurgu rengi." }, { status: 400 });
    }
    if (![1, 2].includes(booking_widget_columns_tablet)) {
      return NextResponse.json({ error: "Tablet kolon sayısı 1 veya 2 olmalıdır." }, { status: 400 });
    }
    if (![1, 2, 3].includes(booking_widget_columns_desktop)) {
      return NextResponse.json({ error: "Masaüstü kolon sayısı 1, 2 veya 3 olmalıdır." }, { status: 400 });
    }
    if (!["sharp", "md", "lg", "pill"].includes(booking_widget_radius)) {
      return NextResponse.json({ error: "Geçersiz köşe yuvarlığı." }, { status: 400 });
    }
    if (!["compact", "normal", "comfortable"].includes(booking_widget_density)) {
      return NextResponse.json({ error: "Geçersiz boşluk yoğunluğu." }, { status: 400 });
    }
    if (!["sm", "md", "lg"].includes(booking_widget_heading_size)) {
      return NextResponse.json({ error: "Geçersiz başlık boyutu." }, { status: 400 });
    }

    await pool.query(
      `UPDATE app_settings
       SET business_name=$1, storage_overdue_months=$2, payment_types=$3,
           booking_capacity=$4, booking_working_hours=$5, booking_auto_approve=$6,
           booking_max_days_ahead=$7, booking_widget_preset=$8, booking_widget_accent_color=$9,
           booking_widget_columns_tablet=$10, booking_widget_columns_desktop=$11,
           booking_widget_title=$12, booking_widget_description=$13,
           booking_widget_show_heading_embed=$14, booking_widget_radius=$15,
           booking_widget_density=$16, booking_widget_heading_size=$17, auto_register_customers=$18,
           updated_at=CURRENT_TIMESTAMP
       WHERE tenant_id=$19`,
      [
        business_name, storage_overdue_months, payment_types, booking_capacity,
        JSON.stringify(booking_working_hours), booking_auto_approve, booking_max_days_ahead,
        booking_widget_preset, booking_widget_accent_color,
        booking_widget_columns_tablet, booking_widget_columns_desktop,
        booking_widget_title, booking_widget_description, booking_widget_show_heading_embed,
        booking_widget_radius, booking_widget_density, booking_widget_heading_size,
        auto_register_customers,
        user.tenantId,
      ]
    );

    return NextResponse.json({
      business_name, storage_overdue_months, payment_types, booking_capacity, booking_working_hours,
      booking_auto_approve, booking_max_days_ahead, booking_widget_preset, booking_widget_accent_color,
      booking_widget_columns_tablet, booking_widget_columns_desktop,
      booking_widget_title, booking_widget_description, booking_widget_show_heading_embed,
      booking_widget_radius, booking_widget_density, booking_widget_heading_size,
      auto_register_customers,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
