// Sipariş Listesi'nin kalınan yeri (sayfa, filtreler, arama, sıralama, sayfa
// boyutu): yalnızca bir siparişin Detay/Düzelt sayfasından geri dönüşte
// kullanılır. Kullanıcı Siparişler bölümünden çıkıp (ör. Ürünler) yeniden
// gelirse liste baştan açılır — kayıt çıkışta silinir (bkz. admin/layout.tsx).
// sessionStorage: sekme kapanınca biter. Erişim hatası sessizce yoksayılır.
export const ORDERS_LIST_STATE_KEY = "orders_list_state_v1";

export function isOrdersPath(pathname: string): boolean {
  return pathname === "/admin/orders" || pathname.startsWith("/admin/orders/");
}

export function dropOrdersListStateOutside(pathname: string): void {
  if (!isOrdersPath(pathname)) dropOrdersListState();
}

// Sipariş formu ("/") panel düzeninin dışında; kendisi çağırır.
export function dropOrdersListState(): void {
  try { sessionStorage.removeItem(ORDERS_LIST_STATE_KEY); } catch { /* depolama kapalı */ }
}
