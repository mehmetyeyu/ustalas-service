"use client";

import { useState } from "react";
import { getDefaultAdminPath } from "@/lib/permissions";
import { useToast } from "@/components/ToastProvider";

// Başlık sabit: Firma Kodu yazıldıkça firmanın adını gösteren önizleme
// (eski /api/auth/branding, kimlik doğrulamasız) kaldırıldı — her girişte
// gereksiz bir istek atıyordu ve bir firma kodunun var olup olmadığını
// dışarıya hafifçe ifşa ediyordu. Firma adı girişten sonra panelde görünür.
const LOGIN_TITLE = "Lastik Servis Paneli";

export default function LoginPage() {
  const toast = useToast();
  const [code, setCode] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, username, password, rememberMe }),
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
            <h1 className="text-2xl font-bold text-gray-800 mb-1">{LOGIN_TITLE}</h1>
            <p className="text-gray-500 text-sm">Yönetici Girişi</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Firma Kodu
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="125092"
                maxLength={6}
                required
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Kullanıcı Adı veya E-posta
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                autoCapitalize="none"
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

            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              Beni Hatırla
            </label>

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
