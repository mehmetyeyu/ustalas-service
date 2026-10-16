"use client";

import { useEffect } from "react";
import { UI_PREF_STORAGE_KEY } from "./uiThemeBoot";

// Panel görünümünü (v1/v2) ve v2'nin temasını <html> üzerindeki
// data-ui / data-theme özniteliklerine uygular — renkler src/app/globals.css'te
// bu özniteliklere bağlı CSS değişkenleri. Asıl kaynak kullanıcının sunucuda
// saklanan tercihi (/api/auth/me → ui_version, ui_theme); localStorage'daki
// kopya yalnızca sayfa açılırken (tercih sunucudan gelmeden önce) renk
// sıçramasını önlemek için kök layout'taki küçük script tarafından okunur.
export type UiVersion = "v1" | "v2";
export type UiTheme = "system" | "light" | "dark";


function prefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches === true;
}

export function applyUi(version: UiVersion, theme: UiTheme): void {
  const el = document.documentElement;
  if (version === "v2") {
    el.dataset.ui = "v2";
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
    if (version !== "v2" || theme !== "system" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyUi(version, theme);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [version, theme]);

  useEffect(() => () => clearUi(), []);
}
