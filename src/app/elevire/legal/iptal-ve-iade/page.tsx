import type { Metadata } from "next";
import { COMPANY } from "../company";

export const metadata: Metadata = { title: "İptal ve İade Koşulları — Elevire" };

export default function IptalVeIadePage() {
  return (
    <>
      <h1>İptal ve İade Koşulları</h1>
      <p className="updated">Son güncelleme: 2026</p>

      <h2>Teslimat</h2>
      <p>
        {COMPANY.urunAdi} tamamen elektronik ortamda sunulan bir yazılım
        (SaaS) hizmetidir; fiziksel bir ürün teslimatı söz konusu değildir.
        Abonelik onaylandığı anda hesabınız kullanıma hazır hale gelir.
      </p>

      <h2>Ücretsiz Deneme</h2>
      <p>
        Yeni kayıt olan her firma, kredi kartı bilgisi girmeden 7 gün
        boyunca hizmeti ücretsiz kullanabilir. Deneme süresi boyunca hiçbir
        ücret alınmaz; deneme süresi içinde vazgeçmeniz halinde herhangi bir
        işlem yapmanız gerekmez, ödeme bilgisi girilmediği için otomatik
        olarak ücretlendirilmezsiniz.
      </p>

      <h2>Aboneliği İptal Etme</h2>
      <p>
        Ücretli bir plana geçtikten sonra aboneliğinizi dilediğiniz zaman{" "}
        <code>/admin/billing</code> sayfasından, tek tıkla iptal
        edebilirsiniz. İptal talebiniz anında işleme alınır:
      </p>
      <ul>
        <li>Bir daha sizden ödeme tahsil edilmez.</li>
        <li>O ana kadar ödemiş olduğunuz dönem için erişiminiz, dönemin sonuna kadar (aylık planda ilgili ayın, yıllık planda ilgili yılın sonuna kadar) kesintisiz devam eder.</li>
        <li>Dönem sona erdiğinde hesabınız otomatik olarak kısıtlanır; dilediğiniz zaman yeniden abone olarak erişiminizi tekrar açabilirsiniz.</li>
      </ul>

      <h2>İade Politikası</h2>
      <p>
        Dijital hizmetin niteliği gereği, kullanılmış bir abonelik dönemi
        için nakit iade yapılmamaktadır — iptal işlemi yalnızca gelecekteki
        tahsilatları durdurur, geçmiş ödemeler için ücret iadesi
        sağlanmaz. Sistemsel bir hata nedeniyle yanlış veya mükerrer bir
        tahsilat yapıldığını düşünüyorsanız, lütfen{" "}
        <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a> adresinden
        bizimle iletişime geçin; bu tür durumlar incelenip haklı bulunması
        halinde ilgili tutar iade edilir.
      </p>

      <h2>Ödeme Sorunları</h2>
      <p>
        Otomatik yenilemede ödemenin alınamaması durumunda hesabınıza
        erişiminiz kısıtlanır. Bu durumda <code>/admin/billing</code>{" "}
        sayfasından geçerli bir ödeme yöntemiyle yeniden abone olarak
        erişiminizi tekrar aktifleştirebilirsiniz.
      </p>

      <h2>İletişim</h2>
      <p>
        İptal, iade veya ödeme ile ilgili her türlü soru için{" "}
        <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a> adresinden
        bize ulaşabilirsiniz.
      </p>
    </>
  );
}
