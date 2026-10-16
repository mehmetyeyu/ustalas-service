// Herkese açık randevu sayfası (iframe ile gömülen) — sayfa tamamen istemci
// tarafında çalışıyor (veriyi /meta ile tarayıcıda çekiyor), sunucuda
// firmaya özel hiçbir şey üretilmiyor. Bu yüzden her ziyarette fonksiyon
// çalıştırmak yerine slug başına ilk istekte statik üretilip Vercel CDN'inden
// sunulur (ISR). Yoğun bir sitede iframe'in her görüntülenmesi bir fonksiyon
// çağrısı/CPU demekti (bkz. /meta route'undaki CDN önbelleği notu).
export const revalidate = 3600;

// Boş liste: build sırasında hiçbir slug önceden üretilmez, her slug ilk
// ziyarette üretilip önbelleğe alınır.
export function generateStaticParams() {
  return [];
}

export default function RandevuLayout({ children }: { children: React.ReactNode }) {
  return children;
}
