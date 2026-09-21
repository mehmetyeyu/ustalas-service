const { withSentryConfig } = require("@sentry/nextjs/config");

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    // /randevu/* kasıtlı olarak müşteri firmaların KENDİ web sitelerine
    // iframe/script ile gömülebilecek tek sayfa — bu yüzden X-Frame-Options
    // ve CSP'nin frame-ancestors'ı diğer tüm sayfalardan (özellikle /admin/*)
    // farklı olarak burada kısıtlanmıyor. Bu sayfa zaten kimlik doğrulamasız
    // ve hiçbir oturum/yetki taşımıyor (bkz. src/app/randevu/[slug]/page.tsx),
    // o yüzden clickjacking riski (başka bir kritik sayfayı gizlice
    // tıklatma) burada anlamlı değil — DENY'nin asıl koruduğu /admin/* ve
    // diğer oturumlu sayfalar bu istisnaya hiç girmiyor.
    const commonHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ];
    const lockedHeaders = [...commonHeaders, { key: "X-Frame-Options", value: "DENY" }];

    if (process.env.NODE_ENV === "production") {
      const hsts = {
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains",
      };
      commonHeaders.push(hsts);
      lockedHeaders.push(hsts);

      const cspBase = [
        "default-src 'self'",
        // 'unsafe-inline' gerekli: Next.js App Router her sayfada
        // hydration/streaming verisini inline <script> ile gönderir
        // (self.__next_f.push(...)) ve bu proje kullandığı Next 14.2
        // sürümünde bu script'lere otomatik nonce uygulamıyor — nonce
        // tabanlı bir script-src denendi, inline script'ler bloklanıp
        // hydration'ı komple kırdı (canlıda yaşandı). 'unsafe-inline'
        // olmadan bu framework'te güvenilir bir CSP kurulamıyor; kod
        // tabanında dangerouslySetInnerHTML/eval yok, tüm SQL
        // parametreli, bu yüzden artık risk kabul edilebilir.
        // iyzico Checkout Form (/admin/billing, bkz. src/lib/iyzico.ts)
        // kendi barındırdığı bir script bundle'ı (sandbox-static.iyzipay.com
        // veya prod'da static.iyzipay.com) enjekte edip iyzico'nun kendi
        // API/gateway subdomain'lerine (sandbox-api/merchantgw/
        // consumerapigw.iyzipay.com) bağlanıyor — hepsi *.iyzipay.com altında
        // olduğundan tek bir wildcard yeterli. Gerçek bir production
        // denemesinde 3D Secure adımının farklı bir domain (banka sayfası)
        // gerektirdiği görülürse burası genişletilmeli.
        "script-src 'self' 'unsafe-inline' https://*.iyzipay.com",
        "style-src 'self' 'unsafe-inline'",
        // *.public.blob.vercel-storage.com: Firma Logosu/Panel Logosu/Kaşe
        // (bkz. src/app/api/company-info/assets/route.ts) — her Vercel Blob
        // store'u kendi rastgele alt alan adını kullanıyor (ör.
        // rxi4mvrnlkr1y2pv.public.blob.vercel-storage.com), o yüzden joker
        // karakter gerekiyor, tek bir sabit domain yeterli değil.
        "img-src 'self' data: https://*.iyzipay.com https://*.public.blob.vercel-storage.com",
        "font-src 'self'",
        // *.ingest.us.sentry.io: hata izleme (Sentry) client SDK'sının
        // tarayıcıdan doğrudan gönderdiği event istekleri — bkz.
        // src/instrumentation-client.ts. Bu olmadan Sentry sessizce CSP'ye
        // takılıp hiç event göndermez (Vercel Blob img-src'de yaşanan
        // sorunla aynı sınıf hata, önceden düzeltildi).
        "connect-src 'self' https://*.iyzipay.com https://*.ingest.us.sentry.io",
        "frame-src 'self' https://*.iyzipay.com",
        "base-uri 'self'",
        "form-action 'self'",
      ];
      lockedHeaders.push({
        key: "Content-Security-Policy",
        value: [...cspBase, "frame-ancestors 'none'"].join("; "),
      });
      commonHeaders.push({
        key: "Content-Security-Policy",
        // frame-ancestors * : herhangi bir müşteri firma kendi domaininden
        // gömebilsin diye — hangi domainlerin gömeceği önceden bilinmiyor
        // (bkz. proje planı, çoklu firma hedefi), o yüzden belirli bir
        // domain listesiyle sınırlamak pratik değil.
        value: [...cspBase, "frame-ancestors *"].join("; "),
      });
    }

    return [
      { source: "/randevu/:path*", headers: commonHeaders },
      { source: "/((?!randevu).*)", headers: lockedHeaders },
    ];
  },
};
module.exports = withSentryConfig(nextConfig, {
  org: "yeyu",
  project: "javascript-nextjs",
  silent: !process.env.CI,
  // Source map yüklemek için SENTRY_AUTH_TOKEN gerekiyor (henüz eklenmedi) —
  // token yoksa build sadece uyarı verir, başarısız olmaz.
  widenClientFileUpload: true,
  webpack: {
    treeshake: { removeDebugLogging: true },
    // Vercel Cron job monitörü (reprice-subscriptions) ayrı bir özellik,
    // şimdilik kapsamda değil.
    automaticVercelMonitors: false,
  },
});
