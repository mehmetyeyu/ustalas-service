import type { Metadata } from "next";
import { COMPANY } from "../company";

export const metadata: Metadata = { title: "Gizlilik Sözleşmesi — Elevire" };

export default function GizlilikPage() {
  return (
    <>
      <h1>Gizlilik Sözleşmesi ve KVKK Aydınlatma Metni</h1>
      <p className="updated">Son güncelleme: 2026</p>

      <div className="disclaimer">
        Bu metin, {COMPANY.unvan} tarafından genel bilgilendirme amacıyla
        hazırlanmıştır ve hukuki danışmanlık yerine geçmez. Kendi işletmeniz
        için özel durumlar söz konusuysa bir hukuk danışmanına başvurmanızı
        öneririz.
      </div>

      <h2>1. Veri Sorumlusu</h2>
      <p>
        6698 sayılı Kişisel Verilerin Korunması Kanunu (&ldquo;KVKK&rdquo;) uyarınca veri
        sorumlusu, {COMPANY.unvan}&apos;dir ({COMPANY.adres}). Bu metin,{" "}
        {COMPANY.urunAdi} hizmetini kullanan firma yetkilileri ve
        kullanıcılarının kişisel verilerinin nasıl işlendiğini açıklar.
      </p>

      <h2>2. Toplanan Veriler</h2>
      <ul>
        <li>Kayıt sırasında: ad soyad, işletme adı, e-posta, telefon numarası.</li>
        <li>Hizmet kullanımı sırasında: firmanızın kendi girdiği sipariş, müşteri, stok ve muhasebe verileri.</li>
        <li>Abonelik/ödeme sırasında: yalnızca abonelik durumu ve plan bilgisi — kart bilgileriniz bizim sunucularımıza hiç ulaşmaz, doğrudan ödeme kuruluşu iyzico&apos;nun güvenli altyapısında işlenir.</li>
        <li>Teknik veriler: oturum/güvenlik amaçlı IP adresi ve temel kullanım logları.</li>
      </ul>

      <h2>3. İşleme Amaçları ve Hukuki Sebep</h2>
      <p>
        Kişisel verileriniz; hizmetin sunulması, hesabınızın oluşturulması ve
        yönetilmesi, abonelik/faturalandırma süreçlerinin yürütülmesi, destek
        taleplerinizin karşılanması ve yasal yükümlülüklerin yerine
        getirilmesi amacıyla, KVKK m.5&apos;te belirtilen &ldquo;sözleşmenin kurulması
        ve ifası&rdquo; ve &ldquo;hukuki yükümlülüğün yerine getirilmesi&rdquo; hukuki
        sebeplerine dayanılarak işlenir.
      </p>

      <h2>4. Verilerin Aktarılması</h2>
      <p>
        Verileriniz, hizmetin sunulabilmesi için gerekli ölçüde şu üçüncü
        taraflarla paylaşılabilir:
      </p>
      <ul>
        <li><strong>iyzico</strong> — abonelik/ödeme işlemlerinin yürütülmesi için.</li>
        <li>Sunucu/altyapı sağlayıcıları — hizmetin barındırılması için (veriler şifreli bağlantılar üzerinden işlenir).</li>
      </ul>
      <p>Verileriniz, yukarıdakiler dışında hiçbir üçüncü tarafa satılmaz veya kiralanmaz.</p>

      <h2>5. Saklama Süresi</h2>
      <p>
        Verileriniz, hesabınız aktif olduğu sürece ve yasal saklama
        yükümlülüklerimizin gerektirdiği süre boyunca saklanır. Hesabınızın
        kapatılmasını talep etmeniz halinde, yasal zorunluluklar dışındaki
        veriler makul bir süre içinde silinir veya anonimleştirilir.
      </p>

      <h2>6. Çerezler</h2>
      <p>
        Hizmetimiz, oturumunuzu açık tutmak (giriş bilgisi) için zorunlu
        çerezler kullanır. Pazarlama/reklam amaçlı üçüncü taraf çerezleri
        kullanılmamaktadır.
      </p>

      <h2>7. KVKK Kapsamındaki Haklarınız</h2>
      <p>KVKK m.11 uyarınca; kişisel verinizin işlenip işlenmediğini öğrenme, işlenmişse buna ilişkin bilgi talep etme, işlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme, yurt içinde/yurt dışında aktarıldığı üçüncü kişileri bilme, eksik/yanlış işlenmişse düzeltilmesini isteme, silinmesini/yok edilmesini isteme ve bu işlemlerin aktarıldığı üçüncü kişilere bildirilmesini isteme haklarına sahipsiniz.</p>

      <h2>8. Başvuru</h2>
      <p>
        Yukarıdaki haklarınızı kullanmak için{" "}
        <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a> adresine
        e-posta gönderebilir veya {COMPANY.kep} KEP adresimize resmi
        bildirimde bulunabilirsiniz.
      </p>
    </>
  );
}
