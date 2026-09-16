"use client";

import { useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/ToastProvider";

// Elevire landing'deki "Ücretsiz Hesap Oluştur" — kendi kendine kayıt,
// bkz. src/app/api/public/register/route.ts. src/app/admin/login/page.tsx
// ile aynı görsel dil (ortalanmış kart).
export default function RegisterPage() {
  const toast = useToast();
  const [contactName, setContactName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [acceptedPrivacyPolicy, setAcceptedPrivacyPolicy] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== passwordConfirm) {
      toast.error("Şifreler eşleşmiyor.");
      return;
    }
    if (!acceptedPrivacyPolicy) {
      toast.error("Devam etmek için Gizlilik Sözleşmesi'ni kabul etmeniz gerekiyor.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/public/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactName, businessName, email, phone, password, acceptedPrivacyPolicy }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kayıt başarısız.");
      window.location.href = "/admin/orders";
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
            <h1 className="text-2xl font-bold text-gray-800 mb-1">Ücretsiz Hesap Oluştur</h1>
            <p className="text-gray-500 text-sm">Kredi kartı gerekmez, hemen kullanmaya başlayın.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ad Soyad</label>
              <input
                type="text"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                required
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">İşletme Adı</label>
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Ör. Yılmaz Lastik"
                required
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">E-posta</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Telefon</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0555 123 45 67"
                required
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Şifre</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="En az 6 karakter"
                required
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Şifre (Tekrar)</label>
              <input
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                required
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <label className="flex items-start gap-2.5 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={acceptedPrivacyPolicy}
                onChange={(e) => setAcceptedPrivacyPolicy(e.target.checked)}
                required
                className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span>
                Kayıt olarak{" "}
                <a href="/elevire/legal/gizlilik" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline">
                  Gizlilik Sözleşmesi
                </a>
                &apos;ni okudum ve kabul ediyorum.
              </span>
            </label>

            <button
              type="submit"
              disabled={loading || !acceptedPrivacyPolicy}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-3 rounded-lg transition-colors mt-2"
            >
              {loading ? "Hesap oluşturuluyor..." : "Ücretsiz Hesap Oluştur"}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            Zaten bir hesabınız var mı? <Link href="/admin/login" className="text-blue-600 hover:text-blue-800 font-medium">Giriş Yap</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
