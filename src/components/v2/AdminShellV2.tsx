"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { UiTheme } from "@/lib/uiTheme";
import { NAV_ITEMS, SETTINGS_ITEMS } from "@/lib/adminNav";
import { useDialog } from "@/lib/useDialog";

// Yeni panel görünümünün (v2) çerçevesi: lacivert yan menü (V2Sidebar) ve
// üst çubuk (V2Header). Sayfa içeriği BURADA DEĞİL — admin/layout.tsx'te her
// iki görünümde de ağacın aynı yerinde (<main>) durur, sadece etrafındaki
// çerçeve değişir. Böylece tercih sunucudan gelip görünüm v1→v2 değiştiğinde
// sayfa baştan kurulmaz (verisini ikinci kez çekmez). Hangi menü öğelerinin
// görüneceği (yetki filtreleri) admin/layout.tsx'te hesaplanır, burada
// sadece çizilir. Renkler src/app/globals.css'teki v2 değişkenlerinden.
// admin/layout.tsx bu dosyayı next/dynamic ile yükler — eski görünümdeki
// kullanıcı bu kodu hiç indirmez.

export type ShellNavItem = { href: string; label: string; isNew?: boolean };

const ICONS: Record<string, string> = {
  "/admin/orders": "M9 4h6M9 4a1 1 0 0 0-1 1v1h8V5a1 1 0 0 0-1-1M8 6H6a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-2M9 12h6M9 16h4",
  "/admin/products": "M21 8 12 3 3 8v8l9 5 9-5V8ZM3 8l9 5 9-5M12 13v8",
  "/admin/storage": "M3 21V9l9-6 9 6v12M7 21v-8h10v8M7 17h10",
  "/admin/reports": "M4 20V10M10 20V4M16 20v-7M22 20H2",
  "/admin/kasa": "M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a1 1 0 0 1-1-1V7Zm0 0V6a2 2 0 0 1 2-2h10M16 13.5h.01",
  "/admin/expenses": "M6 3h12v18l-3-2-3 2-3-2-3 2V3ZM9 8h6M9 12h6",
  "/admin/services": "M14.7 6.3a4 4 0 0 0 5 5L22 14l-2 2-2.3-2.3a4 4 0 0 1-5-5L5 16.4V19h2.6l7.1-7.1",
  "/admin/customers": "M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM21 20v-1a4 4 0 0 0-3-3.87M16 4.13a3.5 3.5 0 0 1 0 6.75",
  "/admin/suppliers": "M3 6h11v10H3zM14 9h4l3 3v4h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
  "/admin/shared-stock": "M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM8.6 13.5l6.8 4M15.4 6.5l-6.8 4",
  "/admin/appointments": "M8 3v3M16 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z",
  "/admin/takvim": "M8 3v3M16 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1ZM8 13h3v3H8z",
};
const SETTINGS_ICON = "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1";

function Icon({ d, className = "h-[18px] w-[18px]" }: { d: string; className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[1][0]).toLocaleUpperCase("tr-TR");
}

function matches(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

// Yan menüyle üst çubuk aynı çekmece durumunu paylaşır (mobilde üst
// çubuktaki düğme yan menüyü açar) — admin/layout.tsx'te tutulur.
export type DrawerState = { open: boolean; setOpen: (open: boolean) => void };

export function V2Sidebar({
  pathname, navItems, settingsItems, businessName, panelLogoUrl, username, roleLabel, onLogout, drawer,
}: {
  pathname: string;
  navItems: readonly ShellNavItem[];
  settingsItems: readonly ShellNavItem[];
  businessName: string;
  panelLogoUrl: string | null;
  username: string;
  roleLabel: string;
  onLogout: () => void;
  drawer: DrawerState;
}) {
  // Ayarlar altındaki bir sayfadaysak (ör. /admin/appointments/ayarlar) ana
  // menüdeki öneki eşleşen öğe (Randevular) ayrıca aktif görünmesin.
  const settingsActive = settingsItems.some((i) => matches(pathname, i.href));
  const [settingsOpen, setSettingsOpen] = useState(settingsActive);
  useEffect(() => { if (settingsActive) setSettingsOpen(true); }, [settingsActive]);
  const { setOpen } = drawer;
  useEffect(() => { setOpen(false); }, [pathname, setOpen]);
  // Mobil çekmece: Escape ile kapanır, odak içinde döner, kapanınca menü
  // düğmesine geri döner (bkz. lib/useDialog).
  const drawerDialog = useDialog(() => setOpen(false));

  const brandName = businessName || "Lastik Servis Paneli";

  const content = (
    <div className="flex h-full flex-col gap-7 px-4 py-6">
      <Link href="/admin/orders" className="flex items-center gap-3 px-2">
        {panelLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Blob URL'i harici bir host
          <img src={panelLogoUrl} alt={brandName} className="h-9 max-w-[180px] object-contain" />
        ) : (
          <>
            <span aria-hidden="true" className="flex h-9 w-9 flex-none items-center justify-center rounded-[9px] bg-v2-primary text-[15px] font-bold text-white">
              {initials(brandName)}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[15px] font-semibold text-white">{brandName}</span>
              <span className="text-xs text-v2-sidebar-muted">Yönetim Paneli</span>
            </span>
          </>
        )}
      </Link>

      <nav aria-label="Ana menü" className="flex flex-col gap-0.5">
        <span className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-v2-sidebar-muted">Operasyon</span>
        {navItems.map((item) => {
          const active = !settingsActive && matches(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              data-tour-target={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-v2-sidebar-active text-white shadow-[inset_2px_0_0_rgb(var(--v2-accent))]"
                  : "text-v2-sidebar-fg hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon d={ICONS[item.href] ?? ICONS["/admin/orders"]} />
              <span className="flex-1">{item.label}</span>
              {item.isNew && (
                <span className="rounded-full bg-v2-accent/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-v2-accent">Yeni</span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-0.5 border-t border-v2-sidebar-line pt-4">
        <button
          type="button"
          onClick={() => setSettingsOpen((v) => !v)}
          aria-expanded={settingsOpen}
          data-tour-target="ayarlar"
          className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
            settingsActive ? "text-white" : "text-v2-sidebar-fg hover:bg-white/5 hover:text-white"
          }`}
        >
          <Icon d={SETTINGS_ICON} />
          <span className="flex-1">Ayarlar</span>
          <svg aria-hidden="true" className={`h-4 w-4 transition-transform ${settingsOpen ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="m6 9 6 6 6-6" /></svg>
        </button>
        {settingsOpen && (
          <div className="flex flex-col gap-0.5 pb-2 pl-9">
            {settingsItems.map((item) => {
              const active = matches(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-md px-3 py-2 text-[13px] font-medium transition-colors ${
                    active ? "bg-v2-sidebar-active text-white" : "text-v2-sidebar-fg hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        )}
        <div className="flex items-center gap-3 px-3 pt-3">
          <span aria-hidden="true" className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-white/10 text-[13px] font-semibold text-white">
            {initials(username)}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[13px] font-medium text-white">{username}</span>
            <span className="text-xs text-v2-sidebar-muted">{roleLabel}</span>
          </span>
          <button
            type="button"
            onClick={onLogout}
            aria-label="Çıkış yap"
            title="Çıkış yap"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-v2-sidebar-fg transition-colors hover:bg-white/5 hover:text-white"
          >
            <Icon d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[264px] overflow-y-auto bg-v2-sidebar lg:block">{content}</aside>
      {drawer.open && (
        <div ref={drawerDialog} className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menü">
          <button type="button" aria-label="Menüyü kapat" onClick={() => drawer.setOpen(false)} className="absolute inset-0 bg-black/50" />
          <div className="absolute inset-y-0 left-0 w-[280px] max-w-[85%] overflow-y-auto bg-v2-sidebar">{content}</div>
        </div>
      )}
    </>
  );
}

// Üst çubuktaki konum yolu — her sayfada aynı yerde, menü tanımından
// türetilir (sayfaların tek tek eklemesi gerekmez). Ayarlar altındaki
// öğeler (ör. /admin/appointments/ayarlar) Operasyon'dakilerden önce
// eşleşir; menü öğesinin altındaki her yol (ör. /admin/orders/44) "Detay".
function useBreadcrumb(): { section: string; label: string; href: string; leaf: string | null } | null {
  const pathname = usePathname() ?? "";
  if (pathname === "/") return { section: "Operasyon", label: "Siparişler", href: "/admin/orders", leaf: "Yeni sipariş" };
  const match = (items: readonly { href: string; label: string }[]) =>
    [...items].sort((a, b) => b.href.length - a.href.length).find((i) => pathname === i.href || pathname.startsWith(i.href + "/"));
  const settings = match(SETTINGS_ITEMS);
  const item = settings ?? match(NAV_ITEMS);
  if (!item) return null;
  return { section: settings ? "Ayarlar" : "Operasyon", label: item.label, href: item.href, leaf: pathname === item.href ? null : "Detay" };
}

export function V2Header({
  businessName, theme, onThemeChange, drawer,
}: {
  businessName: string;
  theme: UiTheme;
  onThemeChange: (theme: UiTheme) => void;
  drawer: DrawerState;
}) {
  // Hızlı düğme açık ↔ koyu arasında geçer ("Sistem" Profil › Görünüm'den
  // seçilir); Sistem modundayken o an görünen temanın tersine geçer.
  const currentlyDark = typeof document !== "undefined" && document.documentElement.dataset.theme === "dark";
  const nextTheme: UiTheme = (theme === "system" ? currentlyDark : theme === "dark") ? "light" : "dark";
  const crumb = useBreadcrumb();

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-v2-line bg-v2-surface/90 px-4 py-3 backdrop-blur sm:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={() => drawer.setOpen(true)}
          aria-label="Menüyü aç"
          aria-expanded={drawer.open}
          className="flex h-10 w-10 flex-none items-center justify-center rounded-lg border border-v2-line-strong text-v2-fg-muted lg:hidden"
        >
          <Icon d="M4 6h16M4 12h16M4 18h16" />
        </button>
        <span className="truncate text-sm font-semibold lg:hidden">{businessName || "Lastik Servis Paneli"}</span>
        {crumb && (
          <nav aria-label="Konum" className="hidden min-w-0 items-center gap-2 text-sm lg:flex">
            <span className="text-v2-fg-subtle">{crumb.section}</span>
            <span aria-hidden="true" className="text-v2-fg-subtle">/</span>
            {crumb.leaf ? (
              <>
                <Link href={crumb.href} className="font-medium text-v2-fg-muted hover:text-v2-fg">{crumb.label}</Link>
                <span aria-hidden="true" className="text-v2-fg-subtle">/</span>
                <span aria-current="page" className="truncate font-semibold text-v2-fg">{crumb.leaf}</span>
              </>
            ) : (
              <span aria-current="page" className="truncate font-semibold text-v2-fg">{crumb.label}</span>
            )}
          </nav>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onThemeChange(nextTheme)}
          aria-label={nextTheme === "dark" ? "Koyu moda geç" : "Açık moda geç"}
          title={nextTheme === "dark" ? "Koyu moda geç" : "Açık moda geç"}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-v2-line-strong bg-v2-surface text-v2-fg-muted transition-colors hover:text-v2-fg"
        >
          {nextTheme === "dark" ? (
            <Icon d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
          ) : (
            <svg aria-hidden="true" className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
          )}
        </button>
        <Link
          href="/"
          prefetch={false}
          aria-label="Sipariş Ekle"
          className="flex h-10 items-center gap-2 rounded-lg bg-v2-primary px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-v2-primary-hover"
        >
          <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          <span className="hidden sm:inline">Sipariş Ekle</span>
        </Link>
      </div>
    </header>
  );
}
