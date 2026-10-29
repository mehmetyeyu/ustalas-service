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
      { href: "#teklifler", label: "Teklifler" },
      { href: "#arac-karti", label: "Araç Kartı" },
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
      { href: "#kurumsal", label: "Kurumsal Müşteri & Filo" },
      { href: "#tedarikciler", label: "Tedarikçiler" },
      { href: "#randevular", label: "Online Randevu" },
      { href: "#takvim", label: "Takvim" },
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
      { href: "#aktivite", label: "Aktivite Geçmişi" },
      { href: "#ayarlar", label: "Genel Ayarlar" },
      { href: "#profil", label: "Profil & Görünüm" },
      { href: "#destek", label: "Destek" },
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
              <li><b>Plaka</b> varsayılan olarak zorunludur, otomatik büyük harfe çevrilir. Araca bağlı olmayan düz satışlar için Genel Ayarlar&apos;dan &quot;Araç Plakası Zorunlu&quot; kapatılabilir; o zaman plaka ya da müşteri adından biri yeterlidir.</li>
              <li><b>Plakasız satış</b> — araca bağlı olmayan satışta (ör. lastiği alıp giden müşteri) plaka alanının üstündeki &quot;Plakasız satış&quot; seçilir; plaka uydurmaya gerek kalmaz. Bu durumda müşteri adı zorunludur.</li>
              <li>Daha önce gelmiş bir aracın plakası yazılınca altında <b>kayıtlı araç</b> bilgisi çıkar (son müşteri, son ziyaret, depodaki lastik) ve müşteri alanı boşsa kendiliğinden dolar. Yazılan müşteri adı aracın son müşterisinden farklıysa uyarı verilir.</li>
              <li>Plaka bir kurumsal müşterinin <b>filo aracı</b>ysa müşteri alanı firmanın adıyla dolar. Kurumsal müşteride <b>Aracı Getiren</b> (şoför/çalışan) adı ve telefonu da girilebilir; daha önce yazılmış kişiler öneri olarak gelir.</li>
              <li>Müşterinin <b>kurumsal indirimi</b> varsa formda, Ödeme Al &amp; Kapat&apos;ta gelecek indirimli tutar gösterilir (satır fiyatları değişmez). Sipariş cariye yazılınca <b>cari limiti</b> aşılacaksa uyarı çıkar. Firma adı büyük/küçük harf farkıyla yazılsa da kayıtlı firmaya bağlanır, ikinci bir müşteri açılmaz.</li>
              <li>Müşteri adı yazılınca daha önce kaydedilmiş müşteriler önerilir, seçilince telefonu varsa otomatik dolar.</li>
              <li><b>Tarih</b> bugündür; girmeyi unuttuğunuz geçmiş bir günün siparişi için geriye alınabilir (ileri bir tarih seçilemez).</li>
              <li>Genel Ayarlar&apos;da &quot;Sipariş Numarasını Elle Gir&quot; açıksa <b>Sipariş No</b> alanı çıkar ve zorunludur; kapalıyken sistem #numara verir.</li>
              <li>Her satırda <b>Yapılan İşlem</b> seçilir/yazılır — mevcut bir hizmetle eşleşirse Tutar otomatik dolar. Eşleşmeyen bir isim girilirse otomatik yeni bir hizmet olarak kaydedilir.</li>
              <li><b>Lastik Satışı</b>&apos;nda ayrıca Tedarikçi → Stok Kodu → Üretim Haftası/Yılı sırasıyla seçilir; seçilen partinin Ebat/Marka/Model/Fiyat/Maliyeti otomatik dolar ve stoktan düşülür. Adet alanının yanındaki rozet partide kalan stoğu gösterir; stoktan fazla adet girilirse kayıt engellenir.</li>
              <li>Ürün Kataloğu&apos;ndaki <b>Sipariş</b> düğmesi bu ekranı o parti seçili olarak açar; sipariş detayındaki <b>Kopyala</b> ise aynı müşteri ve satırlarla, plakası boş yeni bir sipariş hazırlar (stok partisi bağlantısı kopyalanmaz, gerekirse yeniden seçilir).</li>
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
              <li><b>Ödeme Notu</b> — fatura numarası gibi ödemeye ait bir bilgi, kapatırken ya da sonradan Düzelt ekranından kaydedilir.</li>
              <li>Tekliften oluşturulan siparişlerin notunda hangi tekliften geldiği yazar. Böyle bir sipariş silinirse teklif &quot;Kabul Edildi&quot; durumuna döner ve yeniden dönüştürülebilir.</li>
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

          <Section id="teklifler" title="Teklifler" path="Yönetici Paneli → Teklifler" role="staff" lede="Müşteriye sipariş öncesi fiyat teklifi hazırlanır, yazdırılır ya da WhatsApp ile gönderilir; müşteri kabul edince tek tıkla siparişe dönüştürülür. Teklif stok ayırmaz — stok ancak siparişe dönüştürülünce düşer.">
            <SubHeading>Teklif hazırlama</SubHeading>
            <List>
              <li>&quot;+ Yeni Teklif&quot; ile müşteri, telefon ve (opsiyonel) plaka girilir; satırlar Yeni Sipariş ekranındaki gibi işlem/tedarikçi/stok kodu/parti seçilerek eklenir.</li>
              <li>Fiyat <b>birim fiyat</b> olarak girilir, Tutar = Adet × Birim Fiyat kendiliğinden hesaplanır.</li>
              <li><b>KDV Dahil / KDV Hariç</b> ve <b>KDV oranı</b> (%20, %10, %1, %0) her teklif için ayrı seçilir; alt çubukta Ara Toplam, KDV ve Genel Toplam görünür. Katalogdan/partiden gelen fiyatlar KDV dahil kabul edilir, KDV hariç teklifte otomatik nete çevrilir.</li>
              <li><b>Geçerlilik</b> 7, 15 veya 30 gün düğmeleriyle ya da tarih seçilerek belirlenir (varsayılan 15 gün). Süresi geçen açık teklifler listede &quot;Süresi Doldu&quot; olarak görünür.</li>
              <li>Seçilen partide yeterli stok yoksa Adet yanındaki rozet turuncu olur; teklif yine kaydedilir.</li>
              <li>Teklif numarası otomatik verilir (T-0001 veya T-2026-0001 — Genel Ayarlar&apos;dan seçilir).</li>
            </List>
            <SubHeading>Gönderme ve takip</SubHeading>
            <List>
              <li><b>Yazdır / PDF</b> — firma logolu, kaşeli A4 &quot;Fiyat Teklifi&quot; çıktısı; yazdırma ekranında &quot;PDF olarak kaydet&quot; seçilerek dosya alınabilir.</li>
              <li><b>WhatsApp ile Gönder</b> — müşterinin numarasıyla WhatsApp açılır, teklifin özeti hazır yazılmış gelir. Taslak teklif bu düğmeyle gönderilince &quot;Gönderildi&quot; olarak işaretlenir.</li>
              <li>Durum düğmeleriyle teklif <b>Gönderildi / Kabul Edildi / Reddedildi</b> işaretlenir; reddedilen teklif &quot;Yeniden Aç&quot; ile tekrar açılabilir.</li>
              <li>Liste sekmeleri: Tümü, Açık, Süresi Doldu, Kabul, Siparişe Dönüştü, Red. Teklif no, müşteri, plaka veya telefonla aranır.</li>
            </List>
            <SubHeading>Siparişe dönüştürme</SubHeading>
            <List>
              <li><b>Siparişe Dönüştür</b> teklifteki satırlarla Beklemede bir sipariş açar, seçili partilerin stoğunu düşer ve sizi siparişe götürür; ödeme siparişten alınır.</li>
              <li>Teklifte plaka yoksa ve plaka zorunluysa, ya da Sipariş No elle giriliyorsa, dönüştürme penceresi bunları sorar. Stok artık yetmiyorsa pencere uyarır ve sipariş açılmaz.</li>
              <li>Siparişe dönüşen teklif kilitlenir — düzenlenemez, silinemez.</li>
            </List>
            <SubHeading>Yetkiler</SubHeading>
            <List>
              <li>Personel için Kullanıcılar sayfasında Teklifler satırından Görüntüle / Ekle / Düzenle / Sil / Siparişe Dönüştür ayrı ayrı verilir.</li>
              <li><b>Maliyet/Kâr Gör</b> izni olmayan kullanıcı teklif ekranında maliyet ve kârı hiç görmez. Maliyet ve kâr müşteriye giden çıktıda ve WhatsApp mesajında hiçbir zaman yer almaz.</li>
            </List>
          </Section>

          <Section id="arac-karti" title="Araç Kartı" path="Plakaya tıklayınca" role="staff" lede="Bir aracın siparişleri, depodaki lastikleri ve randevuları tek ekranda. Sipariş Listesi, sipariş detayı, Depolama ve Randevular'daki plakaya tıklanınca açılır (Siparişler görüntüleme izni gerekir).">
            <List>
              <li>Üstte toplam harcama, son ziyaret ve depodaki lastik sayısı; altta tüm işlemler tarih sırasıyla tek zaman çizelgesinde.</li>
              <li>&quot;+ Bu Araç İçin Sipariş&quot; sipariş formunu plaka dolu açar.</li>
              <li>Araç kartı bu özellik açıldıktan sonra girilen kayıtlarla dolar; daha eski kayıtlar karta eklenmez. Yalnızca gerçek plaka biçimine uyan plakalar (ör. 34 ABC 123) araç olarak takip edilir — &quot;11&quot;, &quot;X&quot; gibi girişler sipariş olarak kaydedilir ama bir araca bağlanmaz.</li>
              <li>Bir araçta birden fazla farklı müşteri adı geçiyorsa kartta belirtilir (araç el değiştirmiş ya da yanlış girilmiş olabilir).</li>
              <li>Araç bir kurumsal müşteriye bağlıysa kartın üstünde <b>Filo aracı</b> rozeti ve firma sayfasına bağlantı görünür.</li>
            </List>
          </Section>

          <Section id="urunler" title="Ürün Kataloğu" path="Ürünler" role="staff" lede="Stoktaki lastik/jant/aksesuar partilerinin takip edildiği yer. Aynı ürün kodu farklı üretim haftası/tedarikçiyle birden fazla &quot;parti&quot;ye ayrılabilir; liste kod bazında gruplanır, partiler açılıp kapanır.">
            <SubHeading>Temel kullanım</SubHeading>
            <List>
              <li>Parti satırındaki Alış/Satış Fiyatı <b>o partideki tüm girişlerin ortalamasıdır</b>. Kodun özet satırındaki ortalama ise yalnızca <b>stokta kalan</b> partilerden hesaplanır — tükenmiş ucuz bir parti, elinizdeki stoğun maliyetini düşük göstermez. Bir kodun tüm partileri tükenmişse son bilinen fiyat için tüm girişlerin ortalaması gösterilir.</li>
              <li>Üstteki <b>stok özeti</b> kartları toplam stoğu, mevsimlere göre dağılımı ve stoğu biten kod sayısını gösterir; bir karta tıklanınca liste o mevsime ya da stoğu bitenlere süzülür.</li>
              <li><b>Min. Stok</b> eşiği girilen kodlarda stok rozeti eşiğe inince turuncu, tükenince kırmızı olur.</li>
              <li>Her satırdaki <b>Sipariş</b> düğmesi, o partiyle doldurulmuş Yeni Sipariş ekranını açar.</li>
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
              <li><b>Cari Limiti</b> — müşteri formunda isteğe bağlı bir limit girilebilir. Borç bu limiti geçecekse sipariş formunda, Ödeme Al &amp; Kapat ve Düzelt ekranında uyarı çıkar; kayıt engellenmez. Limiti aşmış müşteriler listede &quot;Limit aşıldı&quot; rozetiyle görünür. Cari limiti ve kurumsal indirimi yalnızca <b>Cari Bakiye Yönetimi</b> izni olanlar değiştirebilir.</li>
              <li><b>Aylık Ekstre</b> — Cari Hareketleri penceresindeki &quot;Aylık Ekstre&quot; (kurumsal müşteride firma sayfasındaki &quot;Ekstre&quot;) seçilen ayın devreden bakiyesini, borç ve tahsilatlarını, ay sonu bakiyesini ve araç bazında tamamlanan işleri gösterir (araç özetine nakitle ödenen işler de girer, bekleyen siparişler girmez; henüz gelmemiş bir ay seçilemez). Yazdırılabilir/PDF olarak kaydedilebilir, Excel&apos;e indirilebilir ya da özeti WhatsApp ile gönderilebilir.</li>
              <li>Tahsilatlar en eski borçtan başlayarak otomatik düşülür — bir siparişin &quot;ödendi&quot; sayılması için o siparişe özel bir tahsilat girmeniz gerekmez.</li>
              <li>Üstte <b>Toplam Borç/Alacak</b> özeti; &quot;Borç/Alacak Listesini İndir&quot; ile en yüksek borçtan başlayarak Excel&apos;e aktarılabilir.</li>
            </List>
            <SubHeading>Müşteri adını değiştirmek</SubHeading>
            <List>
              <li>Müşterinin adı düzenlendiğinde o isimle girilmiş geçmiş siparişler, randevular ve depo kayıtları da yeni isme taşınır, cari geçmişi aynı müşteride kalır. Aynı isimde başka bir müşteri zaten varsa değişiklik engellenir.</li>
            </List>
          </Section>

          <Section id="kurumsal" title="Kurumsal Müşteri & Filo" path="Müşteriler → Kurumsal" role="staff" lede="Filo, galeri, kurum gibi kurumsal müşteriler için firma sayfası ve araç listesi. Kurumsal müşteri ayrı bir kayıt değildir — mevcut müşteri Düzenle'den &quot;Kurumsal müşteri&quot; olarak işaretlenir, cari hesabı olduğu gibi kalır.">
            <List>
              <li>Kurumsal müşteriler Müşteriler sayfasında kendi sekmesinde listelenir; adına tıklanınca <b>firma sayfası</b> açılır: yetkili kişi, vergi no, bu ayın toplamı, cari bakiye, araçlar ve siparişler.</li>
              <li><b>+ Araç Ekle</b> ile firmanın araçları eklenir: plakaları yazabilir ya da firmanın geçmiş siparişlerinde geçen plakalardan seçebilirsiniz. Eski siparişler değiştirilmez; öneri yalnızca kolaylık içindir.</li>
              <li>Araçlar listesinde her aracın son servisi, sipariş sayısı, toplam harcaması ve depodaki lastiği görünür. Bu rakamlar firmanın adıyla girilmiş siparişlerden hesaplanır.</li>
              <li>Bir araç tek bir firmaya bağlı olabilir. Başka firmadaki bir aracı eklemek isterseniz taşımak için onay istenir. &quot;Çıkar&quot; aracı firmadan ayırır, geçmişini silmez.</li>
              <li>Galeri/bayi gibi her seferinde başka araç getiren müşterileri de kurumsal işaretleyebilirsiniz; bunlar için araç eklemeniz gerekmez (o araçlar galerinin değil, sahiplerinindir).</li>
              <li><b>Kurumsal indirim</b> — müşteri formunda bir indirim oranı (%) girilebilir. Ödeme Al &amp; Kapat&apos;ta tutar bu oranla indirimli gelir; &quot;İndirimsiz al&quot; ile tam tutara dönülebilir. Fark siparişte &quot;İndirim&quot; olarak görünür, cariye indirimli tutar yazılır.</li>
              <li><b>Toplu Mevsim Değişimi</b> — firma sayfasından, depoda lastiği olan araçlar tek seferde değiştirilir: depodaki kayıt teslim edilmiş sayılır, araçtan çıkan lastik aynı depo numarasına kaydedilir. Çıkan lastiğin bilgileri depodakinden dolar ve mevsim tersine çevrilir; farklıysa satırda düzeltilir. İsterseniz &quot;Her araç için sipariş aç&quot; ile seçtiğiniz hizmet ve tutarla her araca bir sipariş açılır (Beklemede). Yeni depo etiketleri Depolama ekranından yazdırılır.</li>
              <li>Toplu değişimde <b>İşlem Tarihi</b> geçmiş bir gün olabilir, ileri bir tarih olamaz; sipariş açıldıysa siparişler de o güne yazılır. &quot;Sipariş Numarasını Elle Gir&quot; açıksa her satıra sipariş numarası girilmelidir. Tek seferde en fazla 100 araç değiştirilir; satırlardan biri hatalıysa hiçbiri kaydedilmez. Bu işlem için Depolama düzenleme izni gerekir.</li>
              <li>Aracı getiren kişi sipariş detayında görünür, Düzelt ile değiştirilebilir ve İş Emri çıktısında yer alır.</li>
              <li>Firmaya bağlı araç varken kurumsal işareti kaldırılamaz; önce araçları çıkarın.</li>
              <li>Araç ekleme/çıkarma için Müşteriler düzenleme izni gerekir; tutarlar Siparişler görüntüleme izni olanlara görünür.</li>
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

          <Section id="takvim" title="Takvim" path="Takvim" role="staff" lede="Aylık işletme takvimi — randevular kendiliğinden görünür, üstüne belirli bir güne bağlı hatırlatma/not eklenebilir.">
            <List>
              <li>Ay görünümünde oklarla ay değiştirilir, &quot;Bugün&quot; ile bugüne dönülür.</li>
              <li>O aya düşen randevular günlerin altında salt-okunur olarak görünür; randevunun kendisi Randevular sayfasından yönetilir.</li>
              <li>Bir güne tıklanınca başlık ve ayrıntıyla <b>not</b> eklenir; notlar sonradan düzenlenip silinebilir.</li>
              <li>Personel için Kullanıcılar sayfasındaki Takvim satırından ayrıca izin verilir.</li>
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
              <li><b>Yıllık Özet</b> sekmesi her ay için Gelir (Ciro − Maliyet), Gider (Masraf) ve Kâr/Zarar gösterir. Kaydedilmemiş aylarda rakamlar sistemden önerilir; Yönetici &quot;Kaydet&quot;e bastığında o ayın rakamı sabitlenir, sonradan veriler değişse de kayıtlı hâli kalır.</li>
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

          <Section id="aktivite" title="Aktivite Geçmişi" path="Ayarlar → Aktivite Geçmişi" role="admin" lede="Hassas işlemlerde kimin, ne zaman, neyi değiştirdiğinin kaydı.">
            <List>
              <li>Sipariş oluşturma/düzenleme/silme ve ödeme alma, teklif oluşturma/düzenleme/durum değişikliği/silme/siparişe dönüştürme, cari hareketler ve kullanıcı değişiklikleri kaydedilir.</li>
              <li>Her kayıtta işlemi yapan kullanıcı, tarih-saat ve kısa bir açıklama (ör. plaka ve tutar) görünür. Kayıtlar değiştirilemez.</li>
            </List>
          </Section>

          <Section id="ayarlar" title="Genel Ayarlar" role="admin" lede="İşletmenizin panel genelindeki tercihleri — Ayarlar menüsü altında.">
            <List>
              <li><b>Marka</b> — Firma Logosu, Panel Logosu ve Firma Kaşesi görselleri; İş Emri çıktısında ve panel başlığında kullanılır.</li>
              <li><b>Şirket Bilgisi</b> — yetkili adı, telefon, web sitesi; Paylaşılan Stok&apos;ta karşı firmaya gösterilen iletişim bilgisidir.</li>
              <li><b>Fatura Bilgileri</b> — VKN/TCKN, vergi dairesi, adres; abonelik faturanız için kullanılır, kimseyle paylaşılmaz.</li>
              <li><b>Ödeme Şekilleri</b> — Nakit/POS/Cari/Mail Order dışında kendi ödeme tiplerinizi ekleyip kaldırabilirsiniz.</li>
              <li><b>Sipariş Numarasını Elle Gir</b> ve <b>Araç Plakası Zorunlu</b> — sipariş formunun davranışı (bkz. Yeni Sipariş). Daha önce girilmiş siparişler etkilenmez.</li>
              <li><b>Teklif Numarası Biçimi</b> — Sıralı (T-0001) veya Yıllık (T-2026-0001, her yıl 1&apos;den başlar). Yalnızca yeni teklifler etkilenir.</li>
              <li><b>Stoğumu Diğer Firmalarla Paylaş</b> — Paylaşılan Stok özelliğini açar/kapatır.</li>
              <li><b>Depolama uyarı eşiği</b>, <b>Sipariş Listesi varsayılan tarih filtresi</b>, <b>Müşterileri Otomatik Kaydet</b> gibi küçük davranış ayarları.</li>
              <li><b>Firma Kodu</b> — girişte kullanılan 6 haneli kod, salt okunur olarak burada görüntülenir.</li>
            </List>
          </Section>

          <Section id="profil" title="Profil & Görünüm" path="Ayarlar → Profil" role="all" lede="Kendi hesabınızın ayarları.">
            <List>
              <li>Kullanıcı adınızı ve şifrenizi değiştirebilirsiniz (şifre değişikliğinde mevcut şifre istenir).</li>
              <li><b>Görünüm</b> — Açık, Koyu veya Sistem (cihazınızın ayarını izler) teması. Seçim kullanıcınıza kaydedilir, tüm cihazlarınızda geçerli olur.</li>
            </List>
          </Section>

          <Section id="destek" title="Destek" path="Ayarlar → Destek" role="all" lede="Bir sorun ya da isteğinizi bize doğrudan panelden iletebileceğiniz talep sistemi.">
            <List>
              <li>&quot;Yeni Destek Talebi&quot; ile konu ve mesaj yazılır; yanıtlar aynı talebin altında yazışma olarak görünür.</li>
              <li>Size yanıt verildiğinde talep &quot;Sıra sizde&quot; olarak işaretlenir. Sayfadaki düğmeyle bu cihazda tarayıcı bildirimlerini açarsanız yanıt geldiğinde bildirim de alırsınız (yeni randevu bildirimleri Randevu Ayarları&apos;ndan açılır).</li>
              <li>Destek hiçbir izne bağlı değildir — firmanızdaki her kullanıcı talep açabilir.</li>
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
