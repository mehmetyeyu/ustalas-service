// "use client" OLMAYAN modül — kök layout (sunucu bileşeni) bu metni
// doğrudan <head>'e gömer; client modülünden import edilseydi metin değil
// istemci referansı gelirdi. Mantığın geri kalanı src/lib/uiTheme.ts'te.
export const UI_PREF_STORAGE_KEY = "ui-pref";

// Sayfa çizilmeden önce çalışır: yalnızca panel sayfalarında ve sipariş
// formunda ("/", oturum gerektirir; giriş ekranı hariç). elevire.yeyu.co'da
// "/" oturumsuz ziyaretçiye tanıtım sayfasını (/elevire, rewrite — adres "/"
// kalır) gösterdiğinden orada önceden uygulanmaz; oturumlu kullanıcının
// sipariş formunda tema yine useApplyUi ile yüklenince uygulanır son bilinen görünüm/tema tercihini uygular, böylece koyu temayı
// seçmiş kullanıcı açılışta bir an beyaz ekran görmez. Herkese açık
// sayfalar (randevu, tanıtım) hiç etkilenmez. Asıl kaynak sunucudaki tercih;
// panel yüklenince useApplyUi bunu doğrulayıp gerekirse düzeltir.
export const UI_BOOT_SCRIPT = `(function(){try{var p=location.pathname;if(p==='/'?location.hostname==='elevire.yeyu.co':(p.indexOf('/admin')!==0||p==='/admin/login'))return;var s=JSON.parse(localStorage.getItem('${UI_PREF_STORAGE_KEY}')||'null');if(!s||s.v!=='v2')return;var d=document.documentElement;d.setAttribute('data-ui','v2');var t=s.t==='system'?(window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):s.t;d.setAttribute('data-theme',t);}catch(e){}})();`;
