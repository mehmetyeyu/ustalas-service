import { hasPermission, type PermissionUser } from "./permissions";

// Panel menüsü — hem panel layout'u (src/app/admin/layout.tsx) hem panelin
// dışındaki sipariş formu ("/", yeni görünümde aynı sol menüyle açılır, bkz.
// components/v2/StandaloneShellV2) buradan okur.

// `resource: null` → her authenticated kullanıcıya (admin da staff da) her
// zaman görünür. staff için görünürlük ilgili "<resource>.view" iznine bağlı
// — bkz. src/lib/permissions.ts (aynı kaynak/aksiyon taksonomisi).
export const NAV_ITEMS = [
  { href: "/admin/orders", label: "Siparişler", resource: "orders" },
  { href: "/admin/products", label: "Ürünler", resource: "products" },
  { href: "/admin/storage", label: "Depolama", resource: "storage" },
  { href: "/admin/reports", label: "Raporlar", resource: "reports" },
  { href: "/admin/kasa", label: "Kasa", resource: "kasa" },
  { href: "/admin/expenses", label: "Masraflar", resource: "expenses" },
  { href: "/admin/services", label: "Hizmetler", resource: "services" },
  { href: "/admin/customers", label: "Müşteriler", resource: "customers" },
  { href: "/admin/suppliers", label: "Tedarikçiler", resource: "suppliers" },
  { href: "/admin/shared-stock", label: "Paylaşılan Stok", resource: "shared_stock", isNew: true },
  { href: "/admin/appointments", label: "Randevular", resource: "appointments" },
  { href: "/admin/takvim", label: "Takvim", resource: "calendar", isNew: true },
  { href: "/admin/quotes", label: "Teklifler", resource: "quotes", isNew: true },
] as const;

// Kullanıcılar/Genel Ayarlar hiçbir zaman staff'a devredilemez (bkz. plan) —
// bu ikisi resource=null DEĞİL, "adminOnly" — staff için filtrelenirken
// koşulsuz elenir.
export const SETTINGS_ITEMS = [
  { href: "/admin/profile", label: "Profil", adminOnly: false },

  { href: "/admin/users", label: "Kullanıcılar", adminOnly: true },
  { href: "/admin/audit-log", label: "Aktivite Geçmişi", adminOnly: true },
  { href: "/admin/settings", label: "Genel Ayarlar", adminOnly: true },
  { href: "/admin/appointments/ayarlar", label: "Randevu Ayarları", adminOnly: true },
  { href: "/admin/appointments/gorunum", label: "Randevu Görünümü", adminOnly: true },
  // billing_status='exempt' (Ustalas, FB Lastik, Süper Admin'den elle
  // eklenenler) hiç faturalandırmaya girmez — bu firmalara "Abonelik"
  // menüsü hiç gösterilmez, bkz. görünürlük filtresi (visibleAdminNav).
  { href: "/admin/billing", label: "Abonelik", adminOnly: true },
    { href: "/admin/destek", label: "Destek", adminOnly: false },
  { href: "/admin/help", label: "Kullanım Kılavuzu", adminOnly: false },

] as const;

export type NavItem = { href: string; label: string; isNew?: boolean };

export const ROLE_LABELS: Record<string, string> = { admin: "Yönetici", staff: "Personel", super_admin: "Süper Admin" };

// Yüklenirken tüm linkler gösterilir (kısa an) — asıl erişim zaten
// middleware + her sayfanın kendi guard'ı ile korunuyor, bu sadece menünün
// görünürlüğü. admin için filtreleme hiç uygulanmaz (her zaman tam liste).
export function visibleAdminNav(
  user: (PermissionUser & { billingStatus: string | null }) | null,
  loading: boolean
): { navItems: readonly NavItem[]; settingsItems: readonly NavItem[] } {
  const navItems: readonly NavItem[] = loading || user?.role === "admin"
    ? NAV_ITEMS
    : NAV_ITEMS.filter((item) => user && hasPermission(user, `${item.resource}.view`));
  const settingsItems = (loading || user?.role === "admin"
    ? SETTINGS_ITEMS
    : SETTINGS_ITEMS.filter((item) => !item.adminOnly)
  ).filter((item) => item.href !== "/admin/billing" || (!loading && user?.billingStatus !== "exempt"));
  return { navItems, settingsItems };
}

// Yeni görünüm yan menüsü: /api/auth/me gelmeden (açılışta) tarayıcıdaki
// kopyadan (src/lib/shellCache.ts) hangi öğelerin görüneceği. Kopya yoksa
// boş — izni olmayana bir an tüm menü gösterilmesin.
export function cachedAdminNav(
  cache: { nav: string[]; settings: string[] } | null
): { navItems: readonly NavItem[]; settingsItems: readonly NavItem[] } {
  if (!cache) return { navItems: [], settingsItems: [] };
  return {
    navItems: NAV_ITEMS.filter((i) => cache.nav.includes(i.href)),
    settingsItems: SETTINGS_ITEMS.filter((i) => cache.settings.includes(i.href)),
  };
}
