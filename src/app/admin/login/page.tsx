"use client";

import { useState } from "react";
import { getDefaultAdminPath } from "@/lib/permissions";
import { useToast } from "@/components/ToastProvider";

// Görünüm: elevire/AuthShell.tsx (landing ile aynı tema). Başlık sabit: Firma Kodu yazıldıkça firmanın adını gösteren önizleme
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
    <>
      <h1>Giriş yap</h1>
      <p className="sub">{LOGIN_TITLE}</p>

      <form onSubmit={handleSubmit} className="signup-form">
        <label className="field">
          <span>Firma Kodu</span>
          <input
            type="text"
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="125092"
            maxLength={6}
            required
          />
        </label>
        <label className="field">
          <span>Kullanıcı Adı veya E-posta</span>
          <input type="text" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="admin" autoCapitalize="none" required />
        </label>
        <label className="field">
          <span>Şifre</span>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
        </label>
        <label className="consent">
          <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
          <span>Beni Hatırla</span>
        </label>
        <button type="submit" disabled={loading} className="btn btn-primary">
          {loading ? "Giriş yapılıyor…" : "Giriş yap"}
        </button>
      </form>
    </>
  );
}
