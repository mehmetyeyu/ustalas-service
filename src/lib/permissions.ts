// Sayfa/aksiyon bazlı yetki sistemi — tek doğruluk kaynağı. Hem sunucu (API
// route'lar, middleware) hem istemci (nav filtreleme, sayfa guard'ları)
// tarafından import edilir; DB'ye dokunmaz, saf fonksiyonlardır.
//
// `admin` rolü her zaman tam yetkilidir, bu dosyadaki kontrolleri hiç görmez.
// `staff` rolü için erişim, kullanıcının `permissions` dizisindeki
// "kaynak.aksiyon" (ör. "orders.view") kayıtlarıyla belirlenir.

export const RESOURCE_ACTIONS = {
  orders: ["view", "edit", "delete", "approve"],
  appointments: ["view", "create", "edit", "delete", "approve"],
  reports: ["view"],
  services: ["view", "create", "edit", "delete"],
  storage: ["view", "create", "edit", "delete"],
  products: ["view", "create", "edit", "delete"],
  customers: ["view", "create", "edit", "delete"],
  suppliers: ["view", "create", "edit", "delete"],
  expenses: ["view", "create", "edit", "delete"],
} as const;

export type Resource = keyof typeof RESOURCE_ACTIONS;

// Tüm geçerli "kaynak.aksiyon" anahtarlarının düz listesi — kullanıcı
// oluşturma/güncellemede gelen `permissions` değerlerini doğrulamak için.
export const ALL_PERMISSION_KEYS: string[] = Object.entries(RESOURCE_ACTIONS).flatMap(
  ([resource, actions]) => actions.map((action) => `${resource}.${action}`)
);

export function isValidPermissionKey(key: string): boolean {
  return ALL_PERMISSION_KEYS.includes(key);
}

interface PermissionUser {
  role: string;
  permissions?: string[] | null;
}

export function hasPermission(user: PermissionUser, key: string): boolean {
  if (user.role === "admin") return true;
  return (user.permissions ?? []).includes(key);
}

// Sayfa yolu → kaynak eşlemesi (middleware ve istemci sayfa guard'ları için).
// `resource: null` → herhangi bir oturum açmış kullanıcıya açık (ör. Profil).
// `resource: "__admin_only__"` → devredilemez, her zaman sadece role==='admin'.
export const PAGE_RESOURCE: { prefix: string; resource: Resource | null | "__admin_only__" }[] = [
  { prefix: "/admin/orders", resource: "orders" },
  // Daha spesifik olan /admin/appointments/ayarlar ve /admin/appointments/gorunum
  // altta genel appointments eşleşmesinden ÖNCE gelmeli — canAccessPath ilk
  // eşleşeni kullanıyor (.find).
  { prefix: "/admin/appointments/ayarlar", resource: "__admin_only__" },
  { prefix: "/admin/appointments/gorunum", resource: "__admin_only__" },
  { prefix: "/admin/appointments", resource: "appointments" },
  { prefix: "/admin/reports", resource: "reports" },
  { prefix: "/admin/services", resource: "services" },
  { prefix: "/admin/storage", resource: "storage" },
  { prefix: "/admin/products", resource: "products" },
  { prefix: "/admin/customers", resource: "customers" },
  { prefix: "/admin/suppliers", resource: "suppliers" },
  { prefix: "/admin/expenses", resource: "expenses" },
  { prefix: "/admin/profile", resource: null },
  { prefix: "/admin/users", resource: "__admin_only__" },
  { prefix: "/admin/settings", resource: "__admin_only__" },
];

export function canAccessPath(user: PermissionUser, pathname: string): boolean {
  if (user.role === "admin") return true;
  const match = PAGE_RESOURCE.find((r) => pathname.startsWith(r.prefix));
  if (!match || match.resource === null) return true;
  if (match.resource === "__admin_only__") return false;
  return hasPermission(user, `${match.resource}.view`);
}

// staff girişte ("/admin/login" sonrası) veya "/" sipariş formundan panele
// dönerken hangi sayfaya yönlendirileceğini belirler — src/app/admin/layout.tsx
// içindeki navItems ile aynı öncelik sırası. Kullanıcının erişebildiği ilk
// sayfayı döner; hiçbir sayfa izni yoksa null (o zaman header'da panel linki
// gösterilmez, sadece çıkış).
const LANDING_ORDER: Resource[] = [
  "orders", "appointments", "storage", "products", "reports", "expenses", "services", "customers", "suppliers",
];

export function getDefaultAdminPath(user: PermissionUser): string | null {
  if (user.role === "admin") return "/admin/orders";
  for (const resource of LANDING_ORDER) {
    if (hasPermission(user, `${resource}.view`)) return `/admin/${resource}`;
  }
  return null;
}
