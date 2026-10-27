"use client";

import { useEffect, useSyncExternalStore } from "react";
import { clearShellCache } from "./shellCache";
import { UI_PREF_COOKIE, UI_PREF_STORAGE_KEY } from "./uiThemeBoot";
import type { UiVersion } from "./uiVersion";

// Panel görünümünü (sürüm, bkz. src/lib/uiVersion.ts) ve temasını <html> üzerindeki
// data-ui / data-theme özniteliklerine uygular — renkler src/app/globals.css'te
// bu özniteliklere bağlı CSS değişkenleri. Asıl kaynak kullanıcının sunucuda
// saklanan tercihi (/api/auth/me → ui_version, ui_theme); localStorage'daki
// kopya yalnızca sayfa açılırken (tercih sunucudan gelmeden önce) renk
// sıçramasını önlemek için kök layout'taki küçük script tarafından okunur.
export type { UiVersion };
export type UiTheme = "system" | "light" | "dark";


function prefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches === true;
}

export function applyUi(version: UiVersion, theme: UiTheme): void {
  const el = document.documentElement;
  // Emekli v1 dışındaki her sürüm kendi adıyla işaretlenir (CSS
  // html[data-ui="v2"] … seçicilerine bağlı).
  if (version !== "v1") {
    el.dataset.ui = version;
    el.dataset.theme = theme === "system" ? (prefersDark() ? "dark" : "light") : theme;
  } else {
    delete el.dataset.ui;
    delete el.dataset.theme;
  }
  try {
    localStorage.setItem(UI_PREF_STORAGE_KEY, JSON.stringify({ v: version, t: theme }));
  } catch {
    // localStorage kapalı olabilir — sadece açılıştaki sıçrama önlemi kaybolur.
  }
}

// Çıkışta: tarayıcıda kalan tercih kopyası bir sonraki ziyaretçiye/oturumsuz
// sayfalara (açılış betiği) taşınmasın.
export function forgetUiPref(): void {
  clearUi();
  try {
    localStorage.removeItem(UI_PREF_STORAGE_KEY);
  } catch {
    // localStorage kapalı olabilir — kaydı zaten yoktur.
  }
  // Çıkış rotası da siler; yanıt gelmeden yönlenilirse diye istemcide de.
  document.cookie = `${UI_PREF_COOKIE}=; Max-Age=0; path=/`;
  clearShellCache();
}

// Açılış betiğinin (uiThemeBoot.ts — çerezden) <html>'e koyduğu yeni görünüm
// işareti. Kullanıcı tercihi (/api/auth/me) gelene kadar çerçeve buna göre
// çizilir; cevabı beklemeye gerek kalmaz. Sunucu çıktısında her zaman false
// (sunucu çerezi okumaz — sayfalar statik kalsın, Vercel CPU'su artmasın);
// tarayıcı devralınca hemen gerçek değerle yeniden çizilir, hidrasyon
// uyuşmazlığı olmaz.
const noopSubscribe = () => () => {};
export function useBootUiV2(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => document.documentElement.dataset.ui === "v2",
    () => false,
  );
}

export function clearUi(): void {
  const el = document.documentElement;
  delete el.dataset.ui;
  delete el.dataset.theme;
}

// Panel (admin layout) yaşadığı sürece tercihi uygular; "Sistem" seçiliyken
// cihazın açık/koyu değişimini canlı takip eder. Panelden çıkınca (giriş
// ekranı, sipariş formu gibi henüz v2'ye geçmemiş sayfalar) özniteliklerini
// temizler.
export function useApplyUi(version: UiVersion | null, theme: UiTheme): void {
  useEffect(() => {
    if (!version) return;
    applyUi(version, theme);
    if (version === "v1" || theme !== "system" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyUi(version, theme);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [version, theme]);

  useEffect(() => () => clearUi(), []);
}
