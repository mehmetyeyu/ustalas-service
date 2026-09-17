// Vitrin fiyatı — hem landing (/elevire) hem Abonelik (/admin/billing)
// sayfası AYNI USD rakamlarını göstermeli, tek kaynaktan okunur (iki ayrı
// dosyada birbirinden habersiz iki sabit vardı, kullanıcı fark etti).
// DİKKAT: bu sadece VİTRİN fiyatı — gerçek tahsilat/otomatik yenileme
// iyzico'daki SABİT TRY plan fiyatı üzerinden yapılır (bkz.
// scripts/iyzico-setup.mjs notu), o gün geçerli kurdan YENİDEN
// hesaplanmaz. İkisi zamanla birbirinden sapabilir, bkz. plan fiyatının
// periyodik güncellenmesi notu.
export const USD_REFERENCE_PRICING = { monthly: 25, yearly: 250 } as const;

// USD/TRY kuru — hem herkese açık landing sayfasında (src/app/elevire/
// page.tsx) hem /admin/billing'de (gerçek iyzico plan fiyatlarının TL
// karşılığını göstermek için, bkz. /api/billing/plans) kullanılır. TCMB'nin
// resmi, ücretsiz döviz kuru feed'inden çekilir — Türk kullanıcıya "TCMB
// kuruyla" demek hem resmi hem güvenilir. XML'in yapısı çok basit/stabil
// olduğundan (kamu feed'i, nadiren değişir) yeni bir XML parser
// bağımlılığı eklemek yerine hedefli bir regex kullanılıyor. Satış kuru
// (ForexSelling) kullanılır — bir dolar fiyatının TL karşılığını
// tüketiciye gösterirken referans alınan kur bu.
export async function getUsdTryRate(): Promise<number | null> {
  try {
    const res = await fetch("https://www.tcmb.gov.tr/kurlar/today.xml", {
      next: { revalidate: 21600 },
    });
    if (!res.ok) return null;
    const xml = await res.text();
    const usdBlockMatch = xml.match(/<Currency[^>]*Kod="USD"[^>]*>([\s\S]*?)<\/Currency>/);
    if (!usdBlockMatch) return null;
    const sellingMatch = usdBlockMatch[1].match(/<ForexSelling>([\d.]+)<\/ForexSelling>/);
    if (!sellingMatch) return null;
    const rate = parseFloat(sellingMatch[1]);
    return Number.isFinite(rate) && rate > 0 ? rate : null;
  } catch {
    return null;
  }
}

export function formatTry(amount: number): string {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(amount);
}

// Kurun kendisi (ör. "1 USD ≈ 48,64 TL") — tutarlardan farklı olarak
// burada 2 ondalık basamak gösterilir, aksi halde kur farkı hissedilmez
// düzeyde yuvarlanırdı.
export function formatTry2(amount: number): string {
  return new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}
