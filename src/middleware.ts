import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("auth_token")?.value;

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
