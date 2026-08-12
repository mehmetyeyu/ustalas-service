"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";

const navItems = [
  { href: "/admin/orders", label: "Siparişler" },
  { href: "/admin/storage", label: "Depolama" },
  { href: "/admin/products", label: "Ürünler" },
  { href: "/admin/reports", label: "Raporlar" },
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
        {/* Mobile: iki satır */}
        <div className="flex flex-col gap-2 sm:hidden">
          <div className="flex items-center justify-between">
            <Image src="/logo.jpg" alt="Logo" width={120} height={41} className="object-contain" />
            <div className="flex items-center gap-3">
              <SettingsMenu pathname={pathname} />
              <button
                onClick={handleLogout}
                className="text-sm text-gray-400 hover:text-white transition-colors"
              >
                Çıkış Yap
              </button>
            </div>
          </div>
          <div className="flex gap-1 flex-wrap">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
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

        {/* Desktop: tek satır */}
        <div className="hidden sm:flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Image src="/logo.jpg" alt="Logo" width={150} height={51} className="object-contain" />
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
      <main className="p-6">{children}</main>
    </div>
  );
}
