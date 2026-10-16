"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "./AuthContext";
import type { NavItem } from "@/lib/adminNav";
import { trialDaysLeft } from "@/lib/billing";
import { shouldShowOnboardingTour } from "@/lib/onboardingTour";
import OnboardingTour from "@/components/OnboardingTour";
import { forgetUiPref, useApplyUi } from "@/lib/uiTheme";
import { ROLE_LABELS, visibleAdminNav } from "@/lib/adminNav";
import { noteInAppNavigation } from "@/lib/navHistory";
import { useDialog } from "@/lib/useDialog";

// Yeni görünümün (v2) çerçevesi — yalnızca v2'yi seçen kullanıcıya yüklenir.
const V2Sidebar = dynamic(() => import("@/components/v2/AdminShellV2").then((m) => m.V2Sidebar), { ssr: false });
const V2Header = dynamic(() => import("@/components/v2/AdminShellV2").then((m) => m.V2Header), { ssr: false });


// Paylaşılan deploymentta artık birden fazla firma (tenant) aynı panele
// giriyor — sabit kodlanmış tek bir logo yerine, giriş yapan kullanıcının
// firmasının işletme adı gösterilir (bkz. /api/auth/me, AuthContext).
const DEFAULT_BUSINESS_NAME = "Lastik Servis Paneli";

// Panel Logosu ayarlanmışsa (bkz. Genel Ayarlar > Marka) business_name
// metni yerine bu gösterilir — ayarlanmamışsa eskisi gibi metin.
function BrandMark({ businessName, panelLogoUrl, className }: { businessName: string; panelLogoUrl: string | null; className: string }) {
  if (panelLogoUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- Blob URL'i harici bir host, next/image domain izni istiyor
    return <img src={panelLogoUrl} alt={businessName || DEFAULT_BUSINESS_NAME} className="h-8 max-w-[180px] object-contain" />;
  }
  return <span className={className}>{businessName || DEFAULT_BUSINESS_NAME}</span>;
}

// Menü öğeleri ve görünürlük kuralları: src/lib/adminNav.ts.

// Yeni eklenen bir menü öğesini (ör. Paylaşılan Stok) kısa süreliğine
// vurgulamak için — kullanıcılar keşfetmeden önce fark etsin diye.
// Kalıcı değil; özellik "yeni" olmaktan çıkınca item'dan isNew kaldırılmalı.
function NavNewBadge() {
  return (
    <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full bg-teal-500 text-white text-[9px] font-bold uppercase tracking-wide leading-none">
      Yeni
    </span>
  );
}

function SettingsMenu({ pathname, items }: { pathname: string; items: readonly NavItem[] }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isActive = items.some((item) => pathname.startsWith(item.href));

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        data-tour-target="ayarlar"
        className={`text-sm transition-colors ${
          isActive ? "text-white font-medium" : "text-gray-400 hover:text-white"
        }`}
      >
        Ayarlar
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-44 bg-white rounded-lg shadow-xl overflow-hidden z-50">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={`block px-4 py-2.5 text-sm transition-colors ${
                pathname.startsWith(item.href)
                  ? "bg-blue-50 text-blue-600 font-medium"
                  : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function MobileMenu({
  pathname,
  onLogout,
  navItems,
  settingsItems,
  businessName,
  panelLogoUrl,
}: {
  pathname: string;
  onLogout: () => void;
  navItems: readonly NavItem[];
  settingsItems: readonly NavItem[];
  businessName: string;
  panelLogoUrl: string | null;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="sm:hidden">
      <div className="flex items-center justify-between">
        <BrandMark businessName={businessName} panelLogoUrl={panelLogoUrl} className="text-lg font-bold text-white truncate" />
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Menüyü kapat" : "Menüyü aç"}
          aria-expanded={open}
          className="p-2 -mr-2 text-gray-300 hover:text-white transition-colors"
        >
          {open ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {open && (
        <div className="mt-3 pt-3 border-t border-gray-800 flex flex-col gap-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center ${
                pathname.startsWith(item.href)
                  ? "bg-blue-600 text-white"
                  : "text-gray-300 hover:bg-gray-700"
              }`}
            >
              {item.label}
              {item.isNew && <NavNewBadge />}
            </Link>
          ))}

          <div className="my-2 border-t border-gray-800" />
          <span className="px-3 py-1 text-xs font-medium uppercase tracking-wide text-gray-500">
            Ayarlar
          </span>
          {settingsItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                pathname.startsWith(item.href)
                  ? "bg-blue-600 text-white"
                  : "text-gray-300 hover:bg-gray-700"
              }`}
            >
              {item.label}
            </Link>
          ))}

          <div className="my-2 border-t border-gray-800" />
          <button
            onClick={onLogout}
            className="text-left px-3 py-2 rounded-lg text-sm font-medium text-red-400 hover:bg-gray-800 transition-colors"
          >
            Çıkış Yap
          </button>
        </div>
      )}
    </div>
  );
}

function AdminLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  // "‹ Geri" bağlantıları için panel içi gezinme sayacı (bkz. src/lib/navHistory.ts).
  useEffect(() => { noteInAppNavigation(pathname); }, [pathname]);
  const { user, loading, setUiPreferences } = useAuth();
  const [showTrialModal, setShowTrialModal] = useState(false);
  const trialDialog = useDialog(() => setShowTrialModal(false));
  // Yeni görünüm (v2) tercihi — bkz. database/schema.sql ui_version notu.
  // Tercih gelene kadar (loading) hiçbir şey uygulanmaz; açılışta son bilinen
  // tercihi kök layout'taki script zaten uyguladı (renk sıçraması olmasın).
  const v2 = !loading && user?.uiVersion === "v2";
  useApplyUi(loading ? null : (user?.uiVersion ?? "v1"), user?.uiTheme ?? "system");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawer = useMemo(() => ({ open: drawerOpen, setOpen: setDrawerOpen }), [drawerOpen]);
  const [showOnboardingTour, setShowOnboardingTour] = useState(false);

  // Üstteki amber banner (aşağıda) her sayfada sessizce duruyor, kolayca
  // gözden kaçabiliyor — deneme süresi devam eden (henüz abone olmamış)
  // bir admin'e ARA SIRA bir modal ile daha görünür bir uyarı verilir.
  // Kaç gün kaldığından bağımsız — henüz ödeme yapmamış her trialing
  // tenant için geçerli. Her sayfa geçişinde göstermek rahatsız edici
  // olurdu, bu yüzden sekme başına bir sayaç (sessionStorage) tutulup ilk
  // geçişte ve sonra her 5 geçişte bir gösterilir. /admin/billing
  // sayfasının kendisinde gösterilmez (zaten o sayfa aboneliği yönetiyor).
  useEffect(() => {
    if (loading || !user) return;
    if (user.role !== "admin" || user.billingStatus !== "trialing") return;
    if (pathname.startsWith("/admin/billing")) return;
    try {
      const key = "trial_modal_nav_count";
      const count = Number(sessionStorage.getItem(key) || "0") + 1;
      sessionStorage.setItem(key, String(count));
      if (count === 1 || count % 5 === 0) setShowTrialModal(true);
    } catch {
      // sessionStorage engellenmiş olabilir (gizli sekme vb.) — sayaç
      // olmadan modal hiç gösterilmez, banner zaten yeterli bir yedek.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, loading, user?.role, user?.billingStatus, user?.trialEndsAt]);

  // Onboarding turu (bkz. src/lib/onboardingTour.ts) — yalnızca kendi
  // kendine kayıt olmuş firmanın birincil Yöneticisi'ne, panelde daha önce
  // hiç göstermediyse gösterilir. localStorage sadece hızlı bir ön-kontrol
  // (aynı tarayıcıda anlık tekrar mount'ta API'yi beklemeden gizlemek
  // için) — asıl kaynak her zaman sunucudaki onboarding_tour_completed_at,
  // bu yüzden pathname değişse bile ikinci kez tetiklenmez (sadece ilk
  // yüklemede kontrol edilir, aşağıdaki deps listesine pathname YOK).
  useEffect(() => {
    if (loading || !user) return;
    if (!shouldShowOnboardingTour({
      role: user.role,
      isPrimaryAdmin: user.isPrimaryAdmin,
      trialEndsAt: user.trialEndsAt,
      onboardingTourCompletedAt: user.onboardingTourCompletedAt,
    })) return;
    try {
      if (localStorage.getItem(`onboarding_tour_seen:${user.username}`)) return;
    } catch {
      // localStorage engellenmiş olabilir — o durumda sadece sunucu
      // kontrolüne güvenilir, tur yine de gösterilir.
    }
    setShowOnboardingTour(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user?.role, user?.isPrimaryAdmin, user?.trialEndsAt, user?.onboardingTourCompletedAt, user?.username]);

  function dismissOnboardingTour() {
    setShowOnboardingTour(false);
    if (user) {
      try {
        localStorage.setItem(`onboarding_tour_seen:${user.username}`, "1");
      } catch {
        // yoksay — sunucu tarafı zaten kalıcı kaynak.
      }
    }
    // best-effort: istek başarısız olsa da kullanıcı turu kapatabilmeli —
    // localStorage zaten aynı tarayıcı için bir daha göstermeyecek, sunucu
    // güncellemesi kalıcı kaynak olduğundan bir sonraki cihaz/tarayıcıda
    // (bu istek gerçekten hiç gitmediyse) tur tekrar görülebilir, ki bu
    // "hiç kapatılmamış gibi davran" fail-safe'i tercih edilir.
    fetch("/api/auth/onboarding-tour", { method: "POST" }).catch(() => {});
  }

  // Menü görünürlüğü (izinlere göre) — bkz. src/lib/adminNav.ts.
  const { navItems: visibleNavItems, settingsItems: visibleSettingsItems } = visibleAdminNav(user, loading);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    forgetUiPref();
    router.push("/admin/login");
  }

  // Sayfa içeriği (<main>) iki görünümde de bu div'in AYNI konumunda durur —
  // önündeki slotlar (menü, üst çubuk, banner'lar) element ya da null olarak
  // yerini korur. Böylece tercih yüklenip görünüm v1→v2 değişince sayfa
  // baştan kurulmaz (verisini ikinci kez çekmez); sadece çerçeve değişir.
  return (
    <div className={v2 ? "min-h-screen bg-v2-bg font-v2-sans text-v2-fg lg:pl-[264px]" : "min-h-screen bg-gray-50"}>
      {v2 ? (
        <V2Sidebar
          pathname={pathname}
          navItems={visibleNavItems}
          settingsItems={visibleSettingsItems}
          businessName={user?.businessName ?? ""}
          panelLogoUrl={user?.panelLogoUrl ?? null}
          username={user?.username ?? ""}
          roleLabel={ROLE_LABELS[user?.role ?? ""] ?? user?.role ?? ""}
          onLogout={handleLogout}
          drawer={drawer}
        />
      ) : (
      // v1-chrome: yeni görünüm tercihi olan kullanıcıda açılışta (tercih
      // sunucudan gelmeden) eski menü bir an görünmesin — globals.css.
      <nav className="v1-chrome bg-gray-900 text-white px-4 py-3">
        <MobileMenu pathname={pathname} onLogout={handleLogout} navItems={visibleNavItems} settingsItems={visibleSettingsItems} businessName={user?.businessName ?? ""} panelLogoUrl={user?.panelLogoUrl ?? null} />

        {/* Desktop: tek satır */}
        <div className="hidden sm:flex items-center justify-between">
          <div className="flex items-center gap-6">
            <BrandMark businessName={user?.businessName ?? ""} panelLogoUrl={user?.panelLogoUrl ?? null} className="text-xl font-bold text-white whitespace-nowrap" />
            <div className="flex gap-1">
              {visibleNavItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  data-tour-target={item.href}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center ${
                    pathname.startsWith(item.href)
                      ? "bg-blue-600 text-white"
                      : "text-gray-300 hover:bg-gray-700"
                  }`}
                >
                  {item.label}
                  {item.isNew && <NavNewBadge />}
                </Link>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <SettingsMenu pathname={pathname} items={visibleSettingsItems} />
            <button
              onClick={handleLogout}
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              Çıkış Yap
            </button>
          </div>
        </div>
      </nav>
      )}
      {v2 ? (
        <V2Header
          businessName={user?.businessName ?? ""}
          theme={user?.uiTheme ?? "system"}
          onThemeChange={(t) => { void setUiPreferences({ ui_theme: t }); }}
          drawer={drawer}
        />
      ) : null}
      {/* Yeni görünüm daveti — yalnızca erişimi açılmış YÖNETİCİLERE (kademeli
          açılış, bkz. ui_v2_available). Geri dönüş Profil › Görünüm'de. */}
      {!loading && !v2 && user?.role === "admin" && user.uiV2Available ? (
        <div className="v1-chrome flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-900">
          <span>Yeni panel görünümü hazır: yenilenen tasarım, açık ve koyu mod.</span>
          <button
            type="button"
            onClick={() => { void setUiPreferences({ ui_version: "v2" }); }}
            className="font-semibold underline underline-offset-2 hover:text-blue-700"
          >
            Yeni görünüme geç
          </button>
        </div>
      ) : null}
      {!loading && user?.role === "admin" && user.billingStatus === "trialing" && !pathname.startsWith("/admin/billing") && (
        <div className={v2
          ? "border-b border-v2-line bg-v2-warning-bg px-4 py-2 text-center text-sm text-v2-warning-fg"
          : "bg-amber-50 border-b border-amber-200 text-amber-800 text-sm text-center py-2 px-4"}>
          Deneme sürenizin bitmesine {trialDaysLeft(user.trialEndsAt)} gün kaldı —{" "}
          <Link href="/admin/billing" className="font-semibold underline">Abone Ol</Link>
        </div>
      )}
      <main className={v2 ? "min-w-0 p-4 sm:p-8" : "p-4 sm:p-6"}>{children}</main>
      {showTrialModal && user && (
        <div ref={trialDialog} role="dialog" aria-modal="true" aria-label="Deneme Süreniz Bitmek Üzere" className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm text-center">
            <h2 className="text-lg font-bold text-gray-800 mb-2">Deneme Süreniz Bitmek Üzere</h2>
            <p className="text-sm text-gray-500 mb-5">
              Deneme sürenizin bitmesine <span className="font-semibold text-amber-600">{trialDaysLeft(user.trialEndsAt)} gün</span> kaldı.
              Kesintisiz kullanmaya devam etmek için hemen abone olun.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowTrialModal(false)}
                className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg hover:bg-gray-50"
              >
                Daha Sonra
              </button>
              <Link
                href="/admin/billing"
                onClick={() => setShowTrialModal(false)}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg transition-colors"
              >
                Abone Ol
              </Link>
            </div>
          </div>
        </div>
      )}
      {showOnboardingTour && <OnboardingTour onDismiss={dismissOnboardingTour} />}
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/admin/login") return <>{children}</>;

  return (
    <AuthProvider>
      <AdminLayoutInner>{children}</AdminLayoutInner>
    </AuthProvider>
  );
}
