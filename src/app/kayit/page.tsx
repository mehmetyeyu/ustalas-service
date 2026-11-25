"use client";

import { useState } from "react";
import { useToast } from "@/components/ToastProvider";
import { formatTurkishPhoneInput } from "@/lib/phone";
import MetaPixel, { trackMetaEvent } from "@/app/elevire/MetaPixel";

// Elevire landing'deki "7 gün ücretsiz dene" — kendi kendine kayıt, bkz.
// src/app/api/public/register/route.ts. Görünüm: elevire/AuthShell.tsx.
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
      await trackMetaEvent("CompleteRegistration");
      window.location.href = "/admin/orders";
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Hata oluştu.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <MetaPixel />
      <h1>Ücretsiz hesap oluştur</h1>
      <p className="sub">Kredi kartı gerekmez, hemen kullanmaya başla.</p>

      <form onSubmit={handleSubmit} className="signup-form">
        <label className="field">
          <span>Ad Soyad</span>
          <input type="text" autoComplete="name" value={contactName} onChange={(e) => setContactName(e.target.value)} required />
        </label>
        <label className="field">
          <span>İşletme Adı</span>
          <input type="text" autoComplete="organization" value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Ör. Yılmaz Lastik" required />
        </label>
        <label className="field">
          <span>E-posta</span>
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="field">
          <span>Telefon</span>
          <input type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(formatTurkishPhoneInput(e.target.value))} placeholder="0555 123 45 67" required />
        </label>
        <label className="field half">
          <span>Şifre</span>
          <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="En az 6 karakter" required />
        </label>
        <label className="field half">
          <span>Şifre (Tekrar)</span>
          <input type="password" autoComplete="new-password" value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} required />
        </label>

        <label className="consent">
          <input type="checkbox" checked={acceptedPrivacyPolicy} onChange={(e) => setAcceptedPrivacyPolicy(e.target.checked)} required />
          <span>
            Kayıt olarak{" "}
            <a href="/elevire/legal/gizlilik" target="_blank" rel="noopener noreferrer">Gizlilik Sözleşmesi</a>
            &apos;ni okudum ve kabul ediyorum.
          </span>
        </label>

        <button type="submit" disabled={loading || !acceptedPrivacyPolicy} className="btn btn-primary">
          {loading ? "Hesap oluşturuluyor…" : "Ücretsiz hesabını aç"}
        </button>
      </form>
    </>
  );
}
