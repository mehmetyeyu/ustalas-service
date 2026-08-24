"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "./AuthContext";
import { hasPermission } from "@/lib/permissions";

// Farklı dağıtımlar (ör. Elevire demo/pazarlama sitesi) kendi logolarını
// NEXT_PUBLIC_LOGO_SRC_DARK ile gösterebilir (bu menü koyu arka planlı) —
// set edilmezse Ustalas'ın gerçek logosu (public/logo.jpg) kullanılmaya devam eder.
const LOGO_SRC = process.env.NEXT_PUBLIC_LOGO_SRC_DARK || "/logo.jpg";

// `resource: null` → her authenticated kullanıcıya (admin da staff da) her
// zaman görünür. staff için görünürlük ilgili "<resource>.view" iznine bağlı
// — bkz. src/lib/permissions.ts (aynı kaynak/aksiyon taksonomisi).
const navItems = [
  { href: "/admin/orders", label: "Siparişler", resource: "orders" },
  { href: "/admin/appointments", label: "Randevular", resource: "appointments" },
  { href: "/admin/storage", label: "Depolama", resource: "storage" },
  { href: "/admin/products", label: "Ürünler", resource: "products" },
  { href: "/admin/reports", label: "Raporlar", resource: "reports" },
  { href: "/admin/expenses", label: "Masraflar", resource: "expenses" },
  { href: "/admin/services", label: "Hizmetler", resource: "services" },
  { href: "/admin/customers", label: "Müşteriler", resource: "customers" },
  { href: "/admin/suppliers", label: "Tedarikçiler", resource: "suppliers" },
] as const;

// Kullanıcılar/Genel Ayarlar hiçbir zaman staff'a devredilemez (bkz. plan) —
// bu ikisi resource=null DEĞİL, "adminOnly" — staff için filtrelenirken
// koşulsuz elenir.
const settingsItems = [
  { href: "/admin/profile", label: "Profil", adminOnly: false },
  { href: "/admin/users", label: "Kullanıcılar", adminOnly: true },
  { href: "/admin/settings", label: "Genel Ayarlar", adminOnly: true },
  { href: "/admin/appointments/ayarlar", label: "Randevu Ayarları", adminOnly: true },
] as const;

type NavItem = { href: string; label: string; badge?: number };

function NavBadge({ count }: { count: number }) {
  return (
    <span className="ml-1.5 inline-flex items-center justify-center min-w-[1.15rem] h-[1.15rem] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold leading-none">
      {count}
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
}: {
  pathname: string;
  onLogout: () => void;
  navItems: readonly NavItem[];
  settingsItems: readonly NavItem[];
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="sm:hidden">
      <div className="flex items-center justify-between">
        {/* eslint-disable-next-line @next/next/no-img-element -- küçük, sabit boyutlu logo; next/image yerel SVG'leri ek yapılandırma olmadan optimize etmiyor */}
        <img src={LOGO_SRC} alt="Logo" width={120} height={41} className="object-contain" />
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
  const visibleSettingsItems = loading || user?.role === "admin"
    ? settingsItems
    : settingsItems.filter((item) => !item.adminOnly);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/admin/login");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-gray-900 text-white px-4 py-3">
        <MobileMenu pathname={pathname} onLogout={handleLogout} navItems={visibleNavItems} settingsItems={visibleSettingsItems} />

        {/* Desktop: tek satır */}
        <div className="hidden sm:flex items-center justify-between">
          <div className="flex items-center gap-6">
            {/* eslint-disable-next-line @next/next/no-img-element -- küçük, sabit boyutlu logo; next/image yerel SVG'leri ek yapılandırma olmadan optimize etmiyor */}
            <img src={LOGO_SRC} alt="Logo" width={150} height={51} className="object-contain" />
            <div className="flex gap-1">
              {visibleNavItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center ${
                    pathname.startsWith(item.href)
                      ? "bg-blue-600 text-white"
                      : "text-gray-300 hover:bg-gray-700"
                  }`}
                >
                  {item.label}
                  {!!item.badge && <NavBadge count={item.badge} />}
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
      <main className="p-4 sm:p-6">{children}</main>
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
