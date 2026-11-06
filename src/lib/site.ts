// Pazarlama markası Elevire'in genel adresi. lastik.yeyu.co müşterilere
// verilen PANEL giriş adresidir — arama motorlarına asıl adres olarak her
// zaman burası bildirilir (canonical, sitemap, robots). Eskiden canonical
// VERCEL_PROJECT_PRODUCTION_URL'den (= lastik.yeyu.co) üretiliyordu; Google
// elevire.yeyu.co'yu kopya sayıp "elevire" aramasında göstermiyordu.
// Marka alan adına (ör. elevire.com) geçilirse yalnızca burası değişir.
export const ELEVIRE_HOSTNAME = "elevire.yeyu.co";
export const ELEVIRE_ORIGIN = `https://${ELEVIRE_HOSTNAME}`;
