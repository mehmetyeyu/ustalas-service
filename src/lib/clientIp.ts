import { NextRequest } from "next/server";

// Vercel (ve çoğu proxy/CDN), gerçek istemci IP'sini x-forwarded-for
// header'ının İLK değeri olarak iletir (sonraki değerler ara proxy'ler).
// Header yoksa (ör. lokal geliştirme) "bilinmiyor" döner — rate-limit
// sorgusu bu durumda da çalışır, sadece tüm lokal istekleri tek bir
// "kova"da toplar.
export function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "bilinmiyor";
}
