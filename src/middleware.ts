import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";

// Sadece pazarlama/demo dağıtımlarında (ör. Elevire) set edilir — ayarlıysa
// kök yol dahili sipariş aracı yerine doğrudan landing sayfasına yönlendirir.
// Ustalas'ın kendi prod ortamında bu değişken tanımlı değildir, davranış değişmez.
const LANDING_REDIRECT = process.env.LANDING_REDIRECT;

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("auth_token")?.value;

  if (pathname === "/" && LANDING_REDIRECT) {
    return NextResponse.redirect(new URL(LANDING_REDIRECT, request.url));
  }

  // Login sayfası — zaten giriş yapmışsa yönlendir
  if (pathname === "/admin/login") {
    if (token) {
      const user = await verifyToken(token);
      if (user) {
        const dest = user.role === "admin" ? "/admin/orders" : "/";
        return NextResponse.redirect(new URL(dest, request.url));
      }
    }
    return NextResponse.next();
  }

  // Admin rotaları — admin rolü gerekli
  if (pathname.startsWith("/admin")) {
    if (!token) return NextResponse.redirect(new URL("/admin/login", request.url));
    const user = await verifyToken(token);
    if (!user) {
      const res = NextResponse.redirect(new URL("/admin/login", request.url));
      res.cookies.delete("auth_token");
      return res;
    }
    if (user.role !== "admin") return NextResponse.redirect(new URL("/", request.url));
    return NextResponse.next();
  }

  // Ana sayfa — giriş yapmış herkes erişebilir
  if (pathname === "/") {
    if (!token) return NextResponse.redirect(new URL("/admin/login", request.url));
    const user = await verifyToken(token);
    if (!user) {
      const res = NextResponse.redirect(new URL("/admin/login", request.url));
      res.cookies.delete("auth_token");
      return res;
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/admin/:path*"],
};
