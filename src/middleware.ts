import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getAuthUserByToken } from "@/lib/auth";
import { canAccessPath, getDefaultAdminPath } from "@/lib/permissions";
import { isBillingLocked } from "@/lib/billing";

// Sadece pazarlama/demo dağıtımlarında (ör. Elevire) set edilir — ayarlıysa
// kök yol dahili sipariş aracı yerine doğrudan landing sayfasına yönlendirir.
// Ustalas'ın kendi prod ortamında bu değişken tanımlı değildir, davranış değişmez.
const LANDING_REDIRECT = process.env.LANDING_REDIRECT;

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("auth_token")?.value;

  // Login sayfası — zaten giriş yapmışsa yönlendir
  if (pathname === "/admin/login") {
    if (token) {
      const user = await verifyToken(token);
      if (user) {
        // admin için hızlı yol (DB'ye gitmeden); staff için izinler DB'den
        // taze okunur — aksi halde erişimi olmayan bir sayfaya (ör. eski
        // JWT'deki bayat "/") yönlendirilebilir, bkz. getAuthUserByToken.
        if (user.role === "admin") {
          return NextResponse.redirect(new URL("/admin/orders", request.url));
        }
        const freshUser = await getAuthUserByToken(token);
        const dest = (freshUser && getDefaultAdminPath(freshUser)) || "/";
        return NextResponse.redirect(new URL(dest, request.url));
      }
    }
    return NextResponse.next();
  }

  // Süper Admin Paneli — hiçbir firmaya (tenant) ait olmayan, tüm firmaları
  // yönetebilen ayrı bir üst-düzey rol (bkz. src/app/super-admin/). Normal
  // /admin/* izin sistemine (canAccessPath) hiç girmez, doğrudan role kontrolü.
  if (pathname.startsWith("/super-admin")) {
    if (!token) return NextResponse.redirect(new URL("/admin/login", request.url));
    const user = await verifyToken(token);
    if (!user) {
      const res = NextResponse.redirect(new URL("/admin/login", request.url));
      res.cookies.delete("auth_token");
      return res;
    }
    const freshUser = await getAuthUserByToken(token);
    if (!freshUser || freshUser.role !== "super_admin") {
      const res = NextResponse.redirect(new URL("/admin/login", request.url));
      if (!freshUser) res.cookies.delete("auth_token");
      return res;
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/admin")) {
    if (!token) return NextResponse.redirect(new URL("/admin/login", request.url));
    const user = await verifyToken(token);
    if (!user) {
      const res = NextResponse.redirect(new URL("/admin/login", request.url));
      res.cookies.delete("auth_token");
      return res;
    }
    // Süper admin hiçbir firmaya ait değil, yanlışlıkla bir firmanın
    // paneline düşmesin.
    if (user.role === "super_admin") return NextResponse.redirect(new URL("/super-admin", request.url));

    // admin için eskiden burada JWT-only bir "hızlı yol" vardı (DB'ye hiç
    // gitmeden) — ama bu, bir firma Süper Admin Paneli'nden Pasif yapılsa
    // bile (bkz. src/app/super-admin/) o firmanın admin'inin sayfa
    // KABUĞUNU (gerçek veri değil, ilk API çağrısına kadar) hâlâ
    // görebilmesine yol açıyordu. Artık role ne olursa olsun DB'den taze
    // is_active/tenant_is_active/tokens_invalid_before kontrolü yapılıyor.
    const freshUser = await getAuthUserByToken(token);
    if (!freshUser) {
      const res = NextResponse.redirect(new URL("/admin/login", request.url));
      res.cookies.delete("auth_token");
      return res;
    }
    // Faturalandırma kilidi (bkz. src/lib/billing.ts) — tenants.is_active'ten
    // AYRI bir mekanizma: kullanıcı giriş yapabilir, sadece /admin/billing
    // dışındaki sayfalara yönlendirilmez (kendi kendine tekrar abone
    // olabilsin diye). role === "admin" bile bu kontrolden muaf değildir —
    // faturalandırmayı yönetmesi gereken tam olarak admin'dir.
    if (
      freshUser.tenantId != null &&
      !pathname.startsWith("/admin/billing") &&
      isBillingLocked({ billing_status: freshUser.billingStatus ?? null, trial_ends_at: freshUser.trialEndsAt ?? null })
    ) {
      return NextResponse.redirect(new URL("/admin/billing", request.url));
    }
    if (freshUser.role === "admin") return NextResponse.next();
    if (!canAccessPath(freshUser, pathname)) return NextResponse.redirect(new URL("/", request.url));
    return NextResponse.next();
  }

  // Ana sayfa — giriş yapmış herkes erişebilir. Giriş yapılmamışsa (Elevire'de
  // LANDING_REDIRECT tanımlıysa) pazarlama sayfasına, yoksa login'e yönlendirir —
  // ama zaten giriş yapmış birini asla landing'e göndermez (aksi halde "/"'ye
  // giden dahili linkler, ör. Sipariş Ekle, oturum açıkken bile landing'e düşerdi).
  // DB'den taze kontrol (getAuthUserByToken) kullanılır — sadece imza
  // doğrulaması (verifyToken) bir firma Pasif yapıldığında bu en sık
  // ziyaret edilen sayfanın kabuğunun hâlâ görünmesine yol açardı (bkz.
  // /admin bloğundaki aynı düzeltme).
  if (pathname === "/") {
    if (!token) return NextResponse.redirect(new URL(LANDING_REDIRECT || "/admin/login", request.url));
    const user = await getAuthUserByToken(token);
    if (!user) {
      const res = NextResponse.redirect(new URL(LANDING_REDIRECT || "/admin/login", request.url));
      res.cookies.delete("auth_token");
      return res;
    }
    if (user.role === "super_admin") return NextResponse.redirect(new URL("/super-admin", request.url));
    if (
      user.tenantId != null &&
      isBillingLocked({ billing_status: user.billingStatus ?? null, trial_ends_at: user.trialEndsAt ?? null })
    ) {
      return NextResponse.redirect(new URL("/admin/billing", request.url));
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/admin/:path*", "/super-admin/:path*"],
};
