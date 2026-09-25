// Panele ilk girişte gösterilen kısa tanıtım turu — bkz. src/components/
// OnboardingTour.tsx (asıl UI), src/app/admin/layout.tsx (tetikleme),
// database/schema.sql users.onboarding_tour_completed_at notu.
export interface OnboardingTourUser {
  role: string;
  isPrimaryAdmin: boolean;
  // tenants.trial_ends_at — YALNIZCA kendi kendine kayıt akışından
  // (bkz. src/lib/provisionTenant.ts, startTrial:true) geçen firmalarda
  // dolar ve bir daha ASLA null'a dönmez/güncellenmez (bkz. o dosyadaki
  // not). Süper Admin panelinden veya scripts/create-tenant.mjs ile elle
  // eklenen firmalarda (Ustalas, FB Lastik vb.) hep null. billing_status
  // yerine bunun kullanılmasının sebebi: billing_status zamanla
  // 'trialing'den 'active'e/'past_due'ya değişir, trial_ends_at ise
  // firmanın NASIL oluşturulduğunun kalıcı bir izidir.
  trialEndsAt: string | Date | null;
  onboardingTourCompletedAt: string | Date | null;
}

// Sadece kendi kendine kayıt olmuş bir firmanın BİRİNCİL Yöneticisi'ne
// gösterilir — is_primary_admin tek başına yetmez, çünkü Ustalas/FB Lastik
// gibi elle provizyon edilmiş firmaların da birincil admini vardır (bkz.
// trialEndsAt notu). Sonradan eklenen personel/ikinci kullanıcı hiçbir
// zaman is_primary_admin=true olamaz (bkz. database/schema.sql
// users_single_primary_admin), dolayısıyla bu turu hiç görmez — bilinçli
// bir seçim: "az önce siz kayıt oldunuz" çerçevesi onlar için anlamsız
// olurdu (bkz. görev notu, hafif bir personel versiyonu şimdilik kapsam
// dışı bırakıldı).
export function shouldShowOnboardingTour(user: OnboardingTourUser): boolean {
  if (user.role !== "admin") return false;
  if (!user.isPrimaryAdmin) return false;
  if (!user.trialEndsAt) return false;
  if (user.onboardingTourCompletedAt) return false;
  return true;
}

export interface OnboardingTourStep {
  id: string;
  // Bir navItems.href'iyle (bkz. admin/layout.tsx data-tour-target) ya da
  // Ayarlar menüsü tetikleyicisini işaret eden "ayarlar" ile eşleşir.
  target: string;
  title: string;
  body: string;
}

export const ONBOARDING_TOUR_STEPS: OnboardingTourStep[] = [
  {
    id: "orders",
    target: "/admin/orders",
    title: "Siparişler",
    body: "Girişte karşınıza çıkan ekran burası — tüm siparişlerinizin listesi. Yeni bir müşteri geldiğinde sağ üstteki “+ Sipariş Ekle” ile plaka ve yapılan işlemleri girip kaydedersiniz.",
  },
  {
    id: "products",
    target: "/admin/products",
    title: "Ürün Kataloğu",
    body: "Stoktaki lastik/jant partileriniz burada. Aynı ürün kodu farklı tedarikçi ya da üretim haftasıyla birden fazla partiye ayrılabilir, fiyat her zaman o partinin ortalaması olarak gösterilir.",
  },
  {
    id: "storage",
    target: "/admin/storage",
    title: "Depolama",
    body: "Mevsimlik lastik depolama kayıtlarınızı buradan tutarsınız — hangi müşterinin lastiği hangi depo numarasında, ne zamandan beri duruyor.",
  },
  {
    id: "appointments",
    target: "/admin/appointments",
    title: "Randevular",
    body: "Müşterileriniz kendi bağlantınızdan online randevu alabilir; onayladığınız bir randevuyu tek tıkla doğrudan siparişe çevirebilirsiniz.",
  },
  {
    id: "reports",
    target: "/admin/reports",
    title: "Raporlar",
    body: "Ciro, maliyet, masraf ve kârınızı ay/yıl bazında grafik olarak buradan takip edersiniz.",
  },
  {
    id: "kasa",
    target: "/admin/kasa",
    title: "Kasa",
    body: "Nakit kasanızın kronolojik defteri — tahsilatlar, nakit masraflar ve elle girdiğiniz hareketler canlı bakiyeyle burada birleşir.",
  },
  {
    id: "customers",
    target: "/admin/customers",
    title: "Müşteriler",
    body: "Müşteri dizininiz ve Cari (borç/alacak) takibiniz burada. “Cari” ödeme tipiyle kapatılan bir sipariş, tutarı otomatik olarak müşterinin borcuna yazar.",
  },
  {
    id: "help",
    target: "ayarlar",
    title: "Kullanım Kılavuzu",
    body: "Tur burada bitiyor — ama Ayarlar menüsündeki Kullanım Kılavuzu'nda panelin tüm sayfalarının ayrıntılı anlatımı her zaman sizi bekliyor. İstediğiniz zaman buraya dönebilirsiniz.",
  },
];
