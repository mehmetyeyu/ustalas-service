"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

// Farklı dağıtımlar (ör. Elevire demo/pazarlama sitesi) kendi logolarını
// NEXT_PUBLIC_LOGO_SRC_DARK ile gösterebilir (bu menü koyu arka planlı) —
// set edilmezse Ustalas'ın gerçek logosu (public/logo.jpg) kullanılmaya devam eder.
const LOGO_SRC = process.env.NEXT_PUBLIC_LOGO_SRC_DARK || "/logo.jpg";

const navItems = [
  { href: "/admin/orders", label: "Siparişler" },
  { href: "/admin/storage", label: "Depolama" },
  { href: "/admin/products", label: "Ürünler" },
  { href: "/admin/reports", label: "Raporlar" },
  { href: "/admin/expenses", label: "Masraflar" },
  { href: "/admin/services", label: "Hizmetler" },
  { href: "/admin/customers", label: "Müşteriler" },
  { href: "/admin/suppliers", label: "Tedarikçiler" },
];

const settingsItems = [
  { href: "/admin/profile", label: "Profil" },
  { href: "/admin/users", label: "Kullanıcılar" },
  { href: "/admin/settings", label: "Genel Ayarlar" },
];

function SettingsMenu({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isActive = settingsItems.some((item) => pathname.startsWith(item.href));

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
          {settingsItems.map((item) => (
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
}: {
  pathname: string;
  onLogout: () => void;
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

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === "/admin/login") return <>{children}</>;

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/admin/login");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-gray-900 text-white px-4 py-3">
        <MobileMenu pathname={pathname} onLogout={handleLogout} />

        {/* Desktop: tek satır */}
        <div className="hidden sm:flex items-center justify-between">
          <div className="flex items-center gap-6">
            {/* eslint-disable-next-line @next/next/no-img-element -- küçük, sabit boyutlu logo; next/image yerel SVG'leri ek yapılandırma olmadan optimize etmiyor */}
            <img src={LOGO_SRC} alt="Logo" width={150} height={51} className="object-contain" />
            <div className="flex gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    pathname.startsWith(item.href)
                      ? "bg-blue-600 text-white"
                      : "text-gray-300 hover:bg-gray-700"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <SettingsMenu pathname={pathname} />
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
