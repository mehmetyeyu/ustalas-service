// Yeni görünüm yan menüsünün kişiye özel kısmının (görünen menü öğeleri,
// firma adı/logosu, kullanıcı adı, rol) tarayıcı kopyası. Sayfa açılırken
// menü /api/auth/me cevabını beklemeden bu kopyayla hemen çizilir; cevap
// gelince gerçek değerlerle doğrulanıp kopya tazelenir (admin/layout.tsx,
// StandaloneShellV2). Kopya yoksa (ilk giriş, yeni cihaz) menü öğeleri cevap
// gelene kadar boş kalır — izni olmayan bir personele bir an tüm menüyü
// göstermemek için. Çıkışta silinir (forgetUiPref).
const KEY = "ui-shell";

export interface ShellCache {
  nav: string[];
  settings: string[];
  businessName: string;
  panelLogoUrl: string | null;
  username: string;
  roleLabel: string;
}

export function readShellCache(): ShellCache | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ShellCache) : null;
  } catch {
    return null;
  }
}

export function writeShellCache(cache: ShellCache): void {
  try {
    const next = JSON.stringify(cache);
    if (localStorage.getItem(KEY) !== next) localStorage.setItem(KEY, next);
  } catch {
    // localStorage kapalı olabilir — menü yalnızca cevabı bekler.
  }
}

export function clearShellCache(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // yoksay
  }
}
