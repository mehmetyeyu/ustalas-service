"use client";

import { useEffect, useState } from "react";

// Push API'nin beklediği Uint8Array formatı — VAPID public key'i base64url
// string olarak env'den geliyor, pushManager.subscribe bunu byte dizisi ister.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from(Array.from(rawData).map((c) => c.charCodeAt(0)));
}

type Status = "checking" | "unsupported" | "denied" | "subscribed" | "unsubscribed";

// Panelde yeni randevu geldiğinde (sekme kapalı/arka plandayken bile) tarayıcı
// bildirimi — n11/Trendyol'daki kampanya bildirimleriyle aynı mekanizma
// (Web Push API), PWA/telefon bildirimi DEĞİL. Sadece admin/layout.tsx'te,
// appointments.view yetkisi olan kullanıcılara gösterilir (bkz. orada aynı
// koşulla yapılan bekleyen-randevu rozeti sorgusu).
export function PushNotificationButton() {
  const [status, setStatus] = useState<Status>("checking");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }
    navigator.serviceWorker.getRegistration("/push-sw.js").then(async (reg) => {
      const sub = await reg?.pushManager.getSubscription();
      setStatus(sub ? "subscribed" : "unsubscribed");
    });
  }, []);

  async function handleSubscribe() {
    setBusy(true);
    try {
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) throw new Error("Bildirimler bu ortamda yapılandırılmamış.");

      await navigator.serviceWorker.register("/push-sw.js");
      // register() sadece kaydı BAŞLATIR — worker "installing"/"waiting"
      // aşamasında olabilir. pushManager.subscribe() AKTİF bir worker ister,
      // aksi halde "no active Service Worker" hatasıyla başarısız olur.
      // .ready, worker gerçekten aktif olana kadar bekler.
      const registration = await navigator.serviceWorker.ready;
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "unsubscribed");
        return;
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!res.ok) throw new Error("Abonelik kaydedilemedi.");
      setStatus("subscribed");
    } catch (err) {
      console.error(err);
      setStatus("unsubscribed");
    } finally {
      setBusy(false);
    }
  }

  async function handleUnsubscribe() {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration("/push-sw.js");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setStatus("unsubscribed");
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(false);
    }
  }

  if (status === "checking" || status === "unsupported") return null;

  if (status === "denied") {
    return (
      <span className="text-xs text-gray-500" title="Tarayıcı ayarlarından bu site için bildirim izni vermeniz gerekiyor.">
        Bildirimler engellendi
      </span>
    );
  }

  if (status === "subscribed") {
    return (
      <button
        onClick={handleUnsubscribe}
        disabled={busy}
        className="text-xs text-gray-400 hover:text-white transition-colors disabled:opacity-50"
        title="Yeni randevu bildirimlerini kapat"
      >
        🔔 Bildirimler Açık
      </button>
    );
  }

  return (
    <button
      onClick={handleSubscribe}
      disabled={busy}
      className="text-xs text-gray-400 hover:text-white transition-colors disabled:opacity-50"
      title="Yeni randevu geldiğinde tarayıcı bildirimi al"
    >
      🔕 Bildirimleri Aç
    </button>
  );
}
