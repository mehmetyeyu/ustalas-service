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
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self'",
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
module.exports = nextConfig;
