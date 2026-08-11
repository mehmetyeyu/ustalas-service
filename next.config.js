/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    const securityHeaders = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ];

    if (process.env.NODE_ENV === "production") {
      securityHeaders.push(
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains",
        },
        {
          key: "Content-Security-Policy",
          value: [
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
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "form-action 'self'",
          ].join("; "),
        }
      );
    }

    return [{ source: "/:path*", headers: securityHeaders }];
  },
};
module.exports = nextConfig;
