import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getAuthUserByToken } from "@/lib/auth";
import { canAccessPath, getDefaultAdminPath } from "@/lib/permissions";

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

  // Admin rotaları — admin her zaman geçer (JWT-only, hızlı yol, DB'ye
  // gitmeden — davranış öncekiyle birebir aynı). staff için ise sayfa bazlı
  // izin kontrolü gerekiyor; bu, DB'den taze permissions gerektirir (bkz.
  // src/lib/permissions.ts canAccessPath) — o yüzden sadece staff durumunda
  // (öncesinde zaten hep "/" e atılan, hiç buraya giremeyen kullanıcılar)
  // yeni bir DB sorgusu ekleniyor.
  if (pathname.startsWith("/admin")) {
    if (!token) return NextResponse.redirect(new URL("/admin/login", request.url));
    const user = await verifyToken(token);
    if (!user) {
      const res = NextResponse.redirect(new URL("/admin/login", request.url));
      res.cookies.delete("auth_token");
      return res;
    }
    if (user.role === "admin") return NextResponse.next();

    const freshUser = await getAuthUserByToken(token);
    if (!freshUser) {
      const res = NextResponse.redirect(new URL("/admin/login", request.url));
      res.cookies.delete("auth_token");
      return res;
    }
    if (!canAccessPath(freshUser, pathname)) return NextResponse.redirect(new URL("/", request.url));
    return NextResponse.next();
  }

  // Ana sayfa — giriş yapmış herkes erişebilir. Giriş yapılmamışsa (Elevire'de
  // LANDING_REDIRECT tanımlıysa) pazarlama sayfasına, yoksa login'e yönlendirir —
  // ama zaten giriş yapmış birini asla landing'e göndermez (aksi halde "/"'ye
  // giden dahili linkler, ör. Sipariş Ekle, oturum açıkken bile landing'e düşerdi).
  if (pathname === "/") {
    const user = token ? await verifyToken(token) : null;
    if (!user) {
      const res = NextResponse.redirect(new URL(LANDING_REDIRECT || "/admin/login", request.url));
      if (token) res.cookies.delete("auth_token");
      return res;
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/admin/:path*"],
};
