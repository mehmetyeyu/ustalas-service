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

// checking: ilk yükleniş, henüz destek/abonelik durumu bilinmiyor.
// unsupported: tarayıcı Push API'yi desteklemiyor (bileşen hiç gösterilmez).
// denied: kullanıcı bildirim iznini reddetmiş — tarayıcı bir daha sormaz,
// yalnızca tarayıcının kendi site ayarlarından elle açılabilir.
type Status = "checking" | "unsupported" | "denied" | "subscribed" | "unsubscribed";

function Switch({ checked, disabled, onClick }: { checked: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onClick}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
        checked ? "bg-blue-600" : "bg-gray-300"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

// Panelde yeni randevu geldiğinde (sekme kapalı/arka plandayken bile) tarayıcı
// bildirimi — n11/Trendyol'daki kampanya bildirimleriyle aynı mekanizma (Web
// Push API), PWA/telefon bildirimi DEĞİL. Genel Ayarlar'a konuldu (bu sayfa
// zaten admin-only — bkz. src/lib/permissions.ts) — sadece admin kullanıcının
// KENDİ tarayıcısı/cihazı için abonelik.
export function PushNotificationToggle() {
  const [status, setStatus] = useState<Status>("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
    setError("");
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
      setError(err instanceof Error ? err.message : "Hata oluştu.");
      setStatus("unsubscribed");
    } finally {
      setBusy(false);
    }
  }

  async function handleUnsubscribe() {
    setBusy(true);
    setError("");
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

  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="text-sm font-medium text-gray-700">Randevu Bildirimleri</div>
        <p className="text-xs text-gray-400 mt-0.5">
          {status === "denied"
            ? "Tarayıcınız bu site için bildirimleri engellemiş — tarayıcı site ayarlarından elle açmanız gerekiyor."
            : "Yeni randevu geldiğinde bu tarayıcıya bildirim gönderilsin (sadece bu cihaz için geçerli)."}
        </p>
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      </div>
      <Switch
        checked={status === "subscribed"}
        disabled={busy || status === "denied"}
        onClick={status === "subscribed" ? handleUnsubscribe : handleSubscribe}
      />
    </div>
  );
}
