import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { getAppSettings } from "@/lib/settings";
import { PROTECTED_PAYMENT_TYPES } from "@/lib/paymentTypes";
import { invalidateBookingConfigCache } from "@/lib/publicBookingConfigCache";
import { normalizeTurkishPhone } from "@/lib/phone";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  const settings = await getAppSettings(user.tenantId!);
  // slug/code birer "ayar" değil, kiracı kimliği — slug Randevu Ayarları'ndaki
  // "Embed Kodu" bölümünün doğru /randevu/<slug> URL'ini gösterebilmesi,
  // code ise Genel Ayarlar'ın girişte kullanılan Firma Kodu'nu gösterebilmesi
  // için burada ayrıca ekleniyor.
  const tenantResult = await pool.query<{
    slug: string; code: string; contact_name: string | null; contact_email: string | null; contact_phone: string | null;
    landline_phone: string | null; website: string | null;
  }>(
    "SELECT slug, code, contact_name, contact_email, contact_phone, landline_phone, website FROM tenants WHERE id = $1",
    [user.tenantId]
  );
  // whatsapp_access_token asla ham haliyle client'a dönmez — sadece kayıtlı
  // olup olmadığı gösterilir (bkz. PUT: boş gönderilirse mevcut token korunur,
  // sadece admin gerçekten yeni bir değer girdiğinde değişir).
  return NextResponse.json({
    ...settings,
    whatsapp_access_token: undefined,
    whatsapp_access_token_set: !!settings.whatsapp_access_token,
    slug: tenantResult.rows[0]?.slug ?? null,
    code: tenantResult.rows[0]?.code ?? null,
    contact_name: tenantResult.rows[0]?.contact_name ?? null,
    contact_email: tenantResult.rows[0]?.contact_email ?? null,
    contact_phone: tenantResult.rows[0]?.contact_phone ?? null,
    landline_phone: tenantResult.rows[0]?.landline_phone ?? null,
    website: tenantResult.rows[0]?.website ?? null,
  });
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
    const orders_default_date_filter = String(body.orders_default_date_filter ?? "");
    const whatsapp_enabled = !!body.whatsapp_enabled;
    // Boş/gönderilmemiş bırakılırsa mevcut token DB'de korunur (aşağıdaki
    // UPDATE'teki CASE'e bkz.) — GET /api/settings ham token'ı hiç döndürmüyor,
    // bu yüzden "değişmedi" ile "kasten silindi" ayrımı yapılamaz; admin
    // token'ı silmek isterse yeni bir tane girip üzerine yazmalı.
    const whatsapp_access_token_input = typeof body.whatsapp_access_token === "string" ? body.whatsapp_access_token.trim().slice(0, 2000) : "";
    const whatsapp_phone_number_id = body.whatsapp_phone_number_id ? String(body.whatsapp_phone_number_id).trim().slice(0, 50) : null;
    const whatsapp_business_account_id = body.whatsapp_business_account_id ? String(body.whatsapp_business_account_id).trim().slice(0, 50) : null;
    const whatsapp_template_name = body.whatsapp_template_name ? String(body.whatsapp_template_name).trim().slice(0, 100) : null;
    const shared_stock_enabled = !!body.shared_stock_enabled;
    const contact_name = body.contact_name ? String(body.contact_name).trim().slice(0, 150) || null : null;
    const contact_email = body.contact_email ? String(body.contact_email).trim().slice(0, 150) || null : null;
    // İyzico faturalandırma akışı (bkz. src/lib/iyzico.ts:normalizeGsmNumber)
    // temiz, geçerli bir ulusal numaraya güveniyor — serbest metin burada
    // kabul edilip iyzico'ya gidince reddedilmesin diye (gerçek bir
    // denetimde saptandı) doğrulama/normalize kaynağında yapılır. Alan
    // opsiyonel: boş bırakılırsa null, doluysa geçerli olmak zorunda.
    const contactPhoneRaw = body.contact_phone ? String(body.contact_phone).trim() : "";
    const contact_phone = contactPhoneRaw ? normalizeTurkishPhone(contactPhoneRaw) : null;
    if (contactPhoneRaw && !contact_phone) {
      return NextResponse.json({ error: "Geçersiz telefon numarası." }, { status: 400 });
    }
    // Sabit hat — normalizeTurkishPhone mobil/sabit ayrımı yapmıyor (bkz.
    // src/lib/phone.ts), aynı doğrulama/biçim burada da geçerli.
    const landlinePhoneRaw = body.landline_phone ? String(body.landline_phone).trim() : "";
    const landline_phone = landlinePhoneRaw ? normalizeTurkishPhone(landlinePhoneRaw) : null;
    if (landlinePhoneRaw && !landline_phone) {
      return NextResponse.json({ error: "Geçersiz sabit telefon numarası." }, { status: 400 });
    }
    const website = body.website ? String(body.website).trim().slice(0, 200) || null : null;

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
    if (!["", "bugun", "bu_hafta", "bu_ay"].includes(orders_default_date_filter)) {
      return NextResponse.json({ error: "Geçersiz varsayılan tarih filtresi." }, { status: 400 });
    }
    if (contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact_email)) {
      return NextResponse.json({ error: "Geçersiz e-posta adresi." }, { status: 400 });
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
           orders_default_date_filter=$19,
           whatsapp_enabled=$20, whatsapp_access_token=CASE WHEN $21 = '' THEN whatsapp_access_token ELSE $21 END,
           whatsapp_phone_number_id=$22, whatsapp_business_account_id=$23, whatsapp_template_name=$24,
           shared_stock_enabled=$25,
           updated_at=CURRENT_TIMESTAMP
       WHERE tenant_id=$26`,
      [
        business_name, storage_overdue_months, payment_types, booking_capacity,
        JSON.stringify(booking_working_hours), booking_auto_approve, booking_max_days_ahead,
        booking_widget_preset, booking_widget_accent_color,
        booking_widget_columns_tablet, booking_widget_columns_desktop,
        booking_widget_title, booking_widget_description, booking_widget_show_heading_embed,
        booking_widget_radius, booking_widget_density, booking_widget_heading_size,
        auto_register_customers, orders_default_date_filter,
        whatsapp_enabled, whatsapp_access_token_input,
        whatsapp_phone_number_id, whatsapp_business_account_id, whatsapp_template_name,
        shared_stock_enabled,
        user.tenantId,
      ]
    );

    // name/contact_* alanları app_settings değil tenants tablosunda (bkz.
    // src/lib/provisionTenant.ts, süper admin paneli, /api/shared-stock'un
    // eşleşme bulununca gösterdiği iletişim bilgisi) — ayrı bir UPDATE gerekir.
    // tenants.name burada business_name ile senkron tutulur — aksi halde
    // İşletme Adı değiştirilince Süper Admin panelindeki/Paylaşılan Stok'taki
    // firma adı eskisi olarak kalır (bkz. gerçek bir müşteri raporu: XXX ->
    // Yeyu Lastik yeniden adlandırılınca Süper Admin'de görünmedi).
    await pool.query(
      "UPDATE tenants SET name=$1, contact_name=$2, contact_email=$3, contact_phone=$4, landline_phone=$5, website=$6 WHERE id=$7",
      [business_name, contact_name, contact_email, contact_phone, landline_phone, website, user.tenantId]
    );

    invalidateBookingConfigCache(user.tenantId!);

    return NextResponse.json({
      business_name, storage_overdue_months, payment_types, booking_capacity, booking_working_hours,
      booking_auto_approve, booking_max_days_ahead, booking_widget_preset, booking_widget_accent_color,
      booking_widget_columns_tablet, booking_widget_columns_desktop,
      booking_widget_title, booking_widget_description, booking_widget_show_heading_embed,
      booking_widget_radius, booking_widget_density, booking_widget_heading_size,
      auto_register_customers, orders_default_date_filter,
      whatsapp_enabled, whatsapp_phone_number_id, whatsapp_business_account_id, whatsapp_template_name,
      shared_stock_enabled,
      contact_name, contact_email, contact_phone, landline_phone, website,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
