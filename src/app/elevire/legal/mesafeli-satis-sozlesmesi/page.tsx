import type { Metadata } from "next";
import { COMPANY } from "../company";

export const metadata: Metadata = { title: "Mesafeli Satış Sözleşmesi — Elevire" };

export default function MesafeliSatisSozlesmesiPage() {
  return (
    <>
      <h1>Mesafeli Satış Sözleşmesi</h1>
      <p className="updated">Son güncelleme: 2026</p>

      <div className="disclaimer">
        Bu sözleşme, 6502 sayılı Tüketicinin Korunması Hakkında Kanun ve
        Mesafeli Sözleşmeler Yönetmeliği’nin genel çerçevesine uygun olarak
        hazırlanmış genel bir şablondur; hukuki danışmanlık yerine geçmez.
        Yürürlüğe almadan önce bir hukuk danışmanına gözden geçirtmenizi
        öneririz.
      </div>

      <h2>1. Taraflar</h2>
      <p>
        <strong>Satıcı:</strong> {COMPANY.unvan} ({COMPANY.adres}, {COMPANY.postaKodu}
        {" "}— Vergi Dairesi: {COMPANY.vergiDairesi}, Vergi No: {COMPANY.vergiNo},
        Ticaret Sicil No: {COMPANY.ticaretSicilNo}, MERSİS No: {COMPANY.mersisNo},
        KEP: {COMPANY.kep}, E-posta: {COMPANY.email}) — bundan böyle
        &ldquo;Satıcı&rdquo; olarak anılacaktır.
      </p>
      <p>
        <strong>Alıcı:</strong> {COMPANY.urunAdi} hizmetine{" "}
        <code>/kayit</code> sayfası üzerinden kayıt olarak veya Satıcı ile
        anlaşarak bu sözleşmeyi kabul eden gerçek/tüzel kişi — bundan böyle
        &ldquo;Abone&rdquo; olarak anılacaktır.
      </p>

      <h2>2. Sözleşmenin Konusu</h2>
      <p>
        Bu sözleşmenin konusu, Satıcı’ya ait {COMPANY.urunAdi} adlı bulut
        tabanlı (SaaS) lastik servisi yönetim yazılımının, Abone tarafından
        seçilen abonelik planı (Aylık veya Yıllık) kapsamında elektronik
        ortamda kullanıma sunulmasına ilişkin tarafların hak ve
        yükümlülüklerinin belirlenmesidir.
      </p>

      <h2>3. Hizmetin Temel Nitelikleri ve Ücreti</h2>
      <p>
        Hizmet, tamamen elektronik ortamda, internet tarayıcısı üzerinden
        sunulan bir yazılım abonelik hizmetidir; fiziksel bir teslimat söz
        konusu değildir. Güncel plan seçenekleri (Aylık/Yıllık) ve bunlara
        ait ücretler, Abone’nin abonelik işlemini gerçekleştirdiği ödeme
        sayfasında (<code>/admin/billing</code>) açıkça gösterilir ve Abone,
        ödemeyi onaylamadan önce bu bilgileri görür. Yeni kayıt olan Abone’ye
        ücretsiz, kredi kartı bilgisi istenmeyen 7 günlük bir deneme süresi
        tanınır; ücretlendirme yalnızca Abone’nin deneme süresi içinde veya
        sonunda bilinçli olarak bir plan seçip ödeme bilgisini girmesiyle
        başlar.
      </p>
      <p>
        Abonelik ücretleri, Satıcı tarafından Türk Lirası (TL) cinsinden
        sabit bir tutar olarak belirlenir ve zaman zaman güncellenebilir;
        yürürlükteki güncel tutar her zaman ödeme sayfasında (
        <code>/admin/billing</code>) görüntülenebilir. Olası bir fiyat
        güncellemesi, Abone’nin o an devam eden ve ödemesi zaten yapılmış
        olan dönemini etkilemez; yalnızca bir sonraki yenileme döneminden
        itibaren uygulanır. Aylık planlarda yenileme aralığı kısa
        olduğundan (bir ay), fiyat her yenilemede değişmeyebilir; Yıllık
        planlarda ise yenileme aralığı bir yıl olduğundan, bir sonraki
        yenileme tutarının bir önceki döneme göre farklı olması olağandır.
        Abone, güncellenen tutarı kabul etmek istemezse aboneliğini
        yenileme tarihinden önce, aşağıdaki 8. maddede açıklanan şekilde
        iptal ederek yeni tutar üzerinden ücretlendirilmekten kaçınabilir;
        aksi halde yenileme tarihinde güncel tutar üzerinden tahsilat
        yapılmaya devam eder.
      </p>

      <h2>4. Ödeme Şekli</h2>
      <p>
        Ödemeler, Satıcı’nın anlaşmalı ödeme kuruluşu <strong>iyzico</strong>{" "}
        altyapısı üzerinden, kredi/banka kartı ile alınır. Kart bilgileri
        Satıcı’nın sunucularına hiçbir şekilde ulaşmaz, doğrudan iyzico’nun
        güvenli ödeme sayfasında işlenir. Seçilen plana göre ödeme, her ay
        veya her yıl otomatik olarak tekrarlanır (yenilenir).
      </p>

      <h2>5. Abone Yükümlülükleri</h2>
      <p>
        Abone; kayıt sırasında verdiği bilgilerin doğru ve güncel olduğunu,
        hesap şifresini gizli tutmakla ve hesabı üzerinden gerçekleştirilen
        tüm işlemlerden sorumlu olduğunu, hizmeti yalnızca yasal amaçlarla ve
        işbu sözleşmeye uygun şekilde kullanacağını kabul eder. Hesabına
        yetkisiz erişim şüphesi durumunda Abone, durumu gecikmeksizin
        Satıcı’ya bildirir. Abone, hizmeti kullanırken üçüncü kişilerin
        (kendi müşterileri dahil) kişisel verilerini KVKK’ya uygun şekilde
        işlemekle yükümlüdür (bkz. Gizlilik Sözleşmesi Madde 1).
      </p>

      <h2>6. Fikri Mülkiyet Hakları</h2>
      <p>
        {COMPANY.urunAdi} yazılımına, tasarımına, marka ve logolarına ilişkin
        tüm fikri mülkiyet hakları Satıcı’ya aittir. İşbu sözleşme, Abone’ye
        yalnızca kişisel/kurumsal kullanım amaçlı, devredilemez ve münhasır
        olmayan bir kullanım hakkı tanır; Abone’ye yazılımın kaynak kodu,
        tasarımı veya markası üzerinde herhangi bir mülkiyet hakkı verilmez.
        Abone’nin hizmete kendi girdiği veriler (sipariş, müşteri, stok, cari
        vb.) Abone’ye aittir; Satıcı bu verileri yalnızca hizmetin sunulması
        amacıyla işler (bkz. Gizlilik Sözleşmesi Madde 1).
      </p>

      <h2>7. Cayma Hakkı</h2>
      <p>
        Mesafeli Sözleşmeler Yönetmeliği’nin 15. maddesi uyarınca, elektronik
        ortamda anında ifa edilen hizmetler ve elektronik ortamda anında
        teslim edilen gayrimaddi mallara ilişkin sözleşmelerde, Abone’nin bu
        durumu bilerek onay vermesi halinde cayma hakkı bulunmamaktadır.
        {COMPANY.urunAdi}, Abone’nin ödeme yapmadan önce 7 gün boyunca hizmeti
        ücretsiz deneyebildiği bir yapı sunduğundan, ücretli abonelik
        onayı verildiği anda hizmetin ifasına başlanmaktadır ve Abone bu
        onayı vererek cayma hakkının bu kapsamda kullanılamayacağını kabul
        etmiş sayılır. Buna rağmen Abone, aşağıdaki 8. maddede açıklanan
        şekilde aboneliğini dilediği zaman iptal edebilir.
      </p>

      <h2>8. Fesih ve İptal (Abone Tarafından)</h2>
      <p>
        Abone, aboneliğini <code>/admin/billing</code> sayfasından dilediği
        zaman, herhangi bir gerekçe göstermeksizin iptal edebilir. İptal
        talebiyle birlikte gelecek dönemler için tekrar tahsilat
        yapılmaz; ancak Abone’nin o ana kadar ödemiş olduğu, henüz
        tamamlanmamış dönem için erişimi, ödenen dönemin sonuna kadar
        devam eder ve kalan süreye ilişkin nakit iade yapılmaz. Ayrıntılar
        için &ldquo;İptal ve İade Koşulları&rdquo; sayfasına bakınız.
      </p>

      <h2>9. Satıcı Tarafından Fesih</h2>
      <p>
        Satıcı; Abone’nin işbu sözleşmeye veya yürürlükteki mevzuata aykırı
        davrandığını tespit etmesi, hizmeti kötüye kullanması (ör. yetkisiz
        erişim denemesi, sistemin güvenliğini tehdit eden davranış) veya
        ödeme yükümlülüklerini yerine getirmemesi hâlinde, Abone’yi
        bilgilendirerek hesabını askıya alma veya sözleşmeyi feshetme
        hakkını saklı tutar. Bu şekilde yapılan bir fesih, Abone’nin o ana
        kadar ödemiş olduğu ücretlerin iadesini gerektirmez.
      </p>

      <h2>10. Sorumluluk Sınırlaması</h2>
      <p>
        Hizmet &ldquo;olduğu gibi&rdquo; sunulur; Satıcı, hizmetin kesintisiz,
        hatasız veya Abone’nin tüm beklentilerini karşılayacağı yönünde bir
        garanti vermez. Satıcı; mücbir sebepler, internet altyapısı veya
        üçüncü taraf hizmet sağlayıcıları (ör. ödeme kuruluşu, sunucu
        barındırma hizmeti) kaynaklı kesinti veya aksaklıklardan doğan
        zararlardan sorumlu tutulamaz. Satıcı’nın işbu sözleşmeden doğan
        sorumluluğu, Abone’nin son on iki (12) ay içinde ödediği toplam
        abonelik bedeli ile sınırlıdır; Satıcı hiçbir durumda dolaylı
        zararlardan (kâr kaybı, veri kaybı, iş kaybı vb.) sorumlu tutulamaz.
        Bu sınırlama, Satıcı’nın kastından veya ağır ihmalinden doğan
        sorumluluğunu ortadan kaldırmaz.
      </p>

      <h2>11. Ödeme Sorunları</h2>
      <p>
        Otomatik yenileme sırasında ödemenin herhangi bir sebeple
        gerçekleştirilememesi halinde, Abone’nin hizmete erişimi
        kısıtlanır; Abone dilediği zaman geçerli bir ödeme yöntemiyle
        yeniden abone olarak erişimini tekrar aktifleştirebilir.
      </p>

      <h2>12. Uyuşmazlıkların Çözümü</h2>
      <p>
        İşbu sözleşmeden doğan uyuşmazlıklarda, Ticaret Bakanlığı’nca her yıl
        ilan edilen parasal sınırlar dahilinde Abone’nin yerleşim yerindeki
        veya işlemin yapıldığı yerdeki Tüketici Hakem Heyetleri, bu sınırları
        aşan uyuşmazlıklarda ise Tüketici Mahkemeleri yetkilidir.
      </p>

      <h2>13. Yürürlük</h2>
      <p>
        Abone, kayıt formunu ve/veya ödeme onay adımını tamamlayarak işbu
        sözleşmenin tüm hükümlerini okuduğunu, anladığını ve kabul ettiğini
        beyan eder.
      </p>
    </>
  );
}
