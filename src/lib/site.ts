// Pazarlama markası Elevire'in genel adresi. lastik.yeyu.co müşterilere
// verilen PANEL giriş adresidir — arama motorlarına asıl adres olarak her
// zaman burası bildirilir (canonical, sitemap, robots). Eskiden canonical
// VERCEL_PROJECT_PRODUCTION_URL'den (= lastik.yeyu.co) üretiliyordu; Google
// elevire.yeyu.co'yu kopya sayıp "elevire" aramasında göstermiyordu.
// Marka alan adına (ör. elevire.com) geçilirse yalnızca burası değişir.
export const ELEVIRE_HOSTNAME = "elevire.yeyu.co";
export const ELEVIRE_ORIGIN = `https://${ELEVIRE_HOSTNAME}`;

// Elevire'in resmi sosyal hesapları — landing'in alt bilgisinde bağlantı ve
// yapılandırılmış verideki sameAs olarak çıkar (Google markayı bu hesaplarla
// eşler). Hesap eklemek için buraya tam profil adresini yazmak yeterli.
// Şimdilik şirketin (Yeyu) hesabı — Elevire paylaşımları buradan yapılıyor.
export const SOCIAL_LINKS: { label: string; href: string }[] = [
  { label: "Instagram", href: "https://www.instagram.com/yeyu.co/" },
];
