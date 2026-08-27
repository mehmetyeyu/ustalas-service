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
  whatsapp_enabled: boolean;
  whatsapp_access_token: string | null;
  whatsapp_phone_number_id: string | null;
  whatsapp_business_account_id: string | null;
  whatsapp_template_name: string | null;
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
  whatsapp_enabled: false,
  whatsapp_access_token: null,
  whatsapp_phone_number_id: null,
  whatsapp_business_account_id: null,
  whatsapp_template_name: null,
};

export async function getAppSettings(tenantId: number): Promise<AppSettings> {
  const result = await pool.query<AppSettings>(
    `SELECT business_name, storage_overdue_months, payment_types,
            booking_capacity, booking_working_hours, booking_auto_approve, booking_max_days_ahead,
            booking_widget_preset, booking_widget_accent_color,
            booking_widget_columns_tablet, booking_widget_columns_desktop,
            booking_widget_title, booking_widget_description, booking_widget_show_heading_embed,
            booking_widget_radius, booking_widget_density, booking_widget_heading_size,
            auto_register_customers, whatsapp_enabled, whatsapp_access_token,
            whatsapp_phone_number_id, whatsapp_business_account_id, whatsapp_template_name
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
