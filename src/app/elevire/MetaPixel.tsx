"use client";

import { useEffect, useState } from "react";

// Meta (Instagram/Facebook) reklamlarından gelen ziyaretçinin kayıt butonuna
// tıklayıp tıklamadığını ölçmek için Meta Pixel. KVKK gereği pixel YALNIZCA
// ziyaretçi çerez bandında açıkça "Kabul Et" derse yüklenir — reddederse ya
// da hiç seçmezse Meta'ya hiçbir istek gitmez (bkz. gizlilik sözleşmesi
// Madde 6). NEXT_PUBLIC_META_PIXEL_ID tanımlı değilse (yerel geliştirme)
// bileşen hiçbir şey yapmaz.
//
// Olaylar:
//   PageView              — landing ve /kayit açılışı
//   KayitButonuTiklandi   — landing'de data-cta taşıyan bir /kayit linkine
//                           tıklama, { konum: "nav" | "fiyat-aylik" | ... }
//   CompleteRegistration  — /kayit formu başarıyla tamamlandı
//   Contact               — landing'deki sabit WhatsApp butonu (data-contact),
//                           { kanal: "whatsapp" }; yeni sekmede açıldığı için
//                           beklemeden gönderilir

const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;
const CONSENT_KEY = "elevire_ad_consent"; // "granted" | "denied"
// Olay isteği başlatılıp sayfa değişmeden önce gönderilebilsin diye
// yönlendirmeden önce beklenen süre — yoksa tarayıcı isteği iptal edebiliyor.
const FLUSH_MS = 300;

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[][];
  push: Fbq;
  loaded: boolean;
  version: string;
};

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

function readConsent(): string | null {
  try {
    return localStorage.getItem(CONSENT_KEY);
  } catch {
    return null;
  }
}

function writeConsent(value: "granted" | "denied") {
  try {
    localStorage.setItem(CONSENT_KEY, value);
  } catch {
    // Gizli sekme vb. — tercih bu oturumla sınırlı kalır.
  }
}

// Meta'nın resmi inline snippet'inin eşdeğeri (inline <script> yerine kodla).
function loadPixel(id: string) {
  if (window.fbq) return;
  const fbq = function (...args: unknown[]) {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue.push(args);
  } as Fbq;
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.queue = [];
  window.fbq = fbq;
  window._fbq = fbq;
  const script = document.createElement("script");
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(script);
  fbq("init", id);
  fbq("track", "PageView");
}

// Pixel yüklüyse olayı gönderir ve kısa bir süre bekler (ardından sayfa
// değişecekse kullanılır); yüklü değilse hemen döner.
export function trackMetaEvent(event: string, params?: Record<string, string>, custom = false): Promise<void> {
  if (!window.fbq) return Promise.resolve();
  window.fbq(custom ? "trackCustom" : "track", event, params);
  return new Promise((resolve) => setTimeout(resolve, FLUSH_MS));
}

export default function MetaPixel() {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    if (!PIXEL_ID) return;
    const consent = readConsent();
    if (consent === "granted") loadPixel(PIXEL_ID);
    else if (consent === null) setShowBanner(true);
  }, []);

  useEffect(() => {
    if (!PIXEL_ID) return;
    function onClick(e: MouseEvent) {
      if (!window.fbq) return;
      const contact = (e.target as Element | null)?.closest?.("a[data-contact]") as HTMLAnchorElement | null;
      if (contact) {
        void trackMetaEvent("Contact", { kanal: contact.dataset.contact ?? "" });
        return;
      }
      const link = (e.target as Element | null)?.closest?.("a[data-cta]") as HTMLAnchorElement | null;
      if (!link) return;
      const konum = link.dataset.cta ?? "";
      // Yeni sekmede açma (ctrl/cmd/orta tık) sayfayı terk etmez — beklemeye gerek yok.
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        void trackMetaEvent("KayitButonuTiklandi", { konum }, true);
        return;
      }
      e.preventDefault();
      void trackMetaEvent("KayitButonuTiklandi", { konum }, true).then(() => {
        window.location.href = link.href;
      });
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  if (!showBanner) return null;

  function choose(value: "granted" | "denied") {
    writeConsent(value);
    setShowBanner(false);
    if (value === "granted" && PIXEL_ID) loadPixel(PIXEL_ID);
  }

  return (
    <div
      role="dialog"
      aria-label="Çerez tercihi"
      className="fixed inset-x-0 bottom-0 z-[1000] p-4 flex justify-center pointer-events-none"
    >
      <div className="pointer-events-auto w-full max-w-2xl rounded-2xl bg-white text-gray-800 shadow-2xl border border-gray-200 p-4 sm:flex sm:items-center sm:gap-4 font-sans">
        <p className="text-sm leading-relaxed">
          Reklamlarımızın etkisini ölçmek için Meta (Facebook/Instagram) çerezlerini kullanmak istiyoruz. Ayrıntılar{" "}
          <a href="/elevire/legal/gizlilik" target="_blank" rel="noopener noreferrer" className="underline text-blue-600">
            Gizlilik Sözleşmesi
          </a>
          &apos;nde.
        </p>
        <div className="mt-3 sm:mt-0 flex gap-2 shrink-0">
          <button
            type="button"
            onClick={() => choose("denied")}
            className="flex-1 sm:flex-none rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold hover:bg-gray-50"
          >
            Reddet
          </button>
          <button
            type="button"
            onClick={() => choose("granted")}
            className="flex-1 sm:flex-none rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
          >
            Kabul Et
          </button>
        </div>
      </div>
    </div>
  );
}

// Gizlilik sayfasında rızayı geri almak için: tercihi siler, bant yeniden çıkar.
export function ConsentResetButton() {
  return (
    <button
      type="button"
      onClick={() => {
        try {
          localStorage.removeItem(CONSENT_KEY);
        } catch {
          // yok say
        }
        // Pixel'in koyduğu çerezler: hem bu host'ta hem üst alan adında
        // (ör. .yeyu.co) olabilir — ikisini de sil.
        const parts = location.hostname.split(".");
        const domains = ["", ...parts.map((_, i) => "." + parts.slice(i).join(".")).slice(0, -1)];
        for (const name of ["_fbp", "_fbc"]) {
          for (const d of domains) {
            document.cookie = `${name}=; max-age=0; path=/${d ? `; domain=${d}` : ""}`;
          }
        }
        alert("Çerez tercihiniz sıfırlandı. Ana sayfaya döndüğünüzde yeniden seçim yapabilirsiniz.");
      }}
      style={{ textDecoration: "underline", cursor: "pointer", background: "none", border: 0, padding: 0, color: "inherit", font: "inherit" }}
    >
      çerez tercihimi sıfırla
    </button>
  );
}
