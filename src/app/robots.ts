import type { MetadataRoute } from "next";

// / ve /admin/* oturum gerektiren dahili araçlar (Ustalas'ın gerçek işi) —
// arama motorlarının burayı taramasının hiçbir SEO değeri yok, sadece
// gereksiz crawl trafiği ve "giriş gerekli" sayfalarının dizine girmesi.
// /elevire ise tek genel-erişimli pazarlama sayfası, o yüzden ayrıca izinli.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/elevire",
      disallow: ["/", "/admin/", "/api/"],
    },
  };
}
