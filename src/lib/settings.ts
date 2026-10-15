import pool from "@/lib/db";
import { PROTECTED_PAYMENT_TYPES } from "@/lib/paymentTypes";

export type BookingWidgetPreset = "card" | "seamless" | "outlined";
// Mobil her zaman tek kolon (ayarlanamaz) — tablet 1-2, masaüstü 1-3 kolon
// arasında seçilebilir (bkz. Hizmet/Tarih/Müsait Saatler'in üç bağımsız grid
// öğesi olduğu src/app/randevu/[slug]/page.tsx).
export type BookingWidgetColumnsTablet = 1 | 2;
export type BookingWidgetColumnsDesktop = 1 | 2 | 3;
export type BookingWidgetRadius = "sharp" | "md" | "lg" | "pill";
export type BookingWidgetDensity = "compact" | "normal" | "comfortable";
export type BookingWidgetHeadingSize = "sm" | "md" | "lg";
export type OrdersDefaultDateFilter = "" | "bugun" | "bu_hafta" | "bu_ay";

export interface AppSettings {
  business_name: string;
  storage_overdue_months: number;
  payment_types: string[];
  booking_capacity: number;
  booking_working_hours: import("./appointmentSlots").WorkingHours | null;
  booking_auto_approve: boolean;
  booking_max_days_ahead: number;
  booking_widget_preset: BookingWidgetPreset;
  booking_widget_accent_color: string;
  booking_widget_columns_tablet: BookingWidgetColumnsTablet;
  booking_widget_columns_desktop: BookingWidgetColumnsDesktop;
  booking_widget_title: string | null;
  booking_widget_description: string | null;
  booking_widget_show_heading_embed: boolean;
  booking_widget_radius: BookingWidgetRadius;
  booking_widget_density: BookingWidgetDensity;
  booking_widget_heading_size: BookingWidgetHeadingSize;
  auto_register_customers: boolean;
  orders_default_date_filter: OrdersDefaultDateFilter;
  whatsapp_enabled: boolean;
  whatsapp_access_token: string | null;
  whatsapp_phone_number_id: string | null;
  whatsapp_business_account_id: string | null;
  whatsapp_template_name: string | null;
  shared_stock_enabled: boolean;
  custom_order_no_enabled: boolean;
  // true (varsayılan) — mevcut/tarihsel davranış: Plaka her zaman zorunlu.
  // false — düz ürün satışında (araca bağlı olmayan, bkz. #955 vakası) Plaka
  // boş bırakılabilir; bu durumda Plaka/Müşteri Adı'ndan en az biri zorunlu
  // olur (bkz. POST/PUT /api/orders).
  plate_required: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  business_name: "Lastik Servis Yönetim Sistemi",
  storage_overdue_months: 6,
  payment_types: ["Nakit", "POS", "Cari", "Fatura Edildi.", "Havale/EFT", "Mail Order"],
  booking_capacity: 1,
  booking_working_hours: null,
  booking_auto_approve: false,
  booking_max_days_ahead: 30,
  booking_widget_preset: "card",
  booking_widget_accent_color: "#2563eb",
  booking_widget_columns_tablet: 1,
  booking_widget_columns_desktop: 1,
  booking_widget_title: null,
  booking_widget_description: null,
  booking_widget_show_heading_embed: false,
  booking_widget_radius: "lg",
  booking_widget_density: "normal",
  booking_widget_heading_size: "md",
  auto_register_customers: true,
  orders_default_date_filter: "",
  whatsapp_enabled: false,
  whatsapp_access_token: null,
  whatsapp_phone_number_id: null,
  whatsapp_business_account_id: null,
  whatsapp_template_name: null,
  shared_stock_enabled: false,
  custom_order_no_enabled: false,
  plate_required: true,
};

export async function getAppSettings(tenantId: number): Promise<AppSettings> {
  const result = await pool.query<AppSettings>(
    `SELECT business_name, storage_overdue_months, payment_types,
            booking_capacity, booking_working_hours, booking_auto_approve, booking_max_days_ahead,
            booking_widget_preset, booking_widget_accent_color,
            booking_widget_columns_tablet, booking_widget_columns_desktop,
            booking_widget_title, booking_widget_description, booking_widget_show_heading_embed,
            booking_widget_radius, booking_widget_density, booking_widget_heading_size,
            auto_register_customers, orders_default_date_filter, whatsapp_enabled, whatsapp_access_token,
            whatsapp_phone_number_id, whatsapp_business_account_id, whatsapp_template_name,
            shared_stock_enabled, custom_order_no_enabled, plate_required
     FROM app_settings WHERE tenant_id = $1`,
    [tenantId]
  );
  const settings = result.rows[0] ?? DEFAULT_SETTINGS;
  // Genel ödeme tipleri (bkz. src/lib/paymentTypes.ts) her zaman listede
  // bulunmalı — DB'deki değer bir şekilde eksik kalsa bile burada garanti edilir.
  return {
    ...settings,
    payment_types: Array.from(new Set([...PROTECTED_PAYMENT_TYPES, ...settings.payment_types])),
  };
}

// Sipariş oluşturma/düzenleme/içe aktarma ve randevu→sipariş dönüşümü gibi
// sık çağrılan yollarda, tüm ayarları (payment_types/working_hours dahil)
// çekmek yerine tek kolonluk ucuz bir sorgu — bkz. app_settings.
// auto_register_customers şemadaki yorum.
export async function getAutoRegisterCustomers(tenantId: number): Promise<boolean> {
  const result = await pool.query<{ auto_register_customers: boolean }>(
    "SELECT auto_register_customers FROM app_settings WHERE tenant_id = $1",
    [tenantId]
  );
  return result.rows[0]?.auto_register_customers ?? true;
}

// POST/PUT /api/orders'ın her istekte ihtiyaç duyduğu — Sipariş No'nun elle mi
// girileceği (custom_order_no zorunlu) yoksa otomatik mi (#id) kalacağı.
// getAutoRegisterCustomers ile aynı "tek kolonluk ucuz sorgu" deseni.
export async function getCustomOrderNoEnabled(tenantId: number): Promise<boolean> {
  const result = await pool.query<{ custom_order_no_enabled: boolean }>(
    "SELECT custom_order_no_enabled FROM app_settings WHERE tenant_id = $1",
    [tenantId]
  );
  return result.rows[0]?.custom_order_no_enabled ?? false;
}

// POST /api/orders'ın tek istekte ihtiyaç duyduğu üç ayarı (plate_required,
// custom_order_no_enabled, auto_register_customers) ayrı ayrı 3 round-trip
// yerine TEK sorguda çeker — üçü de aynı app_settings satırından okunuyor.
// Yukarıdaki tek kolonluk getCustomOrderNoEnabled/getAutoRegisterCustomers,
// sadece tek bir ayara ihtiyaç duyan başka çağıranlar (ör. randevu→sipariş
// dönüşümü, içe aktarma) için korunuyor.
export async function getOrderCreationSettings(
  tenantId: number
): Promise<{ plateRequired: boolean; customOrderNoEnabled: boolean; autoRegisterCustomers: boolean }> {
  const result = await pool.query<{
    plate_required: boolean;
    custom_order_no_enabled: boolean;
    auto_register_customers: boolean;
  }>(
    "SELECT plate_required, custom_order_no_enabled, auto_register_customers FROM app_settings WHERE tenant_id = $1",
    [tenantId]
  );
  const row = result.rows[0];
  return {
    plateRequired: row?.plate_required ?? true,
    customOrderNoEnabled: row?.custom_order_no_enabled ?? false,
    autoRegisterCustomers: row?.auto_register_customers ?? true,
  };
}

export interface SessionSettings {
  business_name: string;
  panel_logo_url: string | null;
  custom_order_no_enabled: boolean;
  plate_required: boolean;
  payment_types: string[];
  storage_overdue_months: number;
  orders_default_date_filter: OrdersDefaultDateFilter;
}

// /api/auth/me için — panel açılışında BİR KEZ çekilip istemcide store'da
// (src/app/admin/AuthContext.tsx) tutulan, sayfaların sık okuduğu ayarlar.
// Önceden /me bunları 4 ayrı sorguyla çekiyordu, sayfalar da (Siparişler,
// Sipariş Detayı, Müşteriler, Kasa, Giderler, Depolama) sadece ödeme
// tipleri/tek bir ayar için açılışta admin-only /api/settings'i (22 kolon +
// firma bilgisi, 2 sorgu) ayrıca çağırıyordu. Her sorgu ~1,5-2ms sabit
// Active CPU taşıdığından hepsi tek sorguda. Varsayılanlar ve korumalı ödeme
// tipleri getAppSettings ile birebir aynı.
export async function getSessionSettings(tenantId: number): Promise<SessionSettings> {
  const result = await pool.query<Omit<SessionSettings, "panel_logo_url"> & { panel_logo_url: string | null; has_settings: boolean }>(
    `SELECT t.panel_logo_url, a.tenant_id IS NOT NULL AS has_settings,
            a.business_name, a.custom_order_no_enabled, a.plate_required,
            a.payment_types, a.storage_overdue_months, a.orders_default_date_filter
     FROM tenants t LEFT JOIN app_settings a ON a.tenant_id = t.id
     WHERE t.id = $1`,
    [tenantId]
  );
  const row = result.rows[0];
  const s = row?.has_settings ? row : DEFAULT_SETTINGS;
  return {
    business_name: s.business_name ?? DEFAULT_SETTINGS.business_name,
    panel_logo_url: row?.panel_logo_url ?? null,
    custom_order_no_enabled: s.custom_order_no_enabled ?? DEFAULT_SETTINGS.custom_order_no_enabled,
    plate_required: s.plate_required ?? DEFAULT_SETTINGS.plate_required,
    payment_types: Array.from(new Set([...PROTECTED_PAYMENT_TYPES, ...(s.payment_types ?? DEFAULT_SETTINGS.payment_types)])),
    storage_overdue_months: s.storage_overdue_months ?? DEFAULT_SETTINGS.storage_overdue_months,
    orders_default_date_filter: s.orders_default_date_filter ?? DEFAULT_SETTINGS.orders_default_date_filter,
  };
}
