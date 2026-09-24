"use client";

// Panel içi kullanım kılavuzu — /admin panelindeki her sayfanın ne işe
// yaradığını ve nasıl kullanıldığını anlatır. Statik içerik, tüm oturum
// açmış kullanıcılara (admin + staff) açıktır (bkz. layout.tsx
// settingsItems, adminOnly: false — Profil sayfasıyla aynı görünürlük).

type Role = "admin" | "staff" | "all";

const ROLE_STYLE: Record<Role, string> = {
  admin: "bg-rose-100 text-rose-700",
  staff: "bg-blue-100 text-blue-700",
  all: "bg-green-100 text-green-700",
};
const ROLE_LABEL: Record<Role, string> = {
  admin: "Yönetici",
  staff: "Yönetici + izinli Personel",
  all: "Herkes",
};

function RoleBadge({ role }: { role: Role }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded-full text-[11px] font-semibold ${ROLE_STYLE[role]}`}>
      {ROLE_LABEL[role]}
    </span>
  );
}

const TOC: { group: string; items: { href: string; label: string }[] }[] = [
  { group: "Başlarken", items: [{ href: "#giris", label: "Roller ve Giriş" }] },
  {
    group: "Sipariş",
    items: [
      { href: "#yeni-siparis", label: "Yeni Sipariş" },
      { href: "#siparis-listesi", label: "Sipariş Listesi" },
      { href: "#odeme", label: "Ödeme & Kapatma" },
    ],
  },
  {
    group: "Stok & Depo",
    items: [
      { href: "#urunler", label: "Ürün Kataloğu" },
      { href: "#depolama", label: "Depolama" },
      { href: "#paylasilan-stok", label: "Paylaşılan Stok" },
    ],
  },
  {
    group: "Müşteri İlişkileri",
    items: [
      { href: "#musteriler", label: "Müşteriler & Cari" },
      { href: "#tedarikciler", label: "Tedarikçiler" },
      { href: "#randevular", label: "Online Randevu" },
    ],
  },
  {
    group: "İşletme",
    items: [
      { href: "#hizmetler", label: "Hizmetler & Fiyatlar" },
      { href: "#masraflar", label: "Masraflar" },
      { href: "#kasa", label: "Kasa" },
      { href: "#raporlar", label: "Raporlar" },
    ],
  },
  {
    group: "Yönetim",
    items: [
      { href: "#kullanicilar", label: "Kullanıcılar" },
      { href: "#ayarlar", label: "Genel Ayarlar" },
      { href: "#abonelik", label: "Abonelik" },
    ],
  },
];

function Section({
  id,
  title,
  path,
  role,
  lede,
  children,
}: {
  id: string;
  title: string;
  path?: string;
  role: Role;
  lede: string;
  children?: React.ReactNode;
}) {
  return (
    <section id={id} className="bg-white rounded-xl shadow-sm p-5 sm:p-6 scroll-mt-20">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
        <h2 className="text-lg font-bold text-gray-800">{title}</h2>
        <RoleBadge role={role} />
      </div>
      {path && <p className="text-xs font-mono text-gray-400 mb-2">{path}</p>}
      <p className="text-sm text-gray-600 leading-relaxed mb-3">{lede}</p>
      {children}
    </section>
  );
}

function List({ children }: { children: React.ReactNode }) {
  return <ul className="text-sm text-gray-600 leading-relaxed space-y-2 list-disc pl-5 marker:text-blue-500">{children}</ul>;
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 mt-5 mb-2 first:mt-0">{children}</h3>;
}

export default function HelpPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-1">Kullanım Kılavuzu</h1>
      <p className="text-sm text-gray-500 mb-6 max-w-2xl">
        Panelin tüm sayfalarının nasıl çalıştığını anlatan referans. Her bölümün başında o sayfayı kimlerin
        kullanabileceği belirtilir — <RoleBadge role="admin" /> yalnızca Yönetici, <RoleBadge role="staff" /> Personel&apos;e
        ayrıca izin verilmesi gerekir, <RoleBadge role="all" /> oturum açan herkes.
      </p>

      <div className="flex flex-col sm:flex-row gap-6">
        <aside className="w-full sm:w-52 shrink-0">
          <details className="sm:hidden bg-white rounded-lg border border-gray-200 p-3 mb-4">
            <summary className="text-sm font-medium text-gray-700 cursor-pointer select-none">İçindekiler</summary>
            <nav className="mt-3 flex flex-col gap-3">
              {TOC.map((g) => (
                <div key={g.group}>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">{g.group}</p>
                  <div className="flex flex-col">
                    {g.items.map((it) => (
                      <a key={it.href} href={it.href} className="text-sm text-gray-600 hover:text-blue-600 py-1">
                        {it.label}
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </nav>
          </details>

          <nav className="hidden sm:flex sm:flex-col gap-4 sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto pb-6">
            {TOC.map((g) => (
              <div key={g.group}>
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1 px-2">{g.group}</p>
                <div className="flex flex-col">
                  {g.items.map((it) => (
                    <a key={it.href} href={it.href} className="text-sm text-gray-600 hover:text-blue-600 hover:bg-gray-100 rounded-lg px-2 py-1.5">
                      {it.label}
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        <div className="flex-1 min-w-0 flex flex-col gap-5">
          <Section id="giris" title="Roller ve Giriş" role="all" lede="Panelde iki rol vardır: Yönetici ve Personel (karşılama görevlisi). Yönetici her zaman panelin tamamına erişir. Personel'e ise hangi sayfaları görebileceği, hangilerinde ekleme/düzenleme/silme yapabileceği Kullanıcılar sayfasından tek tek verilir.">
            <List>
              <li>Giriş ekranında <b>Firma Kodu</b> + kullanıcı adı/e-posta + şifre istenir.</li>
              <li>&quot;Beni Hatırla&quot; işaretlenmezse oturum kısa sürede kendiliğinden kapanır; işaretlenirse 30 gün açık kalır.</li>
              <li>5 hatalı şifre denemesinde hesap 15 dakika kilitlenir — Yönetici, Kullanıcılar sayfasından kilidi erken açabilir.</li>
              <li>Yönetici girişte doğrudan Sipariş Listesi&apos;ne, Personel ise erişebildiği ilk sayfaya yönlendirilir.</li>
            </List>
          </Section>

          <Section id="yeni-siparis" title="Yeni Sipariş" path="Ana sayfa ( / )" role="all" lede="Müşteri karşılandığında ilk açılan ekran. Plaka, müşteri bilgisi ve yapılan işlemler girilip kaydedilir — sipariş Beklemede statüsünde açılır, ödeme bilgisi daha sonra (Yönetici tarafından) girilir.">
            <List>
              <li><b>Plaka</b> zorunludur, otomatik büyük harfe çevrilir. Müşteri adı yazılınca daha önce kaydedilmiş müşteriler önerilir, seçilince telefonu varsa otomatik dolar.</li>
              <li>Her satırda <b>Yapılan İşlem</b> seçilir/yazılır — mevcut bir hizmetle eşleşirse Tutar otomatik dolar. Eşleşmeyen bir isim girilirse otomatik yeni bir hizmet olarak kaydedilir.</li>
              <li><b>Lastik Satışı</b>&apos;nda ayrıca Tedarikçi → Stok Kodu → Üretim Haftası/Yılı sırasıyla seçilir; seçilen partinin Ebat/Fiyatı otomatik dolar ve stoktan düşülür.</li>
              <li>&quot;+ Satır Ekle&quot; ile aynı siparişe birden fazla işlem eklenir.</li>
              <li>Kaydet&apos;e basınca ekran sıfırlanır, sıradaki müşteriye hazır hale gelir.</li>
            </List>
          </Section>

          <Section id="siparis-listesi" title="Sipariş Listesi" path="Yönetici Paneli → Siparişler" role="staff" lede="Tüm siparişlerin, her işlem satırının kendi satırda göründüğü tam listesi. Arama, filtreleme, Excel içe/dışa aktarma ve toplu işlemler buradan yapılır.">
            <List>
              <li><b>Hızlı Ara</b> kutusu plaka/müşteri/tedarikçi/ebat içinde birden arar; &quot;Filtrele&quot; ile tarih, statü, müşteri, yapılan işlem, tedarikçi ve ödeme şekline göre daha isabetli filtre kurulur.</li>
              <li>Her sütun başlığına tıklayarak sıralanır; sütun görünürlüğü ve sayfa başına kayıt sayısı özelleştirilebilir.</li>
              <li><b>Cari</b> sütunu canlıdır — o müşterinin tüm geçmişine göre &quot;tamamen ödendi mi, ne kadar kaldı&quot; anlık hesaplanır.</li>
              <li>Checkbox&apos;larla birden fazla sipariş seçip <b>toplu ödeme şekli değiştirme</b> yapılabilir.</li>
              <li>&quot;Şablon İndir&quot; ile Excel şablonu alınır, doldurulup &quot;İçeri Aktar&quot; ile toplu sipariş yüklenir; aynı dosya tekrar yüklenirse mükerrer kayıt oluşmaz.</li>
            </List>
            <SubHeading>Sipariş Detayı ve Düzelt</SubHeading>
            <List>
              <li>Bir siparişe girince tüm satırlar, toplam, notlar ve ödeme bilgisi görünür; <b>&quot;İş Emri Yazdır&quot;</b> ile firma logolu, imza/kaşe kutulu A4 çıktı alınır.</li>
              <li><b>&quot;Düzelt&quot;</b> ile satırlar (işlem, tutar, tedarikçi, stok bağlantısı, ödeme tipi) tam ekranda düzenlenir.</li>
            </List>
          </Section>

          <Section id="odeme" title="Ödeme & Sipariş Kapatma" role="staff" lede="Beklemedeki bir sipariş &quot;Ödeme Al & Kapat&quot; ile kapatılır.">
            <List>
              <li>Ödeme Tipleri: Nakit, POS, Cari, Fatura Edildi., Garanti Hesap ve Mail Order (tedarikçi seçilerek) — Genel Ayarlar&apos;dan firmanıza özel başka tipler de eklenebilir.</li>
              <li><b>Parçalı ödeme</b> desteklenir — &quot;+ Ödeme Ekle&quot; ile tek siparişe birden fazla (tip, tutar) girilebilir.</li>
              <li>Girilen toplam sipariş tutarını aşarsa kayıt engellenir; azsa (indirim) uyarı verilir ama kayda izin verilir.</li>
              <li>Kapanmış bir siparişin ödeme kırılımı, &quot;Düzelt&quot; ekranındaki &quot;Ödemeler&quot; bölümünden sonradan da değiştirilebilir.</li>
            </List>
          </Section>

          <Section id="urunler" title="Ürün Kataloğu" path="Ürünler" role="staff" lede="Stoktaki lastik/jant/aksesuar partilerinin takip edildiği yer. Aynı ürün kodu farklı üretim haftası/tedarikçiyle birden fazla &quot;parti&quot;ye ayrılabilir; liste kod bazında gruplanır, partiler açılıp kapanır.">
            <SubHeading>Temel kullanım</SubHeading>
            <List>
              <li>Alış/Satış Fiyatı ekranda her zaman <b>o partideki tüm girişlerin ortalaması</b> olarak gösterilir.</li>
              <li>Stoğu biten bir parti listeden otomatik kalkar, geçmişi &quot;Malzeme Hareketleri&quot; sekmesinde kalır.</li>
              <li>&quot;Stok Girişi&quot; ile mevcut bir partiye miktar eklenir; kod+hafta/yıl+tedarikçi eşleşmezse yeni parti açılır.</li>
              <li>Bir partiyi başka bir partiyle aynı kimliğe getirirseniz iki satır otomatik <b>birleştirilir</b>.</li>
            </List>
            <SubHeading>Ürün ekleme kolaylıkları</SubHeading>
            <List>
              <li><b>Barkod</b> — daha önce aynı barkodla kaydettiğiniz bir ürünse, barkodu girip alandan çıkınca Marka/Ebat/Mevsim/Tedarikçi otomatik dolar.</li>
              <li><b>Kopyala</b> — listedeki bir partiye tıklayarak benzer bir ürünü, sadece kod/barkodu değiştirerek hızlıca ekleyebilirsiniz.</li>
              <li><b>Ürün Tipi</b> (Lastik/Jant/İkinci El Lastik/İkinci El Jant/Aksesuar) seçimine göre form kendini uyarlar — İkinci El Lastik&apos;te Diş Derinliği girilir, ondan <b>Kondisyon</b> (Çok İyi / İyi) otomatik hesaplanır.</li>
              <li>Ebat&apos;ı Kesit/Profil/Jant Çapı olarak ayrı ayrı da girebilirsiniz, otomatik &quot;225/45R17&quot; biçiminde birleşir.</li>
              <li>Formu doldururken altında <b>canlı bir önizleme</b> kartı, ürünün listede nasıl görüneceğini gösterir.</li>
              <li>&quot;Sütunlar&quot; menüsünden Ürün Tipi/Barkod/Kondisyon gibi ek sütunlar tabloya eklenebilir.</li>
            </List>
            <SubHeading>Excel ile toplu işlem</SubHeading>
            <List>
              <li>&quot;Şablon İndir&quot; ile alınan dosyada geçerli değerleri (ör. Mevsim seçenekleri) listeleyen ayrı bir referans sayfası bulunur.</li>
              <li>Dosya yüklenirken tanınmayan bir değer varsa, kaydetmeden önce uyarı gösterilir.</li>
            </List>
          </Section>

          <Section id="depolama" title="Depolama" role="staff" lede="Mevsimlik lastik depolama takibi — hangi müşterinin lastiği hangi depo numarasında, ne zamandan beri duruyor.">
            <List>
              <li>Yeni kayıt açılırken Depo No boş bırakılırsa boştaki en küçük numara otomatik atanır.</li>
              <li>&quot;Teslim Et&quot; ile kayıt kapatılır, depo numarası tekrar kullanılabilir hale gelir.</li>
              <li>Ayarlanabilir bir süreden (varsayılan 6 ay) uzun süredir teslim edilmemiş kayıtlar &quot;gecikmiş&quot; filtresiyle ayrıca listelenebilir.</li>
              <li>İkiye bölünmüş A5 etiket yazdırılabilir (biri lastik çantasına, biri müşteriye).</li>
              <li>Excel ile toplu kayıt girişi/dışa aktarma desteklenir.</li>
            </List>
          </Section>

          <Section id="paylasilan-stok" title="Paylaşılan Stok" role="staff" lede="Aradığınız ebat kendi stoğunuzda yoksa, aynı ağdaki ve bu özelliği açmış diğer firmaların stok özetini görebilirsiniz — karşılıklı, isteğe bağlı bir özelliktir.">
            <List>
              <li>Yalnızca siz de <b>Ayarlar</b>&apos;dan bu özelliği açtıysanız, başka firmaların stoğu görünür (karşılıklılık şarttır).</li>
              <li>Yalnızca Marka/Ebat/Mevsim/Stok Miktarı paylaşılır — fiyat, tedarikçi ve kendi ürün kodunuz asla görünmez.</li>
              <li>Eşleşme fiyat değil, &quot;kimde bu ebat var&quot; sorusuna hızlı bir teyit içindir; alışveriş yine kendi aranızda, panel dışında yürütülür.</li>
            </List>
          </Section>

          <Section id="musteriler" title="Müşteriler & Cari" role="staff" lede="Müşteri dizini ve borç/alacak (Cari) takibi. Yeni bir sipariş yeni bir müşteri adıyla girildiğinde dizine otomatik eklenir.">
            <SubHeading>Cari nasıl işler</SubHeading>
            <List>
              <li>Bir sipariş &quot;Cari&quot; ödeme tipiyle kapatılırsa, o tutar otomatik olarak müşterinin borcuna yazılır.</li>
              <li>Müşteri sayfasındaki &quot;Cari Hareketleri&quot; modalından <b>Tahsilat Al</b> veya <b>Borç Ekle</b> ile elle kayıt girilebilir; bir tahsilat isterseniz bir kasaya da bağlanabilir.</li>
              <li>Tahsilatlar en eski borçtan başlayarak otomatik düşülür — bir siparişin &quot;ödendi&quot; sayılması için o siparişe özel bir tahsilat girmeniz gerekmez.</li>
              <li>Üstte <b>Toplam Borç/Alacak</b> özeti; &quot;Borç/Alacak Listesini İndir&quot; ile en yüksek borçtan başlayarak Excel&apos;e aktarılabilir.</li>
            </List>
          </Section>

          <Section id="tedarikciler" title="Tedarikçiler" role="staff" lede="Tedarikçi dizini — Sipariş ve Ürün Kataloğu ekranlarındaki Tedarikçi alanlarını besler. Yeni bir isim ilk kullanıldığında otomatik eklenir, ayrıca elle de yönetilebilir." />

          <Section id="randevular" title="Online Randevu" role="staff" lede="Müşterilerinizin kendi kendine randevu alabileceği herkese açık bir form + bunu onaylayıp siparişe çevirdiğiniz yönetim ekranı.">
            <List>
              <li>Herkese açık form kendi bağlantınızdan (web sitenize link, buton veya gömülü widget olarak) açılır; müşteri hizmet + tarih + saat seçip bilgilerini girer.</li>
              <li>Müsait saatler, o hizmetin süresine ve aynı anda kaç randevu alabileceğinize göre gerçek zamanlı hesaplanır — dolu bir saat asla önerilmez.</li>
              <li>Talepler isterseniz otomatik onaylanır, isterseniz (önerilen) önce <b>Randevular</b> sayfanızda &quot;Onayla/Reddet&quot; bekler.</li>
              <li>Onaylanan bir randevu tek tıkla <b>&quot;Siparişe Dönüştür&quot;</b> ile Yeni Sipariş akışındaki bir siparişe çevrilir.</li>
              <li>Yeni talep geldiğinde tarayıcı bildirimi alabilir, onaylanan randevularda müşteriye otomatik WhatsApp bildirimi gönderilebilir (kendi WhatsApp Business hesabınızı bağlamanız gerekir).</li>
              <li>Formun görünümü &quot;Randevu Görünümü&quot; sayfasından, kendi web sitenizin diline uyacak şekilde özelleştirilebilir.</li>
            </List>
          </Section>

          <Section id="hizmetler" title="Hizmetler & Fiyatlar" role="staff" lede="Yapılan işlemlerin (Lastik Değişimi, Rot Balans, Lastik Satışı vb.) listesi ve varsayılan fiyatları. Fiyat opsiyoneldir — fiyatsız bırakılan hizmetlerde Sipariş ekranında tutar elle girilir. Bir hizmet &quot;randevuya açık&quot; işaretlenirse Online Randevu formunda seçilebilir hale gelir." />

          <Section id="masraflar" title="Masraflar" role="admin" lede="Kira, elektrik, personel gibi sipariş dışı günlük işletme giderlerinin takibi — Raporlar'daki kâr hesabına Ciro ve Maliyet'ten sonra üçüncü kalem olarak girer.">
            <List>
              <li>Sipariş ekranındaki gibi tek formda birden fazla masraf satırı girilip birlikte kaydedilir.</li>
              <li><b>Sabit Giderler</b> — kira gibi her ay tekrar eden giderler için ayrı bir şablon listesi; &quot;Sabit Giderleri Ekle&quot; o ay için henüz girilmemiş şablonları forma hazır satır olarak doldurur, siz onaylayıp kaydedersiniz.</li>
              <li>Ay/yıl seçiciyle geçmiş aylar görüntülenir, ödeme şekline göre kırılım gösterilir.</li>
            </List>
          </Section>

          <Section id="kasa" title="Kasa" role="staff" lede="Fiziksel nakit kasa(lar)ınızın kronolojik defteri — nakit sipariş tahsilatları, nakit masraflar, Cari'den nakit tahsilatlar ve elle girilen serbest hareketler tek bir listede, canlı bakiye ile birleşir.">
            <List>
              <li>Birden fazla fiziksel kasa tanımlanabilir; her hareketin hangi kasaya ait olduğu izlenir.</li>
              <li>Bir kasa, Nakit dışı bir ödeme tipine (ör. &quot;Garanti Hesap&quot;) bağlanabilir — o tipteki her işlem otomatik o kasaya sayılır.</li>
              <li>Kasalar arası para transferi tek işlemle, dengeli iki satır olarak kaydedilir.</li>
              <li>Döviz tutan bir kasa açılabilir (USD/EUR/GBP); güncel kur elle girilir, TL karşılığı canlı hesaplanır.</li>
            </List>
          </Section>

          <Section id="raporlar" title="Raporlar" role="staff" lede="Ay/yıl bazında Ciro, Maliyet, Masraf ve Kâr grafiği; ödeme tipine göre gelir kırılımı; en çok verilen hizmetler; günlük/haftalık/aylık periyot tablosu.">
            <List>
              <li>Tüm rakamlar hizmetin <b>girildiği</b> tarihe göredir (ödemenin alındığı tarihe göre değil).</li>
              <li>Henüz masrafa dönüştürülmemiş aktif sabit gider varsa, o ayın kârının gerçekte daha düşük olabileceğini hatırlatan bir rozet gösterilir.</li>
              <li>&quot;Kasa (Nakit) — Tüm Zamanlar&quot; kartı, ay filtresinden bağımsız, açılıştan bugüne toplam nakit durumunu özetler.</li>
            </List>
          </Section>

          <Section id="kullanicilar" title="Kullanıcılar" role="admin" lede="Personel hesapları burada açılır ve her birinin hangi sayfalarda ne yapabileceği (görüntüle/ekle/düzenle/sil) tek tek belirlenir.">
            <List>
              <li>Yeni kullanıcı eklerken rol &quot;Personel&quot; seçilirse altında sayfa bazlı izin listesi çıkar — hiçbiri işaretlenmezse o kullanıcı sadece Yeni Sipariş ekranını görür.</li>
              <li>Satırdan rol değiştirme, şifre sıfırlama, kullanıcı adı yeniden adlandırma yapılabilir.</li>
              <li>Şüpheli bir durumda &quot;Oturumu Sonlandır&quot; ile o kullanıcının tüm cihazlardaki oturumu anında kapatılır; &quot;Devre Dışı Bırak&quot; ile hesap tamamen askıya alınır (kayıtları silinmez).</li>
              <li>Kendi hesabınız üzerinde bu sayfadan rol/şifre değişikliği veya devre dışı bırakma yapılamaz.</li>
            </List>
          </Section>

          <Section id="ayarlar" title="Genel Ayarlar" role="admin" lede="İşletmenizin panel genelindeki tercihleri — Ayarlar menüsü altında.">
            <List>
              <li><b>Marka</b> — Firma Logosu, Panel Logosu ve Firma Kaşesi görselleri; İş Emri çıktısında ve panel başlığında kullanılır.</li>
              <li><b>Şirket Bilgisi</b> — yetkili adı, telefon, web sitesi; Paylaşılan Stok&apos;ta karşı firmaya gösterilen iletişim bilgisidir.</li>
              <li><b>Fatura Bilgileri</b> — VKN/TCKN, vergi dairesi, adres; abonelik faturanız için kullanılır, kimseyle paylaşılmaz.</li>
              <li><b>Ödeme Şekilleri</b> — Nakit/POS/Cari/Mail Order dışında kendi ödeme tiplerinizi ekleyip kaldırabilirsiniz.</li>
              <li><b>Depolama uyarı eşiği</b>, <b>Sipariş Listesi varsayılan tarih filtresi</b>, <b>Müşterileri Otomatik Kaydet</b> gibi küçük davranış ayarları.</li>
              <li><b>Firma Kodu</b> — girişte kullanılan 6 haneli kod, salt okunur olarak burada görüntülenir.</li>
            </List>
          </Section>

          <Section id="abonelik" title="Abonelik" role="admin" lede="Panel aboneliğinizin yönetildiği sayfa — 7 günlük kartsız deneme sonrası Aylık veya Yıllık plana geçilir.">
            <List>
              <li>Ödeme, iyzico&apos;nun güvenli ödeme formunda alınır — kart bilgisi panelimize hiçbir zaman ulaşmaz.</li>
              <li>Abone olmadan önce Fatura Bilgileri&apos;nin eksiksiz girilmiş ve Mesafeli Satış Sözleşmesi&apos;nin onaylanmış olması gerekir.</li>
              <li>Plan değişikliği yalnızca yenileme tarihinize birkaç gün kala yapılabilir; iptal ettiğinizde erişiminiz ödediğiniz dönemin sonuna kadar sürer.</li>
              <li>Deneme süreniz bitmeye yakınken panelde bir hatırlatma banner&apos;ı/penceresi görürsünüz.</li>
            </List>
          </Section>
        </div>
      </div>
    </div>
  );
}
