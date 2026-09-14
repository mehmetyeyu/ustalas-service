import type { Metadata } from "next";
import { COMPANY } from "../company";

export const metadata: Metadata = { title: "Hakkımızda — Elevire" };

export default function HakkimizdaPage() {
  return (
    <>
      <h1>Hakkımızda</h1>
      <p className="updated">{COMPANY.urunAdi}, {COMPANY.marka} markası altında geliştirilmiştir.</p>

      <p>
        {COMPANY.urunAdi}, lastik servislerinin günlük işlerini (sipariş, stok,
        depolama, cari hesap, kasa, randevu ve raporlama) tek bir ekrandan
        yönetebilmesi için geliştirilmiş bir yönetim yazılımıdır. Kurulum
        gerektirmez, tarayıcı üzerinden her cihazdan erişilir.
      </p>
      <p>
        Ürünü geliştiren ve işleten şirket, gerçek bir lastik servisinin
        günlük operasyonundan doğan ihtiyaçları gözlemleyerek yola çıkmış,
        sahadan gelen geri bildirimlerle sürekli geliştirilen bir yazılım
        ekibidir.
      </p>

      <h2>Şirket Bilgileri</h2>
      <div className="company-box">
        <p><strong>{COMPANY.unvan}</strong></p>
        <p>{COMPANY.adres}, {COMPANY.postaKodu}</p>
        <p>Vergi Dairesi: {COMPANY.vergiDairesi} — Vergi No: {COMPANY.vergiNo}</p>
        <p>Ticaret Sicil No: {COMPANY.ticaretSicilNo} — MERSİS No: {COMPANY.mersisNo}</p>
        <p>KEP: {COMPANY.kep}</p>
        <p>E-posta: <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a></p>
      </div>

      <h2>İletişim</h2>
      <p>
        Sorularınız, talepleriniz veya destek ihtiyaçlarınız için{" "}
        <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a> adresinden bize
        ulaşabilirsiniz. Resmi/yasal bildirimler için KEP adresimiz{" "}
        {COMPANY.kep} kullanılabilir.
      </p>
    </>
  );
}
