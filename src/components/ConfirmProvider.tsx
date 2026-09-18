"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export interface ConfirmOptions {
  message: string;
  title?: string;
  confirmText?: string;
  cancelText?: string;
  // "danger": silme/iptal gibi geri alınması zor eylemler için kırmızı onay
  // butonu. Varsayılan odak her zaman Vazgeç'te kalır — native confirm()'de
  // Enter'ın yanlışlıkla OK'i tetiklemesi alışkanlığını buraya taşımamak için.
  variant?: "default" | "danger";
}

type ConfirmFn = (options: ConfirmOptions | string) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

interface PendingConfirm extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    const opts = typeof options === "string" ? { message: options } : options;
    return new Promise<boolean>((resolve) => {
      setPending({ ...opts, resolve });
    });
  }, []);

  const close = useCallback((result: boolean) => {
    setPending((current) => {
      current?.resolve(result);
      return null;
    });
  }, []);

  useEffect(() => {
    if (!pending) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [pending, close]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        // Arka plana tıklamak da Vazgeç sayılır (backdrop), diyalog içi
        // tıklamalar stopPropagation ile bunu engeller.
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 px-4"
          onClick={() => close(false)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {pending.title && <h2 className="text-base font-semibold text-gray-800 mb-2">{pending.title}</h2>}
            <p className="text-sm text-gray-600 whitespace-pre-line">{pending.message}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                autoFocus
                onClick={() => close(false)}
                className="px-4 py-2 text-sm font-medium text-gray-600 rounded-lg hover:bg-gray-100"
              >
                {pending.cancelText ?? "Vazgeç"}
              </button>
              <button
                type="button"
                onClick={() => close(true)}
                className={`px-4 py-2 text-sm font-medium text-white rounded-lg ${
                  pending.variant === "danger" ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {pending.confirmText ?? "Onayla"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm, ConfirmProvider içinde kullanılmalı.");
  return ctx;
}
