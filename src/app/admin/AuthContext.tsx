"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { hasPermission } from "@/lib/permissions";

interface AuthUser {
  username: string;
  role: string;
  permissions: string[];
  businessName: string;
  // Faturalandırma (bkz. src/lib/billing.ts, /admin/billing) — deneme
  // geri sayımı banner'ı ve kilit sayfası bunları kullanır.
  billingStatus: string | null;
  trialEndsAt: string | null;
  plan: string | null;
  billingCancelAtPeriodEnd: boolean;
  billingPeriodEndsAt: string | null;
  billingLastPaymentError: string | null;
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
          user: data
            ? {
                username: data.username, role: data.role, permissions: data.permissions ?? [], businessName: data.business_name ?? "",
                billingStatus: data.billing_status ?? null, trialEndsAt: data.trial_ends_at ?? null, plan: data.plan ?? null,
                billingCancelAtPeriodEnd: !!data.billing_cancel_at_period_end, billingPeriodEndsAt: data.billing_period_ends_at ?? null,
                billingLastPaymentError: data.billing_last_payment_error ?? null,
              }
            : null,
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

// Yüklenirken (henüz /api/auth/me dönmediyse) false döner — useViewGuard'ın
// aksine (o "fail open" davranır, çünkü sayfa erişimi zaten middleware'de
// korunur). Burada "fail closed" gerekli: bu hook Düzenle/Sil/Onayla gibi
// aksiyon butonlarını göstermek için kullanılıyor — true dönseydi, izni
// olmayan bir staff kullanıcı /api/auth/me yanıtı gelene kadarki kısa anda
// (genelde birkaç yüz ms) o butonları görüp tıklayabilirdi; API isteği zaten
// 403 dönerdi ama buton yine de yanlışlıkla görünüp kaybolmuş olurdu.
export function usePermission(key: string): boolean {
  const { user, loading } = useAuth();
  if (loading) return false;
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
