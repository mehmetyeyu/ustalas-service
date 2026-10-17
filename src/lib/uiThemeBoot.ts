// "use client" OLMAYAN modül — kök layout (sunucu bileşeni) açılış betiğini
// doğrudan <head>'e gömer, API rotaları da çerez yardımcılarını kullanır;
// client modülünden import edilseydi metin değil istemci referansı gelirdi.
// Mantığın geri kalanı src/lib/uiTheme.ts'te.
export const UI_PREF_STORAGE_KEY = "ui-pref";

// Görünüm tercihinin çerez kopyası ("v2.dark" biçiminde). Sunucu yazar:
// girişte (/api/auth/login), tercih değişince (/api/auth/preferences) ve her
// oturum kontrolünde (/api/auth/me — deploy öncesi açılmış oturumlar da
// kendiliğinden kazanır); çıkışta silinir. localStorage kopyası yalnızca
// sayfa bir kez yüklenip tercih sunucudan gelince yazılabildiğinden girişten
// sonraki ilk sayfada/yeni cihazda yoktu — ekran tercih gelene kadar eski
// (açık) görünümle çizilip sonra koyu temaya geçiyordu. HttpOnly değil:
// açılış betiği okur; içinde gizli bir bilgi yok.
export const UI_PREF_COOKIE = "ui-pref";
export const UI_PREF_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export function uiPrefCookieValue(version: string | null | undefined, theme: string | null | undefined): string {
  const v = version === "v2" ? "v2" : "v1";
  const t = theme === "light" || theme === "dark" ? theme : "system";
  return `${v}.${t}`;
}

export function uiPrefCookieOptions(maxAge = UI_PREF_COOKIE_MAX_AGE) {
  return {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

// Sayfa çizilmeden önce çalışır ve son bilinen görünüm/tema tercihini
// <html>'e uygular — koyu temayı seçmiş kullanıcı açılışta bir an beyaz/eski
// görünüm görmez. Önce çereze, yoksa localStorage kopyasına bakar.
// Yalnızca panel sayfalarında ve sipariş formunda ("/", oturum gerektirir;
// giriş ekranı hariç) çalışır; herkese açık sayfalar (randevu, tanıtım)
// etkilenmez. elevire.yeyu.co'da "/" oturumsuz ziyaretçiye tanıtım sayfasını
// (/elevire, rewrite — adres "/" kalır) gösterdiğinden orada önceden
// uygulanmaz; oturumlu kullanıcının sipariş formunda tema yine useApplyUi ile
// yüklenince uygulanır. Asıl kaynak sunucudaki tercih; panel yüklenince
// useApplyUi bunu doğrulayıp gerekirse düzeltir.
export const UI_BOOT_SCRIPT = `(function(){try{var p=location.pathname;if(p==='/'?location.hostname==='elevire.yeyu.co':(p.indexOf('/admin')!==0||p==='/admin/login'))return;var v,t,m=document.cookie.match(/(?:^|; )${UI_PREF_COOKIE}=([^;]*)/);if(m){var a=decodeURIComponent(m[1]).split('.');v=a[0];t=a[1];}else{var s=JSON.parse(localStorage.getItem('${UI_PREF_STORAGE_KEY}')||'null');if(s){v=s.v;t=s.t;}}if(v!=='v2')return;var d=document.documentElement;d.setAttribute('data-ui','v2');d.setAttribute('data-theme',t==='light'||t==='dark'?t:(window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'));}catch(e){}})();`;
