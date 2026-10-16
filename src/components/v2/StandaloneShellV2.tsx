"use client";

import { useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/admin/AuthContext";
import { ROLE_LABELS, visibleAdminNav } from "@/lib/adminNav";
import { forgetUiPref } from "@/lib/uiTheme";

const V2Sidebar = dynamic(() => import("./AdminShellV2").then((m) => m.V2Sidebar), { ssr: false });
const V2Header = dynamic(() => import("./AdminShellV2").then((m) => m.V2Header), { ssr: false });

// Panel layout'unun dışındaki sayfalar (sipariş formu "/") için yeni görünüm
// çerçevesi: yeni görünümdeki kullanıcıya panelle aynı sol menü ve üst çubuk.
// İçerik (children) her iki durumda da AYNI konumda kalır — tercih yüklenip
// çerçeve eklendiğinde form baştan kurulmaz, yazılanlar kaybolmaz (panel
// layout'undaki <main> yuvasıyla aynı yaklaşım). AuthProvider içinde
// kullanılmalı.
export default function StandaloneShellV2({ activeHref, children }: { activeHref: string; children: ReactNode }) {
  const router = useRouter();
  const { user, loading, setUiPreferences } = useAuth();
  const v2 = !loading && user?.uiVersion === "v2";
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawer = useMemo(() => ({ open: drawerOpen, setOpen: setDrawerOpen }), [drawerOpen]);
  const { navItems, settingsItems } = visibleAdminNav(user, loading);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    forgetUiPref();
    router.push("/admin/login");
  }

  return (
    <div className={v2 ? "min-h-screen bg-v2-bg font-v2-sans text-v2-fg lg:pl-[264px]" : undefined}>
      {v2 ? (
        <V2Sidebar
          pathname={activeHref}
          navItems={navItems}
          settingsItems={settingsItems}
          businessName={user?.businessName ?? ""}
          panelLogoUrl={user?.panelLogoUrl ?? null}
          username={user?.username ?? ""}
          roleLabel={ROLE_LABELS[user?.role ?? ""] ?? user?.role ?? ""}
          onLogout={handleLogout}
          drawer={drawer}
        />
      ) : null}
      {v2 ? (
        <V2Header
          businessName={user?.businessName ?? ""}
          theme={user?.uiTheme ?? "system"}
          onThemeChange={(t) => { void setUiPreferences({ ui_theme: t }); }}
          drawer={drawer}
        />
      ) : null}
      <div className={v2 ? "min-w-0 p-4 sm:p-8" : undefined}>{children}</div>
    </div>
  );
}
