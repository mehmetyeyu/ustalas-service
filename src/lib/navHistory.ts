// Panel içi gezinme geçmişi — "‹ Geri" bağlantılarının tarayıcı geçmişine
// güvenip güvenemeyeceğini bilmek için. Sayfa yeni sekmede/linkle doğrudan
// açıldıysa router.back() kullanıcıyı panelin DIŞINA (ya da boş sekmeye)
// götürürdü; o durumda geri bağlantısı bir varsayılan sayfaya gider.
// admin/layout.tsx her adres değişiminde noteInAppNavigation'ı çağırır. Aynı
// adres tekrar bildirilirse (ör. dev'de Strict Mode'un çift efekti) sayılmaz.
let lastPath: string | null = null;
let visitedCount = 0;

export function noteInAppNavigation(path: string): void {
  if (path === lastPath) return;
  lastPath = path;
  visitedCount += 1;
}

export function canGoBackInApp(): boolean {
  return visitedCount > 1;
}
