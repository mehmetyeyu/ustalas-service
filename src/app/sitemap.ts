import type { MetadataRoute } from "next";
import { ELEVIRE_ORIGIN } from "@/lib/site";

// Yalnızca genel pazarlama sayfaları; panel (lastik.yeyu.co) dizine girmez.
// Adresler her host'ta elevire.yeyu.co'yu gösterir (bkz. src/lib/site.ts).
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${ELEVIRE_ORIGIN}/`, changeFrequency: "weekly", priority: 1 },
    ...["hakkimizda", "gizlilik", "mesafeli-satis-sozlesmesi", "iptal-ve-iade"].map((slug) => ({
      url: `${ELEVIRE_ORIGIN}/elevire/legal/${slug}`,
      changeFrequency: "yearly" as const,
      priority: 0.3,
    })),
  ];
}
