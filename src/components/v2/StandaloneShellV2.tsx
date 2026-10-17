"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/admin/AuthContext";
import { ROLE_LABELS, cachedAdminNav, visibleAdminNav } from "@/lib/adminNav";
import { readShellCache, writeShellCache } from "@/lib/shellCache";
import { V2Header, V2Sidebar } from "./AdminShellV2";
import { forgetUiPref } from "@/lib/uiTheme";
import { V2HeaderPlaceholder, V2SidebarPlaceholder } from "./ChromePlaceholder";


// Panel layout'unun dışındaki sayfalar (sipariş formu "/") için yeni görünüm
// çerçevesi: yeni görünümdeki kullanıcıya panelle aynı sol menü ve üst çubuk.
// İçerik (children) her iki durumda da AYNI konumda kalır — tercih yüklenip
// çerçeve eklendiğinde form baştan kurulmaz, yazılanlar kaybolmaz (panel
// layout'undaki <main> yuvasıyla aynı yaklaşım). AuthProvider içinde
// kullanılmalı.
export default function StandaloneShellV2({ activeHref, children }: { activeHref: string; children: ReactNode }) {
  const router = useRouter();
  const { user, loading, setUiPreferences, isV2 } = useAuth();
  // Tercih gelene kadar çerezden gelen işarete göre (bkz. AuthContext isV2).
  const v2 = isV2;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawer = useMemo(() => ({ open: drawerOpen, setOpen: setDrawerOpen }), [drawerOpen]);
  const real = visibleAdminNav(user, loading);
  // Açılışta yan menü /me'yi beklemeden tarayıcıdaki kopyadan çizilir (bkz.
  // src/lib/shellCache.ts, admin/layout.tsx'teki aynı mantık).
  const shellCache = loading && v2 ? readShellCache() : null;
  const { navItems, settingsItems } = loading ? cachedAdminNav(shellCache) : real;
  const shellCacheKey = !loading && v2 && user
    ? JSON.stringify({
        nav: real.navItems.map((i) => i.href),
        settings: real.settingsItems.map((i) => i.href),
        businessName: user.businessName ?? "",
        panelLogoUrl: user.panelLogoUrl ?? null,
        username: user.username,
        roleLabel: ROLE_LABELS[user.role] ?? user.role,
      })
    : null;
  useEffect(() => { if (shellCacheKey) writeShellCache(JSON.parse(shellCacheKey)); }, [shellCacheKey]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    forgetUiPref();
    router.push("/admin/login");
  }

  return (
    // Tercih yüklenirken açılış betiği yeni görünümü işaretlediyse yer
    // tutucular ve v2: sınıfları alanı baştan ayırır (bkz. ChromePlaceholder).
    <div className={v2 ? "min-h-screen bg-v2-bg font-v2-sans text-v2-fg lg:pl-[264px]" : "v2:min-h-screen v2:lg:pl-[264px]"}>
      {v2 ? (
        <V2Sidebar
          pathname={activeHref}
          navItems={navItems}
          settingsItems={settingsItems}
          businessName={user?.businessName ?? shellCache?.businessName ?? ""}
          panelLogoUrl={user ? user.panelLogoUrl ?? null : shellCache?.panelLogoUrl ?? null}
          username={user?.username ?? shellCache?.username ?? ""}
          roleLabel={user ? ROLE_LABELS[user.role] ?? user.role : shellCache?.roleLabel ?? ""}
          onLogout={handleLogout}
          drawer={drawer}
        />
      ) : <V2SidebarPlaceholder />}
      {v2 ? (
        <V2Header
          businessName={user?.businessName ?? shellCache?.businessName ?? ""}
          theme={user?.uiTheme ?? "system"}
          onThemeChange={(t) => { void setUiPreferences({ ui_theme: t }); }}
          drawer={drawer}
        />
      ) : <V2HeaderPlaceholder />}
      <div className={v2 ? "min-w-0 p-4 sm:p-8" : "v2:min-w-0 v2:p-4 v2:sm:p-8"}>{children}</div>
    </div>
  );
}
