import webpush from "web-push";
import pool from "./db";

// Yeni randevu oluştuğunda (public form veya personelin elle girdiği) ilgili
// tenant'ın abone personeline tarayıcı push bildirimi gönderir — bkz.
// public/push-sw.js (bildirimi gösteren service worker) ve
// src/app/api/push/subscribe/route.ts (abonelik kaydı).
webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || "mailto:destek@ornek.com",
  process.env.VAPID_PUBLIC_KEY || "",
  process.env.VAPID_PRIVATE_KEY || ""
);

interface NotifyPayload {
  title: string;
  body: string;
  url?: string;
}

// Hiçbir zaman throw etmez — bu sadece bir bildirim, randevu kaydının
// başarısı buna bağlı olmamalı. Süresi dolmuş/geçersiz abonelikler (push
// servisi 404/410 döndürür) sessizce DB'den siliniyor.
export async function notifyTenantAdmins(tenantId: number, payload: NotifyPayload): Promise<void> {
  if (!process.env.VAPID_PRIVATE_KEY) return;

  try {
    // Abonelik anında değil GÖNDERİM anında yetki kontrolü — bir kullanıcının
    // appointments.view izni sonradan alınır/hesabı pasifleştirilirse, ayrı
    // bir temizlik işine gerek kalmadan otomatik olarak bildirim almayı bırakır.
    const result = await pool.query<{ id: number; endpoint: string; p256dh: string; auth: string }>(
      `SELECT ps.id, ps.endpoint, ps.p256dh, ps.auth
       FROM push_subscriptions ps
       JOIN users u ON u.id = ps.user_id
       WHERE ps.tenant_id = $1 AND u.is_active = true
         AND (u.role = 'admin' OR 'appointments.view' = ANY(u.permissions))`,
      [tenantId]
    );

    await Promise.allSettled(
      result.rows.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify(payload)
          );
        } catch (err: unknown) {
          const statusCode = (err as { statusCode?: number })?.statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await pool.query("DELETE FROM push_subscriptions WHERE id = $1", [sub.id]);
          } else {
            console.error("push gönderim hatası:", err);
          }
        }
      })
    );
  } catch (err) {
    console.error("notifyTenantAdmins hatası:", err);
  }
}
