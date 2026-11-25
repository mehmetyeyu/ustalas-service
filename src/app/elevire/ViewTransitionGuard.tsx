"use client";

import { useEffect } from "react";

// Bu sayfalar @view-transition ile yumuşak geçiş ister (styles.ts), panel
// istemez. Girişten/kayıttan panele geçerken geçiş burada baştan atlanır —
// yoksa tarayıcı onu panelde iptal edip "ViewTransition opt-in disabled"
// reddini yakalanmamış hata olarak (her girişte, Sentry'ye) düşürüyordu.
interface SwapEvent extends Event {
  viewTransition?: { ready: Promise<void>; finished: Promise<void>; skipTransition(): void } | null;
  activation?: { entry?: { url?: string | null } | null } | null;
}

const THEMED = /^\/(elevire(\/|$)|kayit$|admin\/login$)/;

export default function ViewTransitionGuard() {
  useEffect(() => {
    function onSwap(e: Event) {
      const { viewTransition: vt, activation } = e as SwapEvent;
      if (!vt) return;
      vt.ready.catch(() => {});
      vt.finished.catch(() => {});
      const url = activation?.entry?.url;
      if (!url || !THEMED.test(new URL(url).pathname)) vt.skipTransition();
    }
    window.addEventListener("pageswap", onSwap);
    return () => window.removeEventListener("pageswap", onSwap);
  }, []);
  return null;
}
