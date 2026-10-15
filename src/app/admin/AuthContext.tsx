"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { hasPermission } from "@/lib/permissions";

interface AuthUser {
  username: string;
  role: string;
  permissions: string[];
  businessName: string;
  panelLogoUrl: string | null;
  // Faturalandırma (bkz. src/lib/billing.ts, /admin/billing) — deneme
  // geri sayımı banner'ı ve kilit sayfası bunları kullanır.
  billingStatus: string | null;
  trialEndsAt: string | null;
  plan: string | null;
  billingCancelAtPeriodEnd: boolean;
  billingPeriodEndsAt: string | null;
  billingLastPaymentError: string | null;
  // Onboarding turu (bkz. src/lib/onboardingTour.ts) — admin/layout.tsx
  // bunlarla shouldShowOnboardingTour()'u çağırır.
  isPrimaryAdmin: boolean;
  onboardingTourCompletedAt: string | null;
  // Genel Ayarlar'daki "Sipariş Numarasını Elle Gir" (bkz. database/schema.sql
  // custom_order_no notu) — Randevular'daki "Siparişe Dönüştür" gibi
  // /api/orders POST'un DIŞINDA sipariş oluşturan ekranların bunu bilmesi için.
  customOrderNoEnabled: boolean;
  // Genel Ayarlar'daki "Araç Plakası Zorunlu" (bkz. database/schema.sql
  // plate_required notu) — Sipariş Detayı/Düzelt ekranının Plaka alanını
  // zorunlu mu gösterileceğini bilmesi için.
  plateRequired: boolean;
  // Genel Ayarlar'dan — önceden her sayfa (Siparişler, Sipariş Detayı,
  // Müşteriler, Kasa, Giderler, Depolama) açılışta admin-only /api/settings'i
  // sırf bunlar için ayrıca çağırıyordu (personelde 403 alıp varsayılana
  // düşüyordu). Artık /api/auth/me ile bir kez gelir, burada tutulur.
  paymentTypes: string[];
  storageOverdueMonths: number;
  ordersDefaultDateFilter: string;
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  // Genel Ayarlar kaydedilince çağrılır ki store'daki ayarlar (ödeme tipleri
  // vb.) sayfa yenilemeden diğer sayfalara yansısın.
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({ user: null, loading: true, refresh: async () => {} });

const SETTINGS_CHANNEL = "ustalas-settings";

// Genel Ayarlar kaydedilince çağrılır: diğer sekmelere haber verir (kendi
// sekmesi mesajı almaz, o refresh() ile tazelenir).
export function notifySettingsChanged() {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(SETTINGS_CHANNEL);
  channel.postMessage("changed");
  channel.close();
}

// /api/auth/me yanıtı (snake_case) — bkz. src/app/api/auth/me/route.ts.
interface MeResponse {
  username: string; role: string; permissions?: string[]; business_name?: string; panel_logo_url?: string | null;
  billing_status?: string | null; trial_ends_at?: string | null; plan?: string | null;
  billing_cancel_at_period_end?: boolean; billing_period_ends_at?: string | null; billing_last_payment_error?: string | null;
  is_primary_admin?: boolean; onboarding_tour_completed_at?: string | null;
  custom_order_no_enabled?: boolean; plate_required?: boolean;
  payment_types?: string[]; storage_overdue_months?: number; orders_default_date_filter?: string;
}

function toAuthUser(data: MeResponse): AuthUser {
  return {
    username: data.username, role: data.role, permissions: data.permissions ?? [], businessName: data.business_name ?? "",
    panelLogoUrl: data.panel_logo_url ?? null,
    billingStatus: data.billing_status ?? null, trialEndsAt: data.trial_ends_at ?? null, plan: data.plan ?? null,
    billingCancelAtPeriodEnd: !!data.billing_cancel_at_period_end, billingPeriodEndsAt: data.billing_period_ends_at ?? null,
    billingLastPaymentError: data.billing_last_payment_error ?? null,
    isPrimaryAdmin: !!data.is_primary_admin, onboardingTourCompletedAt: data.onboarding_tour_completed_at ?? null,
    customOrderNoEnabled: !!data.custom_order_no_enabled,
    plateRequired: data.plate_required !== false,
    paymentTypes: Array.isArray(data.payment_types) ? data.payment_types : [],
    storageOverdueMonths: typeof data.storage_overdue_months === "number" ? data.storage_overdue_months : 6,
    ordersDefaultDateFilter: typeof data.orders_default_date_filter === "string" ? data.orders_default_date_filter : "",
  };
}

// AdminLayout'ta bir kez /api/auth/me çekilir, tüm /admin/* sayfaları bunu
// context'ten okur — her sayfa kendi fetch'ini tekrarlamaz. Nav filtreleme
// (layout) ve sayfa bazlı izin kontrolleri (her admin sayfası) bu context'i kullanır.
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ user: AuthUser | null; loading: boolean }>({ user: null, loading: true });

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      const data = res.ok ? await res.json() : null;
      setState({ user: data ? toAuthUser(data) : null, loading: false });
    } catch {
      setState((prev) => ({ user: prev.user, loading: false }));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Store sekme başına tutulur — Genel Ayarlar bir sekmede kaydedilince
  // (bkz. notifySettingsChanged) aynı tarayıcıdaki diğer açık panel
  // sekmeleri de tazelensin (ör. açık duran Sipariş Detayı'nda yeni ödeme
  // tipi görünsün). Ayar kaydedilmedikçe hiç istek atılmaz.
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(SETTINGS_CHANNEL);
    channel.onmessage = () => { load(); };
    return () => channel.close();
  }, [load]);

  // value sabit tutulur (useMemo) — layout her navigasyonda yeniden render
  // olur, her seferinde yeni bir nesne verilseydi tüm useAuth() kullanan
  // sayfalar gereksiz yere yeniden render olurdu.
  const value = useMemo(() => ({ ...state, refresh: load }), [state, load]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
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
