"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

type ToastType = "success" | "error" | "warning";

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

// Hata mesajları başarı/uyarıdan biraz daha uzun kalır — okuyup anlamak için
// daha fazla zaman gerekebilir.
const DURATIONS: Record<ToastType, number> = { success: 3500, warning: 5000, error: 6000 };

// Opak yüzey kartı + türe göre renkli ikon (iki görünümde ve açık/koyu
// temada aynı; renkler --v2-* değişkenleri). Eskiden açık pastel zemin
// kullanılıyordu — koyu temada yarı saydam kalıp arkasındaki içerik
// yazının içinden görünüyordu.
const TOAST_TONES: Record<ToastType, { badge: string; accent: string; icon: string }> = {
  success: { badge: "bg-v2-success-bg text-v2-success-fg", accent: "before:bg-v2-success-fg", icon: "M5 12.5l4.5 4.5L19 7.5" },
  warning: { badge: "bg-v2-warning-bg text-v2-warning-fg", accent: "before:bg-v2-warning-fg", icon: "M12 8v5M12 16.5v.01" },
  error: { badge: "bg-v2-danger-bg text-v2-danger-fg", accent: "before:bg-v2-danger-fg", icon: "M8 8l8 8M16 8l-8 8" },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (type: ToastType, message: string) => {
      const id = ++idRef.current;
      setToasts((prev) => [...prev, { id, type, message }]);
      setTimeout(() => remove(id), DURATIONS[type]);
    },
    [remove]
  );

  // Referans olarak sabit tutulur (push değişmedikçe) — aksi halde her
  // render'da yeni bir obje/fonksiyon üretilir, useToast() kullanan
  // bileşenlerin useEffect bağımlılık dizilerine `toast` eklenmesi güvenli
  // olmaz (her render'da efekt yeniden tetiklenir).
  const value: ToastContextValue = useMemo(
    () => ({
      success: (m: string) => push("success", m),
      error: (m: string) => push("error", m),
      warning: (m: string) => push("warning", m),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* pointer-events-none on the wrapper: boş alan tıklamaları engellemesin,
          her toast kendi pointer-events-auto ile kapat butonunu tıklanabilir kılar. */}
      <div className="fixed top-4 inset-x-4 sm:inset-x-auto sm:right-4 z-[100] flex flex-col gap-2 sm:w-96 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="alert"
            className={`pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-xl border border-v2-line bg-v2-surface py-3 pl-4 pr-3 text-sm text-v2-fg shadow-xl animate-toast-in before:absolute before:inset-y-0 before:left-0 before:w-1 ${TOAST_TONES[t.type].accent}`}
          >
            <span aria-hidden="true" className={`mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${TOAST_TONES[t.type].badge}`}>
              <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d={TOAST_TONES[t.type].icon} /></svg>
            </span>
            <span className="flex-1 leading-5">{t.message}</span>
            <button
              type="button"
              onClick={() => remove(t.id)}
              className="-mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-v2-fg-subtle hover:bg-v2-muted hover:text-v2-fg"
              aria-label="Kapat"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast, ToastProvider içinde kullanılmalı.");
  return ctx;
}
