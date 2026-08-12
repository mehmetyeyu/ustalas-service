import pool from "@/lib/db";
import { PROTECTED_PAYMENT_TYPES } from "@/lib/paymentTypes";

export interface AppSettings {
  business_name: string;
  storage_overdue_months: number;
  payment_types: string[];
}

const DEFAULT_SETTINGS: AppSettings = {
  business_name: "Lastik Servis Yönetim Sistemi",
  storage_overdue_months: 6,
  payment_types: ["Nakit", "POS", "Cari", "Fatura Edildi.", "Garanti Hesap", "Nazım Hesap", "Sait Hesap", "Mail Order"],
};

export async function getAppSettings(): Promise<AppSettings> {
  const result = await pool.query<AppSettings>(
    "SELECT business_name, storage_overdue_months, payment_types FROM app_settings WHERE id = 1"
  );
  const settings = result.rows[0] ?? DEFAULT_SETTINGS;
  // Genel ödeme tipleri (bkz. src/lib/paymentTypes.ts) her zaman listede
  // bulunmalı — DB'deki değer bir şekilde eksik kalsa bile burada garanti edilir.
  return {
    ...settings,
    payment_types: Array.from(new Set([...PROTECTED_PAYMENT_TYPES, ...settings.payment_types])),
  };
}
