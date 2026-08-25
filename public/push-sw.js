/*
 * Web Push service worker — yeni bir randevu geldiğinde (public form veya
 * personelin elle girdiği) panel sekmesi kapalı/arka plandayken bile tarayıcı
 * bildirimi gösterir. Offline önbellekleme / PWA manifest YOK — sadece push
 * olayını dinleyip bildirim gösteren minimal bir worker.
 *
 * Kayıt: src/app/admin/PushNotificationButton.tsx (navigator.serviceWorker.register).
 * Gönderim: src/lib/push.ts (webpush.sendNotification, sunucu tarafı).
 */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    /* JSON değilse boş bildirim göster, worker'ı çökertme */
  }
  const title = data.title || "Yeni Randevu";
  const url = data.url || "/admin/appointments";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/logo.jpg",
      badge: "/logo.jpg",
      data: { url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url ? event.notification.data.url : "/admin/appointments";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const existing = list.find((c) => c.url.includes(url));
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    })
  );
});
