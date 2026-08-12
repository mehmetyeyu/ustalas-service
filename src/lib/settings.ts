import pool from "@/lib/db";

export interface AppSettings {
  business_name: string;
  storage_overdue_months: number;
}

const DEFAULT_SETTINGS: AppSettings = {
  business_name: "Lastik Servis Yönetim Sistemi",
  storage_overdue_months: 6,
};

export async function getAppSettings(): Promise<AppSettings> {
  const result = await pool.query<AppSettings>(
    "SELECT business_name, storage_overdue_months FROM app_settings WHERE id = 1"
  );
  return result.rows[0] ?? DEFAULT_SETTINGS;
}
