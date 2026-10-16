"use client";

import { useCallback, useEffect, useRef } from "react";

// Panel sayfalarındaki pencereler (Yeni/Düzenle/Filtrele/Ödeme Al…) her
// sayfada elle yazılmış `fixed inset-0` katmanlar — klavyeyle kullanım için
// ortak davranışı tek yerde toplar. Pencere katmanına callback ref olarak
// verilir (koşullu render'la birlikte çalışır, hook her zaman çağrılır):
//
//   const filterDialog = useDialog(() => setShowFilter(false));
//   {showFilter && <div ref={filterDialog} role="dialog" aria-modal="true" className="fixed inset-0 …">…</div>}
//
// - Escape yalnızca EN ÜSTTEKİ pencereyi kapatır (iç içe pencerelerde arkadaki
//   de kapanmasın). Üstte bir onay penceresi (ConfirmProvider, role=alertdialog)
//   açıksa Escape onundur, bu pencereye dokunulmaz.
// - Açılınca odak pencereye taşınır (ilk alana değil — mobilde klavye
//   kendiliğinden açılmasın); Tab/Shift+Tab pencere içinde döner; kapanınca
//   odak pencereyi açan butona geri döner.
// İş mantığı yok — kapatma, sayfanın verdiği onClose ile (İptal butonuyla
// aynı yol) yapılır.

const stack: HTMLElement[] = [];

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useDialog(onClose: () => void) {
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });
  const cleanupRef = useRef<(() => void) | null>(null);

  // Sayfa kapanırken pencere açık kaldıysa dinleyici sızmasın.
  useEffect(() => () => { cleanupRef.current?.(); }, []);

  return useCallback((node: HTMLElement | null) => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    if (!node) return;

    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    stack.push(node);
    if (!node.hasAttribute("tabindex")) node.setAttribute("tabindex", "-1");
    node.style.outline = "none";
    // Sayfa kendi alanına autoFocus verdiyse ona dokunma.
    if (!node.contains(document.activeElement)) node.focus({ preventScroll: true });

    function onKeyDown(e: KeyboardEvent) {
      if (stack[stack.length - 1] !== node) return;
      if (e.key === "Escape") {
        if (e.defaultPrevented || document.querySelector('[role="alertdialog"]')) return;
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !node) return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (items.length === 0) { e.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === node || !node.contains(active))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (active === last || !node.contains(active))) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKeyDown);

    cleanupRef.current = () => {
      document.removeEventListener("keydown", onKeyDown);
      const i = stack.lastIndexOf(node);
      if (i !== -1) stack.splice(i, 1);
      // Odak pencere içindeyken kapandıysa (ya da body'ye düştüyse) açan
      // butona geri dön — o buton hâlâ sayfadaysa.
      if (opener && opener.isConnected && (!document.activeElement || document.activeElement === document.body || node.contains(document.activeElement))) {
        opener.focus({ preventScroll: true });
      }
    };
  }, []);
}
