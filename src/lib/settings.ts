import pool from "@/lib/db";
import { PROTECTED_PAYMENT_TYPES } from "@/lib/paymentTypes";

export type BookingWidgetPreset = "card" | "seamless" | "outlined";
// Mobil her zaman tek kolon (ayarlanamaz) — tablet 1-2, masaüstü 1-3 kolon
// arasında seçilebilir (bkz. Hizmet/Tarih/Müsait Saatler'in üç bağımsız grid
// öğesi olduğu src/app/randevu/[slug]/page.tsx).
export type BookingWidgetColumnsTablet = 1 | 2;
export type BookingWidgetColumnsDesktop = 1 | 2 | 3;

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
};

export async function getAppSettings(tenantId: number): Promise<AppSettings> {
  const result = await pool.query<AppSettings>(
    `SELECT business_name, storage_overdue_months, payment_types,
            booking_capacity, booking_working_hours, booking_auto_approve, booking_max_days_ahead,
            booking_widget_preset, booking_widget_accent_color,
            booking_widget_columns_tablet, booking_widget_columns_desktop,
            booking_widget_title, booking_widget_description, booking_widget_show_heading_embed
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
