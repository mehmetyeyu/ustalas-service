"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "./AuthContext";
import { hasPermission } from "@/lib/permissions";
import { trialDaysLeft } from "@/lib/billing";
import { shouldShowOnboardingTour } from "@/lib/onboardingTour";
import OnboardingTour from "@/components/OnboardingTour";

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

// `resource: null` → her authenticated kullanıcıya (admin da staff da) her
// zaman görünür. staff için görünürlük ilgili "<resource>.view" iznine bağlı
// — bkz. src/lib/permissions.ts (aynı kaynak/aksiyon taksonomisi).
const navItems = [
  { href: "/admin/orders", label: "Siparişler", resource: "orders" },
  { href: "/admin/products", label: "Ürünler", resource: "products" },
  { href: "/admin/storage", label: "Depolama", resource: "storage" },
  { href: "/admin/reports", label: "Raporlar", resource: "reports" },
  { href: "/admin/kasa", label: "Kasa", resource: "kasa" },
  { href: "/admin/expenses", label: "Masraflar", resource: "expenses" },
  { href: "/admin/services", label: "Hizmetler", resource: "services" },
  { href: "/admin/customers", label: "Müşteriler", resource: "customers" },
  { href: "/admin/suppliers", label: "Tedarikçiler", resource: "suppliers" },
  { href: "/admin/shared-stock", label: "Paylaşılan Stok", resource: "shared_stock", isNew: true },
  { href: "/admin/appointments", label: "Randevular", resource: "appointments" },
] as const;

// Kullanıcılar/Genel Ayarlar hiçbir zaman staff'a devredilemez (bkz. plan) —
// bu ikisi resource=null DEĞİL, "adminOnly" — staff için filtrelenirken
// koşulsuz elenir.
const settingsItems = [
  { href: "/admin/profile", label: "Profil", adminOnly: false },

  { href: "/admin/users", label: "Kullanıcılar", adminOnly: true },
  { href: "/admin/audit-log", label: "Aktivite Geçmişi", adminOnly: true },
  { href: "/admin/settings", label: "Genel Ayarlar", adminOnly: true },
  { href: "/admin/appointments/ayarlar", label: "Randevu Ayarları", adminOnly: true },
  { href: "/admin/appointments/gorunum", label: "Randevu Görünümü", adminOnly: true },
  // billing_status='exempt' (Ustalas, FB Lastik, Süper Admin'den elle
  // eklenenler) hiç faturalandırmaya girmez — bu firmalara "Abonelik"
  // menüsü hiç gösterilmez, bkz. görünürlük filtresi (AdminLayoutInner).
  { href: "/admin/billing", label: "Abonelik", adminOnly: true },
    { href: "/admin/help", label: "Kullanım Kılavuzu", adminOnly: false },
] as const;

type NavItem = { href: string; label: string; badge?: number; isNew?: boolean };

function NavBadge({ count }: { count: number }) {
  return (
    <span className="ml-1.5 inline-flex items-center justify-center min-w-[1.15rem] h-[1.15rem] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold leading-none">
      {count}
    </span>
  );
}

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
              {!!item.badge && <NavBadge count={item.badge} />}
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
  const { user, loading } = useAuth();
  const [pendingAppointments, setPendingAppointments] = useState(0);
  const [showTrialModal, setShowTrialModal] = useState(false);
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

  // Randevu sayfasına girmeden "bekleyen randevu var mı" görülebilsin diye —
  // nav'daki rozet, kullanıcı isteği üzerine eklendi. Sayfa açılışında ve
  // ardından periyodik olarak (60sn) BEKLEMEDE sayısını çeker; appointments.view
  // izni yoksa hiç denemez.
  useEffect(() => {
    if (!user) return;
    const canView = user.role === "admin" || hasPermission(user, "appointments.view");
    if (!canView) return;
    let cancelled = false;
    async function fetchPending() {
      try {
        // Sadece bir sayı gösterilecek — tüm satırları (isim/telefon/not
        // dahil) çekmek yerine ucuz ?count=1 yolunu kullanır (bkz.
        // /api/appointments GET, appointments_tenant_status_idx'e dayanır).
        const res = await fetch("/api/appointments?status=BEKLEMEDE&count=1", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setPendingAppointments(typeof data.count === "number" ? data.count : 0);
      } catch { /* sessizce yoksay — bu sadece bir rozet, sayfayı bloklamamalı */ }
    }
    fetchPending();
    const interval = setInterval(fetchPending, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [user]);

  // Yüklenirken tüm linkler gösterilir (kısa an) — asıl erişim zaten
  // middleware + her sayfanın kendi guard'ı ile korunuyor, bu sadece nav'ın
  // görünürlüğü. admin için filtreleme hiç uygulanmaz (her zaman tam liste).
  const visibleNavItems: NavItem[] = (loading || user?.role === "admin"
    ? navItems
    : navItems.filter((item) => user && hasPermission(user, `${item.resource}.view`))
  ).map((item) =>
    item.href === "/admin/appointments" && pendingAppointments > 0
      ? { ...item, badge: pendingAppointments }
      : item
  );
  const visibleSettingsItems = (loading || user?.role === "admin"
    ? settingsItems
    : settingsItems.filter((item) => !item.adminOnly)
  ).filter((item) => item.href !== "/admin/billing" || (!loading && user?.billingStatus !== "exempt"));

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/admin/login");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-gray-900 text-white px-4 py-3">
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
                  {!!item.badge && <NavBadge count={item.badge} />}
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
      {!loading && user?.role === "admin" && user.billingStatus === "trialing" && !pathname.startsWith("/admin/billing") && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-800 text-sm text-center py-2 px-4">
          Deneme sürenizin bitmesine {trialDaysLeft(user.trialEndsAt)} gün kaldı —{" "}
          <Link href="/admin/billing" className="font-semibold underline">Abone Ol</Link>
        </div>
      )}
      <main className="p-4 sm:p-6">{children}</main>
      {showTrialModal && user && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
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
