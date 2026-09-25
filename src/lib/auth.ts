import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import * as Sentry from "@sentry/nextjs";
import pool from "./db";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET!);
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "8h";
// "Beni Hatırla" — giriş formundaki opsiyonel kutu işaretlenirse (bkz.
// /api/auth/login, admin/login/page.tsx) hem JWT'nin hem cookie'nin ömrü
// bununla değiştirilir; işaretlenmezse mevcut davranış (JWT_EXPIRES_IN +
// 12 saatlik cookie) hiç değişmeden kalır. İkisi TEK yerden (burada)
// türetildiği için birbirinden asla sapmaz.
export const REMEMBER_ME_EXPIRES_IN = "30d";
export const REMEMBER_ME_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export interface JwtPayload {
  userId: number;
  username: string;
  role: string;
  permissions?: string[];
  // role/permissions gibi tenantId de asla JWT imzasından güvenilmez —
  // sadece getAuthUserByToken'ın döndürdüğü nesnede, her istekte taze DB
  // okumasıyla doldurulur (bkz. getAuthUserByToken). Henüz geri
  // doldurulmamış (çok eski) bir kullanıcı için null olabilir.
  tenantId?: number | null;
  // Faturalandırma kilidi (bkz. src/lib/billing.ts, src/middleware.ts) —
  // role/permissions gibi bunlar da her istekte DB'den taze okunur, JWT'ye
  // hiç gömülmez.
  billingStatus?: string | null;
  trialEndsAt?: string | null;
  plan?: string | null;
  billingCancelAtPeriodEnd?: boolean | null;
  billingPeriodEndsAt?: string | null;
  // Son başarısız otomatik yenileme denemesinin iyzico'dan gelen (zaten
  // Türkçe) sebep mesajı — bkz. src/app/api/webhooks/iyzico/route.ts.
  billingLastPaymentError?: string | null;
  // Onboarding turu (bkz. src/lib/onboardingTour.ts) kimin görmesi
  // gerektiğini belirlemek için — billingStatus/trialEndsAt gibi bunlar da
  // her istekte DB'den taze okunur, JWT'ye hiç gömülmez.
  isPrimaryAdmin?: boolean;
  onboardingTourCompletedAt?: string | null;
  iat?: number;
  iatMs?: number;
}

export async function signToken(payload: JwtPayload, expiresIn: string = JWT_EXPIRES_IN): Promise<string> {
  // iat (jose/JWT standardı) saniyeye yuvarlanır — zorla oturum sonlandırma
  // (tokens_invalid_before) kontrolü milisaniye hassasiyeti gerektirdiğinden
  // ayrıca iatMs de gömülür (bkz. getAuthUser).
  return await new SignJWT({ ...payload, iatMs: Date.now() })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as JwtPayload;
  } catch {
    return null;
  }
}

// Yetki (role/permissions) her istekte DB'den taze okunur — JWT sadece
// kimliği (userId) doğrulamak için kullanılır. Böylece bir kullanıcının rolü
// veya izinleri değiştirildiğinde ya da hesabı silindiğinde, elindeki eski
// token süresi dolmadan bile artık eski yetkisiyle işlem yapamaz (aksi
// halde token süresine kadar, ör. 8 saat, yetkisi geri alınamazdı). Aynı
// taze-okuma pratiği hesap devre dışı bırakma ve zorla oturum sonlandırma
// (tokens_invalid_before) için de kullanılır — bkz. src/app/api/users/[id]/route.ts.
//
// Gövde `getAuthUserByToken` olarak ayrı tutulur çünkü middleware.ts (Edge
// runtime) `next/headers`'ın `cookies()`'ini kullanamaz — NextRequest'ten
// token'ı zaten kendisi okur, aynı DB-taze mantığı doğrudan token ile çağırır.
export async function getAuthUserByToken(token: string): Promise<JwtPayload | null> {
  const payload = await verifyToken(token);
  if (!payload) return null;

  const result = await pool.query(
    `SELECT u.username, u.role, u.permissions, u.is_active, u.tokens_invalid_before,
            u.is_primary_admin, u.onboarding_tour_completed_at,
            u.tenant_id, t.name AS tenant_name, t.is_active AS tenant_is_active,
            t.billing_status, t.trial_ends_at, t.plan,
            t.billing_cancel_at_period_end, t.billing_period_ends_at, t.billing_last_payment_error
     FROM users u
     LEFT JOIN tenants t ON t.id = u.tenant_id
     WHERE u.id = $1`,
    [payload.userId]
  );
  const user = result.rows[0];
  if (!user) return null;
  if (!user.is_active) return null;
  // tenant_id henüz geri doldurulmamış (çok eski/geçiş öncesi) kullanıcılarda
  // NULL olabilir — o durumda firma kontrolü atlanır. tenant_id atanmışsa ve
  // firma pasifleştirilmişse (ileride toplu askıya alma/faturalandırma için)
  // giriş reddedilir — is_active kontrolüyle birebir aynı mantık.
  if (user.tenant_id != null && user.tenant_is_active === false) return null;
  // Bu değişiklikten önce imzalanmış eski token'larda iatMs bulunmaz —
  // öyle bir durumda saniyeye yuvarlanmış standart iat'a düşülür (aşırı
  // uçlarda ~1 sn'lik belirsizlik payı olsa da, kontrolü tamamen atlamaktan
  // çok daha güvenlidir).
  const issuedAtMs = payload.iatMs ?? (payload.iat ? payload.iat * 1000 : undefined);
  if (
    user.tokens_invalid_before &&
    issuedAtMs &&
    issuedAtMs < new Date(user.tokens_invalid_before).getTime()
  ) {
    return null;
  }

  // Sentry'de hataları firma bazında filtreleyebilmek için — tek merkezden
  // (bu fonksiyondan) etiketlendiği için her route'a ayrı ayrı eklenmesi
  // gerekmiyor. Sadece bu isteğin izole scope'unu etiketler, global durum
  // değiştirmez (bkz. @sentry/nextjs'in Next.js için otomatik istek
  // izolasyonu).
  Sentry.setTag("tenant_id", user.tenant_id ?? "yok");
  Sentry.setTag("tenant_name", user.tenant_name ?? "yok");
  Sentry.setUser({ id: String(payload.userId), username: user.username });

  return {
    userId: payload.userId,
    username: user.username,
    role: user.role,
    permissions: user.permissions ?? [],
    tenantId: user.tenant_id ?? null,
    billingStatus: user.billing_status ?? null,
    trialEndsAt: user.trial_ends_at ?? null,
    plan: user.plan ?? null,
    billingCancelAtPeriodEnd: user.billing_cancel_at_period_end ?? null,
    billingPeriodEndsAt: user.billing_period_ends_at ?? null,
    billingLastPaymentError: user.billing_last_payment_error ?? null,
    isPrimaryAdmin: user.is_primary_admin ?? false,
    onboardingTourCompletedAt: user.onboarding_tour_completed_at ?? null,
  };
}

export async function getAuthUser(): Promise<JwtPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;
  if (!token) return null;
  return getAuthUserByToken(token);
}
