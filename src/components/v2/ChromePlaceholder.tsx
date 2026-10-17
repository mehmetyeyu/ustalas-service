// Yeni görünüm çerçevesinin (yan menü + üst çubuk) yer tutucuları. Sayfa
// yenilenince açılış betiği <html data-ui="v2">'yi hemen koyar ama gerçek
// menü/üst çubuk kullanıcı tercihi (/api/auth/me) gelip bileşen kodu
// yüklenene kadar çizilmez — o arada içerik tam genişlikte çizilip menü
// gelince sağa (üst çubuk gelince aşağı) kayıyordu. Yer tutucular aynı
// ölçü/renkte alanı baştan ayırır. Yalnızca CSS ile (v2: varyantı) görünür:
// eski görünümde (data-ui yok) hiç görünmez, sunucu/istemci çıktısı aynı kalır.
// Ölçüler AdminShellV2'deki aside (w-[264px], lg'den itibaren) ve header
// (py-3 + 40px buton + 1px kenar = 65px) ile aynı tutulmalı.

export function V2SidebarPlaceholder() {
  return <div aria-hidden="true" className="pointer-events-none fixed inset-y-0 left-0 z-40 hidden w-[264px] bg-v2-sidebar v2:lg:block" />;
}

export function V2HeaderPlaceholder() {
  return <div aria-hidden="true" className="hidden h-[65px] border-b border-v2-line bg-v2-surface/90 v2:block" />;
}
