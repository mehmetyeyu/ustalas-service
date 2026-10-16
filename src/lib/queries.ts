import { useQuery, type QueryClient } from "@tanstack/react-query";

// Sunucu verisi için sorgu anahtarları ve hook'lar (TanStack Query, bkz.
// src/components/QueryProvider.tsx). Bir sayfa sunucudan veri okurken fetch
// yazmak yerine buradaki hook'u kullanır; aynı veri sayfalar arasında
// önbellekten paylaşılır, aynı anda giden aynı istekler teke düşer.
//
// Anahtarlar tek yerden tanımlıdır — bir yazma işleminden sonra ilgili veriyi
// tazelemek için (queryClient.invalidateQueries({ queryKey: queryKeys.x }))
// aynı sabit kullanılır, elle yazılmış bir dizi ile sapma olmaz.
export const queryKeys = {
  me: ["me"] as const,
  services: ["services"] as const,
  suppliers: ["suppliers"] as const,
  kasalar: ["kasalar"] as const,
  customers: ["customers"] as const,
  companyInfo: ["company-info"] as const,
  // Ürünlerden türeyen listeler ortak "products" öneki altında — ürünle ilgili
  // herhangi bir değişiklikte invalidateQueries({ queryKey: queryKeys.products })
  // hepsini birden tazeler.
  products: ["products"] as const,
  productSizes: ["products", "sizes"] as const,
  productBrands: ["products", "brands"] as const,
  // Siparişlerde gerçekten kullanılmış ödeme şekilleri (filtre seçenekleri).
  orderPaymentTypes: ["orders", "payment-types"] as const,
};

// Önbelleği artık TanStack yönettiği için tarayıcının HTTP önbelleği (bazı
// GET route'larının Cache-Control başlığı) atlanır — yoksa invalidate sonrası
// yapılan yeniden çekme tarayıcıdan eski yanıtı alabilirdi.
export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json() as Promise<T>;
}

// /api/auth/me yanıtı (snake_case) — bkz. src/app/api/auth/me/route.ts.
export interface MeResponse {
  username: string; role: string; permissions?: string[]; business_name?: string; panel_logo_url?: string | null;
  billing_status?: string | null; trial_ends_at?: string | null; plan?: string | null;
  billing_cancel_at_period_end?: boolean; billing_period_ends_at?: string | null; billing_last_payment_error?: string | null;
  is_primary_admin?: boolean; onboarding_tour_completed_at?: string | null;
  custom_order_no_enabled?: boolean; plate_required?: boolean;
  payment_types?: string[]; storage_overdue_months?: number; orders_default_date_filter?: string;
}

// Oturum yoksa (401) hata değil null — "giriş yapılmamış" geçerli bir durum.
async function fetchMe(): Promise<MeResponse | null> {
  const res = await fetch("/api/auth/me", { cache: "no-store" });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`/api/auth/me → ${res.status}`);
  return res.json() as Promise<MeResponse>;
}

// Oturum + sık okunan firma ayarları. 5 dk taze sayılır: panel ile sipariş
// formu arasında gidip gelmek tekrar istemez. Genel Ayarlar kaydedilince
// (ve başka sekmede kaydedilince, bkz. AuthContext BroadcastChannel) anında
// tazelenir.
export function useMe() {
  return useQuery({ queryKey: queryKeys.me, queryFn: fetchMe, staleTime: 5 * 60 * 1000 });
}

// --- Az değişen listeler -----------------------------------------------------
// Bir kez çekilip sayfalar arasında paylaşılır; aşağıdaki süre boyunca taze
// sayılır. Asıl tazelik, değiştiren işlemden sonra invalidate ile sağlanır
// (bkz. invalidateAfter) — süre sadece başka bir kullanıcının/cihazın
// yaptığı değişikliğin en geç ne zaman görüneceğini belirler.
const REFERENCE_STALE_MS = 10 * 60 * 1000;

export interface ServiceItem {
  id: number;
  name: string;
  price: number | string | null;
  tracks_size: boolean;
  bookable?: boolean;
  duration_minutes?: number | null;
}
export interface SupplierItem { id: number; name: string }
export interface KasaItem { id: number; name: string; linked_payment_type: string | null; currency: string }
export interface CustomerItem { id: number; name: string; phone: string | null }

export function useServices() {
  return useQuery({ queryKey: queryKeys.services, queryFn: () => fetchJson<ServiceItem[]>("/api/services"), staleTime: REFERENCE_STALE_MS });
}
export function useSuppliers() {
  return useQuery({ queryKey: queryKeys.suppliers, queryFn: () => fetchJson<SupplierItem[]>("/api/suppliers"), staleTime: REFERENCE_STALE_MS });
}
export function useKasalar() {
  return useQuery({ queryKey: queryKeys.kasalar, queryFn: () => fetchJson<KasaItem[]>("/api/kasalar"), staleTime: REFERENCE_STALE_MS });
}
// Siparişte/randevuda/tahsilatta otomatik kaydedildiği için diğerlerinden daha
// sık değişir — daha kısa süre taze sayılır (sipariş kaydı ayrıca invalidate eder).
export function useCustomers() {
  return useQuery({ queryKey: queryKeys.customers, queryFn: () => fetchJson<CustomerItem[]>("/api/customers"), staleTime: 2 * 60 * 1000 });
}
export function useProductSizes() {
  return useQuery({ queryKey: queryKeys.productSizes, queryFn: () => fetchJson<string[]>("/api/products/sizes"), staleTime: REFERENCE_STALE_MS });
}
export function useProductBrands() {
  return useQuery({ queryKey: queryKeys.productBrands, queryFn: () => fetchJson<string[]>("/api/products/brands"), staleTime: REFERENCE_STALE_MS });
}
export function useOrderPaymentTypes() {
  return useQuery({ queryKey: queryKeys.orderPaymentTypes, queryFn: () => fetchJson<string[]>("/api/orders/payment-types"), staleTime: REFERENCE_STALE_MS });
}
export function useCompanyInfo<T>() {
  return useQuery({ queryKey: queryKeys.companyInfo, queryFn: () => fetchJson<T>("/api/company-info"), staleTime: REFERENCE_STALE_MS });
}

// --- Yazma işlemlerinden sonra tazeleme ------------------------------------
// Hangi işlemin hangi listeleri değiştirdiği TEK yerde: sunucu bazı listeleri
// dolaylı olarak da değiştiriyor (sipariş kaydı yeni müşteri/tedarikçi/hizmet
// adını otomatik kaydeder — bkz. upsertDirectoryNames, resolveServiceIds,
// auto_register_customers; stok düşer). Yeni bir yazma yolu eklenirse buraya
// da eklenmeli, yoksa ilgili liste en fazla staleTime kadar eski kalır.
const AFFECTS = {
  order: [queryKeys.customers, queryKeys.suppliers, queryKeys.services, queryKeys.products, queryKeys.orderPaymentTypes],
  product: [queryKeys.suppliers, queryKeys.products],
  service: [queryKeys.services],
  supplier: [queryKeys.suppliers],
  kasa: [queryKeys.kasalar],
  customer: [queryKeys.customers],
  companyInfo: [queryKeys.companyInfo],
} as const;

export function invalidateAfter(queryClient: QueryClient, what: keyof typeof AFFECTS) {
  return Promise.all(AFFECTS[what].map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}
