import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { ELEVIRE_HOSTNAME, ELEVIRE_ORIGIN } from "@/lib/site";

// / ve /admin/* oturum gerektiren dahili araçlar (Ustalas'ın gerçek işi) —
// arama motorlarının burayı taramasının hiçbir SEO değeri yok, sadece
// gereksiz crawl trafiği ve "giriş gerekli" sayfalarının dizine girmesi.
// /elevire genel-erişimli pazarlama sayfaları, o yüzden ayrıca izinli.
//
// elevire.yeyu.co'da landing "/" yolunda sunulur (middleware rewrite) ve
// asıl adres odur (canonical) — orada yalnızca TAM kök ("/$") açılır, "/"
// altındaki uygulama sayfaları kapalı kalır (Google en uzun eşleşen kuralı
// uygular). Panel adresi lastik.yeyu.co'da kök login'e gittiği için kapalı.
export default async function robots(): Promise<MetadataRoute.Robots> {
  const isElevireHost = (await headers()).get("host") === ELEVIRE_HOSTNAME;
  return {
    rules: {
      userAgent: "*",
      allow: isElevireHost ? ["/$", "/elevire"] : "/elevire",
      disallow: ["/", "/admin/", "/api/"],
    },
    sitemap: `${ELEVIRE_ORIGIN}/sitemap.xml`,
  };
}
