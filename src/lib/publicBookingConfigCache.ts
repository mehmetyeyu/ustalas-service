import pool from "./db";
import type { WorkingHours } from "./appointmentSlots";

// Kimlik doğrulamasız /randevu/[slug] widget'ının en yoğun trafik alan iki
// route'u (meta, slots) — her widget yüklemesinde ve her tarih değişiminde bu
// tabloya gidiyordu. Buradaki alanlar (çalışma saatleri, kapasite, görünüm
// stili vb.) admin panelinden ayarlar sayfası kaydedilmedikçe değişmez, bu
// yüzden kısa bir TTL ile önbelleğe alınıyor. Serverless ortamda bu cache
// tek bir "sıcak" fonksiyon instance'ı ömrü boyunca geçerli — cold start'ta
// veya farklı bir instance'ta otomatik sıfırlanır, bu yüzden bir tutarlılık
// katmanı değil, sadece bir yük azaltma optimizasyonu.
//
// booking_auto_approve BİLEREK burada YOK — bir randevunun otomatik onaylanıp
// onaylanmayacağını belirliyor, admin kapattığında anında etkili olmalı,
// stale bir "true" değeri istenmeyen bir otomatik onaya yol açabilir. O alan
// public POST route'unda hâlâ canlı okunuyor.
export interface CachedBookingConfigRow {
  booking_capacity: number;
  booking_working_hours: WorkingHours | null;
  booking_max_days_ahead: number;
  booking_widget_preset: string;
  booking_widget_accent_color: string;
  booking_widget_columns_tablet: number;
  booking_widget_columns_desktop: number;
  booking_widget_title: string | null;
  booking_widget_description: string | null;
  booking_widget_show_heading_embed: boolean;
  booking_widget_radius: string;
  booking_widget_density: string;
  booking_widget_heading_size: string;
}

const TTL_MS = 60_000;
const cache = new Map<number, { row: CachedBookingConfigRow | undefined; expiresAt: number }>();

export async function getCachedBookingConfigRow(tenantId: number): Promise<CachedBookingConfigRow | undefined> {
  const hit = cache.get(tenantId);
  if (hit && hit.expiresAt > Date.now()) return hit.row;

  const result = await pool.query<CachedBookingConfigRow>(
    `SELECT booking_capacity, booking_working_hours, booking_max_days_ahead,
            booking_widget_preset, booking_widget_accent_color,
            booking_widget_columns_tablet, booking_widget_columns_desktop,
            booking_widget_title, booking_widget_description, booking_widget_show_heading_embed,
            booking_widget_radius, booking_widget_density, booking_widget_heading_size
     FROM app_settings WHERE tenant_id = $1`,
    [tenantId]
  );
  const row = result.rows[0];
  cache.set(tenantId, { row, expiresAt: Date.now() + TTL_MS });
  return row;
}

// PUT /api/settings tarafından, bir kaydetme sonrası aynı instance içinde
// bayat veri sunulmasın diye çağrılır. Farklı instance'lardaki cache'leri
// temizleyemez (TTL zaten en fazla 60 sn içinde onları da tazeler).
export function invalidateBookingConfigCache(tenantId: number): void {
  cache.delete(tenantId);
}
