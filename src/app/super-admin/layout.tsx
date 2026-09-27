"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

// /admin/layout.tsx'teki tenant-özel nav'ı miras almaz — süper admin
// hiçbir firmaya ait değil. Eskiden gerçekten tek sayfalık (sadece firma
// listesi) bir panel yeterliydi; Destek Talepleri (bkz. src/app/super-admin/
// destek/page.tsx) ikinci bir sayfa getirdiği için burada minimal bir nav
// eklendi — /admin/layout.tsx'teki kadar gelişmiş (izin bazlı filtreleme,
// rozet vb.) bir şeye ihtiyaç yok, süper admin tek roldür.
const NAV_ITEMS = [
  { href: "/super-admin", label: "Firmalar" },
  { href: "/super-admin/destek", label: "Destek Talepleri" },
] as const;

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/admin/login");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <h1 className="text-lg font-bold text-gray-800">Süper Admin Paneli</h1>
            <nav className="flex gap-1">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    pathname === item.href
                      ? "bg-blue-600 text-white"
                      : "text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-500 hover:text-gray-700 font-medium"
          >
            Çıkış
          </button>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">{children}</main>
    </div>
  );
}
