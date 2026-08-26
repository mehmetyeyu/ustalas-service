"use client";

import { useState } from "react";
import { getDefaultAdminPath } from "@/lib/permissions";
import { useToast } from "@/components/ToastProvider";

// Farklı dağıtımlar (ör. Elevire demo/pazarlama sitesi) kendi logolarını
// NEXT_PUBLIC_LOGO_SRC ile gösterebilir — set edilmezse Ustalas'ın gerçek
// logosu (public/logo.jpg) kullanılmaya devam eder.
const LOGO_SRC = process.env.NEXT_PUBLIC_LOGO_SRC || "/logo.jpg";

// Sadece Elevire'de (NEXT_PUBLIC_DEMO_MODE=true) — paylaşılan demo hesabının
// bilgileri zaten landing sayfasında ve schema.sql'de açıkça public, o yüzden
// burada önceden doldurmak yeni bir bilgi ifşa etmiyor, sadece ziyaretçinin
// yazmadan doğrudan Giriş Yap'a basabilmesini sağlıyor. Ustalas'ta bu değişken
// tanımlı değildir, alanlar her zaman boş başlar.
const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export default function LoginPage() {
  const toast = useToast();
  const [username, setUsername] = useState(DEMO_MODE ? "admin" : "");
  const [password, setPassword] = useState(DEMO_MODE ? "admin123" : "");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Giriş başarısız.");

      window.location.href = getDefaultAdminPath(data) ?? "/";
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Hata oluştu.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            {/* eslint-disable-next-line @next/next/no-img-element -- küçük, sabit boyutlu logo; next/image yerel SVG'leri ek yapılandırma olmadan optimize etmiyor */}
            <img src={LOGO_SRC} alt="Logo" width={150} height={51} className="mx-auto mb-4 object-contain" />
            <h1 className="text-2xl font-bold text-gray-800">Yönetici Girişi</h1>
            <p className="text-gray-500 text-sm mt-1">Lastik Servis Paneli</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Kullanıcı Adı
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                required
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Şifre
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-3 rounded-lg transition-colors mt-2"
            >
              {loading ? "Giriş yapılıyor..." : "Giriş Yap"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
