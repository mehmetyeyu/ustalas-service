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

const TOAST_STYLES: Record<ToastType, string> = {
  success: "bg-green-50 border-green-200 text-green-700",
  warning: "bg-amber-50 border-amber-300 text-amber-800",
  error: "bg-red-50 border-red-200 text-red-600",
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
            className={`pointer-events-auto flex items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg animate-toast-in ${TOAST_STYLES[t.type]}`}
          >
            <span className="flex-1">{t.message}</span>
            <button
              type="button"
              onClick={() => remove(t.id)}
              className="shrink-0 leading-none opacity-60 hover:opacity-100"
              aria-label="Kapat"
            >
              ×
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
