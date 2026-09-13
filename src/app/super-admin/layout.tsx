"use client";

import { useRouter } from "next/navigation";

// /admin/layout.tsx'teki tenant-özel nav'ı miras almaz — süper admin
// hiçbir firmaya ait değil, tek sayfalık (firma listesi) bir panel yeterli
// (bkz. src/middleware.ts, src/app/super-admin/page.tsx).
export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/admin/login");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-800">Süper Admin Paneli</h1>
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
