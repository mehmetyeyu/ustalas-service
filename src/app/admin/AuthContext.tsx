"use client";

import { createContext, useCallback, useContext, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { hasPermission } from "@/lib/permissions";
import { queryKeys, useMe, type MeResponse } from "@/lib/queries";
import { useBootUiV2 } from "@/lib/uiTheme";

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
  // Panel görünümü (bkz. database/schema.sql ui_version notu): v1 = bugünkü,
  // v2 = yeni "premium" görünüm; tema yalnızca v2'de anlamlı.
  uiVersion: "v1" | "v2";
  uiTheme: "system" | "light" | "dark";
  uiV2Available: boolean;
}

export type UiPreferences = { ui_version?: "v1" | "v2"; ui_theme?: "system" | "light" | "dark" };

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  // Genel Ayarlar kaydedilince çağrılır ki store'daki ayarlar (ödeme tipleri
  // vb.) sayfa yenilemeden diğer sayfalara yansısın.
  refresh: () => Promise<void>;
  // Görünüm/tema tercihini kaydeder; ekran yanıtı beklemeden değişir.
  setUiPreferences: (prefs: UiPreferences) => Promise<void>;
  // Yeni görünüm (v2) açık mı — /api/auth/me gelene kadar açılış betiğinin
  // çerezden koyduğu işarete göre (bkz. useBootUiV2), sonra kullanıcının
  // gerçek tercihine göre. Çerçeve ve sayfalar cevabı beklemeden çizilir.
  isV2: boolean;
}

const AuthContext = createContext<AuthState>({ user: null, loading: true, refresh: async () => {}, setUiPreferences: async () => {}, isV2: false });

const SETTINGS_CHANNEL = "ustalas-settings";

// Genel Ayarlar kaydedilince çağrılır: diğer sekmelere haber verir (kendi
// sekmesi mesajı almaz, o refresh() ile tazelenir).
export function notifySettingsChanged() {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(SETTINGS_CHANNEL);
  channel.postMessage("changed");
  channel.close();
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
    uiVersion: data.ui_version === "v2" ? "v2" : "v1",
    uiTheme: data.ui_theme === "light" || data.ui_theme === "dark" ? data.ui_theme : "system",
    uiV2Available: !!data.ui_v2_available,
  };
}

// /api/auth/me TanStack Query önbelleğinden okunur (bkz. useMe, kök layout'taki
// QueryProvider) — tüm /admin/* sayfaları bunu context'ten okur, her sayfa
// kendi fetch'ini tekrarlamaz; sipariş formu (/) da aynı önbelleği kullanır.
// Nav filtreleme (layout) ve sayfa bazlı izin kontrolleri (her admin sayfası)
// bu context'i kullanır. Dışarıya verilen şekil (user/loading/refresh) aynı
// kaldı — sayfalar TanStack'e doğrudan bağımlı değil.
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { data, isPending, refetch } = useMe();
  const user = useMemo(() => (data ? toAuthUser(data) : null), [data]);
  const refresh = useCallback(async () => { await refetch(); }, [refetch]);
  // İyimser güncelleme: önbellekteki /me hemen değişir (görünüm/tema anında
  // uygulanır), istek başarısız olursa sunucudaki hale geri çekilir.
  const setUiPreferences = useCallback(async (prefs: UiPreferences) => {
    queryClient.setQueryData<MeResponse | null>(queryKeys.me, (prev) => (prev ? { ...prev, ...prefs } : prev));
    const res = await fetch("/api/auth/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(prefs),
    }).catch(() => null);
    if (!res || !res.ok) await queryClient.invalidateQueries({ queryKey: queryKeys.me });
  }, [queryClient]);

  // Store sekme başına tutulur — Genel Ayarlar bir sekmede kaydedilince
  // (bkz. notifySettingsChanged) aynı tarayıcıdaki diğer açık panel
  // sekmeleri de tazelensin (ör. açık duran Sipariş Detayı'nda yeni ödeme
  // tipi görünsün). Ayar kaydedilmedikçe hiç istek atılmaz.
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(SETTINGS_CHANNEL);
    channel.onmessage = () => { queryClient.invalidateQueries({ queryKey: queryKeys.me }); };
    return () => channel.close();
  }, [queryClient]);

  // value sabit tutulur (useMemo) — layout her navigasyonda yeniden render
  // olur, her seferinde yeni bir nesne verilseydi tüm useAuth() kullanan
  // sayfalar gereksiz yere yeniden render olurdu.
  const bootV2 = useBootUiV2();
  const isV2 = isPending ? bootV2 : user?.uiVersion === "v2";
  const value = useMemo(() => ({ user, loading: isPending, refresh, setUiPreferences, isV2 }), [user, isPending, refresh, setUiPreferences, isV2]);
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
