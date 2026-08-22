"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { hasPermission } from "@/lib/permissions";

interface AuthUser {
  username: string;
  role: string;
  permissions: string[];
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
}

const AuthContext = createContext<AuthState>({ user: null, loading: true });

// AdminLayout'ta bir kez /api/auth/me çekilir, tüm /admin/* sayfaları bunu
// context'ten okur — her sayfa kendi fetch'ini tekrarlamaz. Nav filtreleme
// (layout) ve sayfa bazlı izin kontrolleri (her admin sayfası) bu context'i kullanır.
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        setState({
          user: data ? { username: data.username, role: data.role, permissions: data.permissions ?? [] } : null,
          loading: false,
        });
      })
      .catch(() => {
        if (!cancelled) setState({ user: null, loading: false });
      });
    return () => { cancelled = true; };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

// Yüklenirken (henüz /api/auth/me dönmediyse) her zaman true döner — sayfa
// guard'larının "henüz bilmiyoruz" anında kullanıcıyı yanlışlıkla dışarı
// atmaması için (bkz. her admin sayfasındaki guard deseni).
export function usePermission(key: string): boolean {
  const { user, loading } = useAuth();
  if (loading) return true;
  if (!user) return false;
  return hasPermission(user, key);
}

// Her admin sayfasının en üstünde çağrılır: "<resource>.view" izni yoksa
// (yükleme bitince) "/"'ye atar. Gerçek güvenlik sınırı zaten middleware +
// API route'larında — bu sadece düzgün bir UX (boş/kırık sayfa yerine anında
// yönlendirme). Sunucu tarafında yasak olan bir aksiyona API isteği atılırsa
// zaten 403 döner, bu guard'a bağlı değildir.
export function useViewGuard(resource: string): boolean {
  const { user, loading } = useAuth();
  const router = useRouter();
  const allowed = loading || (!!user && hasPermission(user, `${resource}.view`));

  useEffect(() => {
    if (!loading && !allowed) router.replace("/");
  }, [loading, allowed, router]);

  return allowed;
}
