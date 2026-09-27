import webpush from "web-push";
import pool from "./db";

// Yeni randevu oluştuğunda (public form veya personelin elle girdiği) ilgili
// tenant'ın abone personeline tarayıcı push bildirimi gönderir — bkz.
// public/push-sw.js (bildirimi gösteren service worker) ve
// src/app/api/push/subscribe/route.ts (abonelik kaydı).
//
// setVapidDetails, boş/geçersiz bir public key ile SENKRON throw ediyor
// (web-push'un kendi validatePublicKey'i) — bu modül IMPORT edilir edilmez
// (yani appointments route'ları yüklenir yüklenmez) çalıştığından, VAPID
// ortam değişkenleri tanımlı değilse (ör. Vercel'e henüz eklenmediyse) bu
// çağrı, push'la hiç ilgisi olmayan randevu oluşturma route'unu bile
// tamamen çökertiyordu (canlıda gerçekten yaşandı). Anahtarlar yoksa hiç
// çağrılmıyor — notifyTenantAdmins zaten bu durumda no-op.
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:destek@ornek.com",
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
  } catch (err) {
    console.error("VAPID yapılandırma hatası — push bildirimleri devre dışı:", err);
  }
}

interface NotifyPayload {
  title: string;
  body: string;
  url?: string;
}

type PushSubscriptionRow = { id: number; endpoint: string; p256dh: string; auth: string };

// Ortak gönderim + süresi dolmuş aboneliği temizleme mantığı — notifyTenantAdmins,
// notifyTenantUsers ve notifySuperAdmins arasında tekrar etmesin diye. Hiçbir
// zaman throw etmez, tek tek her aboneliğin hatası diğerlerini etkilemez.
async function sendToSubscriptions(rows: PushSubscriptionRow[], payload: NotifyPayload): Promise<void> {
  await Promise.allSettled(
    rows.map(async (sub) => {
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
}

// Hiçbir zaman throw etmez — bu sadece bir bildirim, randevu kaydının
// başarısı buna bağlı olmamalı. Süresi dolmuş/geçersiz abonelikler (push
// servisi 404/410 döndürür) sessizce DB'den siliniyor.
export async function notifyTenantAdmins(tenantId: number, payload: NotifyPayload): Promise<void> {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;

  try {
    // Abonelik anında değil GÖNDERİM anında yetki kontrolü — bir kullanıcının
    // appointments.view izni sonradan alınır/hesabı pasifleştirilirse, ayrı
    // bir temizlik işine gerek kalmadan otomatik olarak bildirim almayı bırakır.
    const result = await pool.query<PushSubscriptionRow>(
      `SELECT ps.id, ps.endpoint, ps.p256dh, ps.auth
       FROM push_subscriptions ps
       JOIN users u ON u.id = ps.user_id
       WHERE ps.tenant_id = $1 AND u.is_active = true
         AND (u.role = 'admin' OR 'appointments.view' = ANY(u.permissions))`,
      [tenantId]
    );
    await sendToSubscriptions(result.rows, payload);
  } catch (err) {
    console.error("notifyTenantAdmins hatası:", err);
  }
}

// notifyTenantAdmins'ten farkı: rol/izin filtresi yok — o tenant'ın aktif
// HERHANGİ bir kullanıcısına gider. Destek Talepleri gibi hiçbir kaynak
// iznine bağlı olmayan (bkz. src/lib/permissions.ts PAGE_RESOURCE'ta
// resource: null) özellikler için — talebi kim açtıysa (Yönetici ya da
// Personel) cevap geldiğinde haberdar olmalı, sadece admin değil.
export async function notifyTenantUsers(tenantId: number, payload: NotifyPayload): Promise<void> {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;

  try {
    const result = await pool.query<PushSubscriptionRow>(
      `SELECT ps.id, ps.endpoint, ps.p256dh, ps.auth
       FROM push_subscriptions ps
       JOIN users u ON u.id = ps.user_id
       WHERE ps.tenant_id = $1 AND u.is_active = true`,
      [tenantId]
    );
    await sendToSubscriptions(result.rows, payload);
  } catch (err) {
    console.error("notifyTenantUsers hatası:", err);
  }
}

// Süper admin(ler)e gider — tenant_id'ye göre değil role='super_admin'e göre
// filtreler (süper admin hesabı kendi dahili "Platform" tenant'ına bağlıdır,
// bkz. tenants.is_platform yorumu). Destek Talepleri'nde yeni bir talep
// açıldığında kullanılır.
export async function notifySuperAdmins(payload: NotifyPayload): Promise<void> {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;

  try {
    const result = await pool.query<PushSubscriptionRow>(
      `SELECT ps.id, ps.endpoint, ps.p256dh, ps.auth
       FROM push_subscriptions ps
       JOIN users u ON u.id = ps.user_id
       WHERE u.role = 'super_admin' AND u.is_active = true`
    );
    await sendToSubscriptions(result.rows, payload);
  } catch (err) {
    console.error("notifySuperAdmins hatası:", err);
  }
}
