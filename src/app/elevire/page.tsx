import type { Metadata, Viewport } from "next";
import { formatTry } from "@/lib/exchangeRate";
import { ELEVIRE_ORIGIN, SOCIAL_LINKS } from "@/lib/site";
import { getPlatformPricing } from "@/lib/platformPricing";
import { COMPANY } from "./legal/company";
import { Arrow, Dual, SiteFooter, SiteNav, TryButton, WHATSAPP_URL } from "./SiteChrome";
import MetaPixel from "./MetaPixel";
import { Check } from "./Check";
import Logo from "./Logo";
import DemoVideo from "./DemoVideo";
import FeatureTabs, { type FeatureTab } from "./FeatureTabs";
import PricingCard from "./PricingCard";
import { geist, geistMono } from "./fonts";
import { CSS } from "./styles";

// Figma "Elevire — Web Sitesi Tasarımı" (A5dbF6UlUizKEsSlT2yNO8), siyah tema:
// masaüstü 15:505, mobil 21:673; metin ve düzen birebir (kullanıcı kararı
// 2026-11-25). Mobil çerçevenin metni/içeriği farklı olan yerlerde iki sürüm
// birlikte basılır, CSS birini gizler (.only-wide / .only-narrow). Ürün
// görselleri HTML/CSS ile çizilir. Fiyat platform_pricing'ten gelir. Mobildeki
// "Kullananlar" bölümü tasarımda yer tutucudur; gerçek yorum gelince eklenir.

// Başlık/açıklama arama niyetine göre: "lastik servis programı",
// "lastik oteli takip", "lastikçi stok programı" — marka başta.
const TITLE = "Elevire — Lastik Servis Programı | Stok, Müşteri ve Lastik Oteli";
const DESCRIPTION =
  "Lastikçiler ve oto servisler için yönetim yazılımı: iş emri, lastik stoğu, lastik oteli (depo), müşteri ve araç geçmişi, cari ve raporlar tek ekranda. 7 gün ücretsiz deneyin, kredi kartı gerekmez.";

export const metadata: Metadata = {
  // Asıl adres her host'ta elevire.yeyu.co/ (bkz. src/lib/site.ts) — sayfa
  // orada "/" yoluna rewrite ile sunulur; lastik.yeyu.co/elevire kopyası da
  // buraya bağlanır.
  metadataBase: new URL(ELEVIRE_ORIGIN),
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    url: "/",
    title: TITLE,
    description: DESCRIPTION,
    siteName: "Elevire",
    locale: "tr_TR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = { themeColor: "#07080a" };

const SERVICES = [
  "Lastik değişimi", "Rot balans", "Jant düzeltme", "Mevsim değişimi", "Lastik oteli", "Nitrojen hava",
  "Lastik tamiri", "Jant satışı", "Klima gazı", "Far ayarı", "Balans", "Lastik satışı",
];

const COMPARE = [
  { old: "Kimin lastiği hangi rafta? Defter karıştırılır.", oldM: "Defter karıştırılır", now: "Plakayı yaz, 3 saniyede bul.", nowM: "Plakayı yaz, 3 saniyede bul" },
  { old: "Stok sayımı depoda, elle yapılır.", oldM: "Stok elle sayılır", now: "Satış girildiği an stok düşer.", nowM: "Satışta stok kendiliğinden düşer" },
  { old: "Cari borç üç ayrı Excel dosyasında.", oldM: "Cari üç ayrı Excel'de", now: "Ekstre tek dokunuşla WhatsApp'ta.", nowM: "Ekstre tek dokunuşla WhatsApp'ta" },
  { old: "Ay sonu kâr hesap makinesiyle tahmin edilir.", now: "Kâr ve kasa her an güncel." },
];

const STEPS = [
  { title: "Hesabını aç", text: "E-posta ve telefonla 2 dakikada kaydol. Kredi kartı istemiyoruz.", textM: "2 dakikada kaydol. Kredi kartı istemiyoruz." },
  { title: "Verini taşı", text: "Stok ve müşteri listeni Excel'den içe aktar. Takılırsan WhatsApp'tan yaz.", textM: "Stok ve müşteri listeni Excel'den aktar." },
  { title: "İlk iş emrini aç", text: "Plakayı yaz ve başla. 7 gün boyunca tüm özellikler açık.", textM: "Plakayı yaz ve başla. 7 gün her şey açık." },
];

const INCLUDED = [
  "İş emri, sipariş ve parçalı tahsilat",
  "Lastik stoğu, DOT ve parti takibi",
  "Lastik oteli ve etiket yazdırma",
  "Cari, ekstre ve WhatsApp gönderimi",
  "Kasa, masraf ve raporlar",
  "Online randevu sayfası",
  "Çoklu kullanıcı ve yetki",
  "WhatsApp destek hattı",
];
const INCLUDED_MOBILE = ["Tüm modüller dahil", "Çoklu kullanıcı ve yetki", "WhatsApp destek", "Taahhüt yok, istediğin an iptal"];
const SERVICES_MOBILE = ["Lastik değişimi", "Rot balans", "Mevsim değişimi", "Lastik oteli", "Jant düzeltme", "Nitrojen"];

function faqItems(monthlyPrice: string, yearlyPrice: string) {
  return [
    {
      q: "Kurulum gerekiyor mu?",
      a: "Hayır. Elevire tarayıcıda çalışır; bilgisayar, tablet ve telefondan aynı hesapla girersin.",
    },
    {
      q: "Deneme bitince ne olur?",
      a: `Kart istemediğimiz için senden kendiliğinden ücret alınmaz. Devam etmek istersen aylık ${monthlyPrice} TL ya da yıllık ${yearlyPrice} TL planı seçersin; kayıtların kaldığı yerden devam eder. Taahhüt yoktur.`,
    },
    {
      q: "Birden fazla çalışan kullanabilir mi?",
      a: "Evet. Her çalışana ayrı kullanıcı açar, hangi ekranları göreceğini ve neleri değiştirebileceğini tek tek belirlersin.",
    },
    {
      q: "Excel'deki verilerimi taşıyabilir miyim?",
      a: "Evet. Lastik stoğunu, müşteri listeni, depodaki lastikleri ve geçmiş siparişlerini hazır şablonlarla Excel'den içe aktarabilirsin.",
    },
    {
      wideOnly: true,
      q: "Lastik oteli nasıl çalışıyor?",
      a: "Müşterinin lastiklerini depoya alırken plaka, ebat, DOT ve diş derinliğiyle kaydedersin; depo numarası verilir, etiketi yazdırılır. Hangi lastiğin ne zamandır beklediğini ve kime teslim edildiğini listeden görürsün.",
    },
    {
      q: "Verilerim güvende mi?",
      a: "Her firmanın verisi ayrıdır ve yalnızca kendi kullanıcıları görebilir. Bağlantı şifrelidir, parolalar geri çevrilemeyecek biçimde saklanır. Kart bilgin bize hiç gelmez; ödemeyi iyzico alır.",
    },
  ];
}

// Organization (yasal kimlik) + WebSite (marka adı → site eşlemesi; Google
// "elevire" aramasında site adını buradan alır) + SoftwareApplication
// (ürün, fiyatlarıyla). sameAs'a sosyal hesaplar eklenince marka ile
// Instagram vb. Google'da bağlanır.
function jsonLd(monthlyPrice: number, yearlyPrice: number): string {
  const org = { "@id": `${ELEVIRE_ORIGIN}/#organization` };
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        ...org,
        name: "Elevire",
        legalName: COMPANY.unvan,
        url: `${ELEVIRE_ORIGIN}/`,
        logo: `${ELEVIRE_ORIGIN}/logo-elevire.svg`,
        email: COMPANY.email,
        telephone: COMPANY.telefon,
        taxID: COMPANY.vergiNo,
        address: {
          "@type": "PostalAddress",
          streetAddress: COMPANY.adres,
          postalCode: COMPANY.postaKodu,
          addressLocality: "İstanbul",
          addressCountry: "TR",
        },
        sameAs: SOCIAL_LINKS.map((s) => s.href),
      },
      {
        "@type": "WebSite",
        "@id": `${ELEVIRE_ORIGIN}/#website`,
        name: "Elevire",
        url: `${ELEVIRE_ORIGIN}/`,
        inLanguage: "tr-TR",
        publisher: org,
      },
      {
        "@type": "SoftwareApplication",
        name: "Elevire",
        description: DESCRIPTION,
        url: `${ELEVIRE_ORIGIN}/`,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        inLanguage: "tr-TR",
        publisher: org,
        offers: [
          { "@type": "Offer", name: "Aylık", price: monthlyPrice, priceCurrency: "TRY", url: `${ELEVIRE_ORIGIN}/kayit` },
          { "@type": "Offer", name: "Yıllık", price: yearlyPrice, priceCurrency: "TRY", url: `${ELEVIRE_ORIGIN}/kayit` },
        ],
      },
    ],
  };
  // "</script>" kaçışı — metinler sabit olsa da JSON'u script içine güvenle göm.
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

// Konuşma balonu + içinde dolu ahize — tek
// başına balon (WhatsappIcon) küçük boyutta WhatsApp olarak tanınmıyordu.
function WhatsappIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M19.2 11.28C19.1985 12.4971 18.8885 13.694 18.299 14.7588C17.7094 15.8236 16.8595 16.7215 15.8288 17.3687C14.798 18.016 13.62 18.3913 12.4048 18.4597C11.1896 18.5282 9.97695 18.2874 8.88005 17.76L4.80005 19.2L6.12005 15.36C5.4649 14.4327 5.03834 13.3637 4.87517 12.2401C4.71201 11.1165 4.81687 9.97027 5.1812 8.89495C5.54553 7.81963 6.159 6.84571 6.97152 6.0527C7.78404 5.25969 8.77259 4.67008 9.85645 4.33199C10.9403 3.99391 12.0888 3.91694 13.208 4.10737C14.3273 4.29779 15.3857 4.75022 16.2968 5.42771C17.2079 6.10519 17.9458 6.98854 18.4504 8.00563C18.9549 9.02271 19.2118 10.1447 19.2 11.28Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <g transform="translate(7.3 6.6) scale(0.4)">
        <path
          d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"
          fill="currentColor"
        />
      </g>
    </svg>
  );
}

function SectionTag({ children }: { children: React.ReactNode }) {
  return <p className="tag mono">{children}</p>;
}

function Plate({ children, size }: { children: string; size?: "sm" | "lg" }) {
  return <span className={`plate mono${size ? ` plate-${size}` : ""}`}>{children}</span>;
}

// Hero'daki panel görünümü — örnek veriyle çizilmiş süs (ekran okuyucuya
// tek bir görsel olarak okunur).
const HERO_JOBS = [
  { plate: "34 KLM 482", name: "Murat P.", job: "Lastik değişimi · 4 adet", jobM: "Lastik değişimi", amount: "₺3.240", status: "Tamamlandı", tone: "green" },
  { plate: "06 ANK 77", name: "Elif D.", job: "Rot balans", amount: "₺1.500", status: "Devam ediyor", tone: "orange" },
  { plate: "35 IZM 303", name: "Hasan Ç.", job: "Pirelli P Zero · 2 adet", jobM: "Pirelli P Zero · 2", amount: "₺9.600", status: "Ödeme bekliyor", tone: "blue" },
  { plate: "34 ELV 216", name: "Can A.", job: "Mevsim değişimi + depo", amount: "₺2.200", status: "Tamamlandı", tone: "green" },
  { plate: "16 BRS 410", name: "Ayşe K.", job: "Jant düzeltme", amount: "₺1.800", status: "Devam ediyor", tone: "orange" },
];
const HERO_STATS = [
  { label: "Bugünkü ciro", value: "₺18.450", note: "+12%", tone: "green" },
  { label: "Açık iş emri", value: "7", note: "3 ödeme bekliyor", tone: "" },
  { label: "Stoktaki lastik", value: "523", note: "5 kod tükendi", tone: "orange" },
  { label: "Depodaki set", value: "128", note: "2 set 6+ ay", tone: "orange" },
];
const HERO_STORAGE = [
  { plate: "34 KLM 482", text: "Kışlık · Raf B-12" },
  { plate: "35 IZM 303", text: "Kışlık · 7 aydır depoda", hot: true },
  { plate: "06 ANK 77", text: "Yazlık · Jantlı · Raf A-03" },
  { plate: "34 ELV 216", text: "4 mevsim · Raf C-07" },
];

function HeroVisual() {
  return (
    <div className="visual" role="img" aria-label="Elevire genel bakış ekranı: bugünkü ciro, açık iş emirleri, lastik stoğu ve lastik oteli">
      <div className="frame">
        <div className="ui">
          <div className="ui-side">
            <Logo className="ui-logo" />
            {["Genel bakış", "İş emirleri", "Lastik stoğu", "Lastik oteli", "Müşteriler & cari", "Kasa", "Raporlar", "Randevular"].map((t, i) => (
              <span key={t} className={`ui-link${i === 0 ? " on" : ""}`}>{t}</span>
            ))}
          </div>
          <div className="ui-main">
            <div className="ui-top">
              <div>
                <span className="ui-title">Genel bakış</span>
                <span className="ui-sub"><Dual wide="Salı, 24 Kasım · Aksoy Lastik" narrow="Aksoy Lastik · 7 açık iş" /></span>
              </div>
              <div className="ui-tools">
                <span className="ui-search">Plaka, müşteri ara…<span className="mono">⌘K</span></span>
                <span className="ui-new"><Dual wide="Yeni iş emri" narrow="+ İş emri" /></span>
              </div>
            </div>
            <div className="ui-stats">
              {HERO_STATS.map((s) => (
                <div key={s.label} className="ui-stat">
                  <span>{s.label}</span>
                  <span><b>{s.value}</b> <i className={s.tone}>{s.note}</i></span>
                </div>
              ))}
            </div>
            <div className="ui-cols">
              <div className="ui-jobs">
                <div className="ui-row ui-head mono"><span>PLAKA</span><span>MÜŞTERİ / İŞLEM</span><span>TUTAR</span><span>DURUM</span></div>
                {HERO_JOBS.map((j) => (
                  <div key={j.plate} className="ui-row">
                    <span><Plate>{j.plate}</Plate></span>
                    <span className="ui-job"><b>{j.name}</b><span>{j.jobM ? <Dual wide={j.job} narrow={j.jobM} /> : j.job}</span></span>
                    <b>{j.amount}</b>
                    <span className={`ui-status ${j.tone}`}><span>{j.status}</span></span>
                  </div>
                ))}
              </div>
              <div className="ui-store">
                <div className="ui-store-head"><b>Lastik oteli</b><span className="mono">128 set</span></div>
                {HERO_STORAGE.map((s) => (
                  <div key={s.plate} className={`ui-store-row${s.hot ? " hot" : ""}`}><Plate size="sm">{s.plate}</Plate>{s.text}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="float float-stock">
        <span className="float-icon green">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.73" strokeLinecap="round" strokeLinejoin="round"><path d="m3.4 8.4 3 3 6.2-6.4" /></svg>
        </span>
        <span><b>Stoktan otomatik düştü</b><span>Pirelli 235/40R18 · −4 adet</span></span>
      </div>
      <div className="float float-wa">
        <span className="float-icon green"><WhatsappIcon className="float-wa-icon" /></span>
        <span><b>Ekstre WhatsApp&apos;ta</b><span>Can Aydın · Kasım ekstresi</span></span>
      </div>
    </div>
  );
}

function ShowText({ no, label, title, text, checks }: { no: string; label: string; title: React.ReactNode; text: string; checks: string[] }) {
  return (
    <div className="show-text">
      <p className="mono yellow">{no} — {label}</p>
      <h3>{title}</h3>
      <p className="lead">{text}</p>
      <ul>{checks.map((c) => <Check key={c}>{c}</Check>)}</ul>
    </div>
  );
}

function Line({ title, sub, qty, amount, tone, hot }: { title: string; sub?: string; qty?: string; amount: string; tone?: string; hot?: boolean }) {
  return (
    <div className={`line${hot ? " hot" : ""}`}>
      <span className="line-text"><b>{title}</b>{sub && <span>{sub}</span>}</span>
      {qty && <span className="mono line-qty">{qty}</span>}
      <b className={tone}>{amount}</b>
    </div>
  );
}

const TABS: FeatureTab[] = [
  {
    id: "is-emri",
    label: "İş emri",
    panel: (
      <>
        <ShowText
          no="01" label="İŞ EMRİ"
          title={<>Plakayı yaz.<br />Gerisi kendiliğinden.</>}
          text="Müşteri, araç geçmişi ve fiyat otomatik gelir. Ödemeyi nakit, kart, havale ya da cariye bölerek al; stok ve kasa anında güncellenir."
          checks={["Araç geçmişi plakadan gelir", "Parçalı ödeme ve cari", "Her işin kârı anında görünür"]}
        />
        <div className="mock" aria-hidden="true">
          <div className="mock-head"><b>Yeni iş emri</b><span className="mono">#2416</span></div>
          <div className="line plate-line"><Plate size="lg">34 ELV 216</Plate><span className="line-text"><b>Can Aydın · Ford Focus</b><span>Son ziyaret 12 Eki · 3 iş emri · cari ₺7.200</span></span></div>
          <Line title="Lastik satışı" sub="Goodyear Vector 4Seasons · 215/60 R16" qty="× 4" amount="₺21.440" />
          <Line title="Balans + montaj" sub="Servis işçiliği" qty="× 1" amount="₺800" />
          <div className="pays">
            {[["NAKİT", "₺10.000"], ["KART", "₺9.240"], ["HAVALE", "—"], ["CARİ", "₺3.000"]].map(([k, v]) => (
              <div key={k} className={`pay${v === "—" ? "" : " on"}`}><span className="mono">{k}</span><b>{v}</b></div>
            ))}
          </div>
          <div className="mock-total">
            <div><span className="mono">TOPLAM</span><b>₺22.240</b></div>
            <div className="right"><span className="mono">KÂR</span><b className="green">+₺12.040</b></div>
          </div>
        </div>
      </>
    ),
  },
  {
    id: "stok",
    label: "Lastik stoğu",
    panel: (
      <>
        <ShowText
          no="02" label="LASTİK STOĞU"
          title={<>Sattığın an<br />stoktan düşer.</>}
          text="Marka, ebat, DOT ve tedarikçi bazında parti takibi. Barkodla ya da Excel'den stok gir, eşiğin altına düşen ürünü gör."
          checks={["Parti ve DOT takibi", "Alış maliyeti ve kâr yüzdesi", "Minimum stok uyarısı"]}
        />
        <div className="mock" aria-hidden="true">
          <div className="mock-head"><b>Ürün kataloğu</b><span className="mono">523 ADET</span></div>
          <Line title="Kumho WinterCraft" sub="205/60 R15 · Kış · DOT 32/26" qty="Depo" amount="45" />
          <Line title="Goodyear Vector 4Seasons" sub="215/60 R16 · 4 mevsim · DOT 18/26" qty="−4" amount="10" hot />
          <Line title="Pirelli P Zero" sub="235/40 R18 · Yaz · DOT 09/26" qty="Mağaza" amount="13" />
          <Line title="Michelin Alpin 6" sub="205/55 R16 · Kış" qty="Düşük stok" amount="2" tone="orange" />
        </div>
      </>
    ),
  },
  {
    id: "otel",
    label: "Lastik oteli",
    panel: (
      <>
        <ShowText
          no="03" label="LASTİK OTELİ"
          title={<>Sezonluk lastikler<br />kaybolmaz.</>}
          text="Çıkan lastiği tek dokunuşla depoya al, etiketini yazdır. Kimin lastiği ne zamandır bekliyor, plakadan bul."
          checks={["Depo no ve etiket", "DOT, diş derinliği, jantlı/jantsız", "Uzun süre bekleyen uyarısı"]}
        />
        <div className="mock" aria-hidden="true">
          <div className="mock-head"><b>Lastik oteli</b><span className="mono">128 SET</span></div>
          <div className="line"><Plate>34 KLM 482</Plate><span className="line-text"><b>Murat P.</b><span>Kışlık · 205/55 R16 · DOT 40/24</span></span><b>No 12</b></div>
          <div className="line hot"><Plate>35 IZM 303</Plate><span className="line-text"><b>Hasan Ç.</b><span>Kışlık · 7 aydır depoda</span></span><b>No 31</b></div>
          <div className="line"><Plate>06 ANK 77</Plate><span className="line-text"><b>Elif D.</b><span>Yazlık · Jantlı · 225/45 R17</span></span><b>No 3</b></div>
          <div className="line"><Plate>34 ELV 216</Plate><span className="line-text"><b>Can Aydın</b><span>4 mevsim · 215/60 R16</span></span><b>No 7</b></div>
        </div>
      </>
    ),
  },
  {
    id: "cari",
    label: "Cari & WhatsApp",
    panel: (
      <>
        <ShowText
          no="04" label="CARİ & WHATSAPP"
          title={<>Kim ne kadar borçlu,<br />her an belli.</>}
          text="Veresiye, tahsilat ve filo hesabı tek yerde. Aylık ekstreyi WhatsApp'tan gönder, yazdır ya da Excel'e aktar."
          checks={["Aylık cari ekstre", "Filo ve kurumsal müşteri", "WhatsApp'tan ekstre ve teklif"]}
        />
        <div className="mock" aria-hidden="true">
          <div className="mock-head"><b>Can Aydın · Kasım</b><span className="mono">EKSTRE</span></div>
          <Line title="Devreden bakiye" amount="₺4.200" />
          <Line title="Lastik satışı" sub="34 ELV 216 · 12 Kas" amount="+₺6.000" tone="orange" />
          <Line title="Tahsilat" sub="Havale · 20 Kas" amount="−₺3.000" tone="green" />
          <div className="mock-total">
            <div><span className="mono">KALAN</span><b>₺7.200</b></div>
            <span className="wa-pill"><WhatsappIcon />WhatsApp&apos;tan gönder</span>
          </div>
        </div>
      </>
    ),
  },
  {
    id: "kasa",
    label: "Kasa & raporlar",
    panel: (
      <>
        <ShowText
          no="05" label="KASA & RAPORLAR"
          title={<>Ay sonu kârın<br />tek bakışta.</>}
          text="Günlük kasa, masraf ve tahsilat kendiliğinden toplanır. Ciro, maliyet ve kârı gün gün, ay ay görürsün."
          checks={["Günlük kasa", "Masraf ve sabit giderler", "Yıllık gelir-gider özeti"]}
        />
        <div className="mock" aria-hidden="true">
          <div className="mock-head"><b>Kasım özeti</b><span className="mono">RAPOR</span></div>
          <Line title="Ciro" amount="₺486.200" />
          <Line title="Maliyet" amount="−₺312.400" />
          <Line title="Masraf" sub="Kira, elektrik, personel" amount="−₺74.300" />
          <div className="mock-total">
            <div><span className="mono">KÂR</span><b className="green">₺99.500</b></div>
          </div>
        </div>
      </>
    ),
  },
];

interface CellProps {
  label: string;
  title: React.ReactNode;
  text?: string;
  textW?: string; // yalnızca masaüstü
  textM?: string; // yalnızca mobil
  id?: string;
  className?: string;
  children?: React.ReactNode;
}

function Cell({ label, title, text, textW, textM, id, className = "", children }: CellProps) {
  return (
    <div id={id} className={`cell card-surface ${className}`}>
      <p className="mono faint">{label}</p>
      <h3>{title}</h3>
      {text && <p className="cell-text">{text}</p>}
      {textW && <p className="cell-text only-wide">{textW}</p>}
      {textM && <p className="cell-text only-narrow">{textM}</p>}
      {children}
    </div>
  );
}

const BARS = [30, 44, 36, 52, 48, 62, 56, 72, 66, 86, 104, 40];
const SLOTS: [string, "" | "full" | "on"][] = [["09:00", "full"], ["10:30", ""], ["11:00", "on"], ["13:30", ""], ["14:00", "full"], ["15:30", ""]];

export default async function ElevirePage() {
  const { monthlyPrice, yearlyPrice } = await getPlatformPricing();
  const monthly = formatTry(monthlyPrice);
  const yearly = formatTry(yearlyPrice);
  const discountPct = monthlyPrice > 0 ? Math.round((1 - yearlyPrice / (monthlyPrice * 12)) * 100) : 0;

  return (
    <div className={`ev ${geist.variable} ${geistMono.variable}`} id="top">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <MetaPixel />
      {/* Yapılandırılmış veri: Organization, WebSite, SoftwareApplication. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(monthlyPrice, yearlyPrice) }} />

      <div className="bg-grid" aria-hidden="true" />
      <div className="bg-glow" aria-hidden="true" />

      <SiteNav />

      <main>
        {/* ---------- Hero ---------- */}
        <section className="hero wrap">
          <a className="announce" href="#lastik-oteli">
            <span className="announce-tag mono">YENİ</span>
            <Dual wide="Lastik oteli artık raf ve DOT takibiyle" narrow="Lastik oteli artık DOT takibiyle" />
            <Arrow />
          </a>
          <h1>Defteri kapat.<br />İşini <em>tek ekrandan</em> yönet.</h1>
          <p className="hero-lead">
            <Dual
              wide="İş emri, lastik stoğu, lastik oteli, cari ve kasa tek bir yerde. Kurulum yok; bilgisayardan, tabletten ve telefondan çalışır."
              narrow="İş emri, lastik stoğu, lastik oteli, cari ve kasa tek yerde. Kurulum yok."
            />
          </p>
          <div className="actions">
            <TryButton cta="hero" />
            <DemoVideo />
          </div>
          <ul className="checks">
            <Check>Kurulum yok</Check>
            <Check><Dual wide="Kredi kartı gerekmez" narrow="Kart gerekmez" /></Check>
            <Check>İstediğin an iptal</Check>
          </ul>
          <HeroVisual />
        </section>

        {/* ---------- Hizmetler ---------- */}
        <section className="services" aria-label="Lastikçinin günlük işleri">
          <p className="mono faint"><Dual wide="LASTİKÇİNİN GÜNLÜK İŞİ İÇİN TASARLANDI" narrow="LASTİKÇİNİN GÜNLÜK İŞİ İÇİN" /></p>
          <ul className="chips">{SERVICES_MOBILE.map((x) => <li key={x}>{x}</li>)}</ul>
          <div className="marquee">
            <div className="marquee-track">
              {[0, 1].map((k) => (
                <ul key={k} aria-hidden={k === 1}>
                  {SERVICES.map((s) => <li key={s}>{s}</li>)}
                </ul>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- Özellikler ---------- */}
        <section id="ozellikler" className="features wrap" aria-labelledby="ozellikler-baslik">
          <div className="head">
            <div>
              <SectionTag>ÖZELLİKLER</SectionTag>
              <h2 id="ozellikler-baslik">Lastikçinin bütün günü.<br className="only-wide" /> <Dual wide="Tek bir ekranda." narrow="Tek ekranda." /></h2>
            </div>
            <p className="head-lead only-wide">
              İş emrinden lastik oteline, cariden kasaya kadar her şey birbirine bağlı. Bir yere girdiğin bilgi, her yerde
              güncellenir.
            </p>
          </div>
          <FeatureTabs tabs={TABS} />

          <div className="bento">
            <Cell label="İŞ EMRİ" title="Plakayı yaz. Gerisi kendiliğinden." text="Araç geçmişi gelir, ödemeyi bölerek al, kâr anında görünür." className="only-narrow">
              <div className="plate-total" aria-hidden="true"><Plate size="lg">34 ELV 216</Plate><b>₺22.240</b></div>
            </Cell>
            <Cell label="LASTİK STOĞU" title="Sattığın an stoktan düşer." textW="Marka, ebat, DOT ve parti bazında takip. Biten ürün için uyarı." className="c-stock">
              <div className="rows" aria-hidden="true">
                <div className="row only-wide"><span className="mono">KUMHO205</span><span>Kumho · 205/60R15 · Kış</span><b>45</b></div>
                <div className="row hot"><span className="mono">GOODY215</span><span>Goodyear · 215/60R16 · 4 mevsim</span><i className="mono">−4</i><b>10</b></div>
                <div className="row"><span className="mono">PIRELLI235</span><span>Pirelli · 235/40R18 · Yaz</span><b>13</b></div>
              </div>
            </Cell>
            <Cell id="lastik-oteli" label="LASTİK OTELİ" title="Sezonluk lastikler kaybolmaz." className="c-hotel">
              <p className="big" aria-hidden="true"><b>128</b> <Dual wide="set depoda" narrow="set depoda · 2 set 6+ ay" /></p>
              <div className="pills only-wide" aria-hidden="true">
                {["Raf B-12", "DOT 40/24", "Kışlık", "Jantlı", "6+ ay uyarısı"].map((p) => <span key={p}>{p}</span>)}
              </div>
            </Cell>
            <Cell label="CARİ & WHATSAPP" title={<Dual wide="Ekstre tek dokunuşla." narrow="Ekstre tek dokunuşla WhatsApp'ta." />} textM="Filolara ve kurumsal müşterilere aylık ekstre." className="c-cari">
              <div className="chat only-wide" aria-hidden="true">
                <div className="bubble out"><b><span className="pdf mono">PDF</span>Kasım ekstresi · ₺7.200</b><span className="mono">✓✓ 14:32</span></div>
                <div className="bubble in">Teşekkürler, yarın uğrarım 👍</div>
              </div>
            </Cell>
            <Cell label="KASA & RAPORLAR" title="Ay sonu kârın tek bakışta." textM="Günlük kasa, masraf, aylık ciro ve kâr." className="c-third">
              <div className="bars only-wide" aria-hidden="true">
                {BARS.map((h, i) => <span key={i} className={h === 104 ? "on" : ""} style={{ height: h }} />)}
              </div>
            </Cell>
            <Cell label="ONLINE RANDEVU" title="Müşteri saati kendisi seçer." className="c-third only-wide">
              <div className="slots" aria-hidden="true">
                {SLOTS.map(([t, s]) => <span key={t} className={`mono ${s}`}>{t}</span>)}
              </div>
            </Cell>
            <Cell label="VE DAHA FAZLASI" title="Büyüdükçe seninle büyür." className="c-third only-wide">
              <ul className="more">
                <li>Çoklu kullanıcı ve yetki</li>
                <li>Excel&apos;den içe aktarma</li>
                <li>Teklif → iş emri</li>
                <li>e-Fatura <span className="soon mono">YAKINDA</span></li>
              </ul>
            </Cell>
          </div>
        </section>

        {/* ---------- Neden Elevire ---------- */}
        <section className="why wrap" aria-labelledby="neden-baslik">
          <SectionTag>NEDEN ELEVIRE</SectionTag>
          <h2 id="neden-baslik"><Dual wide={<>Defter, Excel ve telefon notu<br />yerine tek bir ekran.</>} narrow="Defter yerine tek ekran." /></h2>
          <div className="compare">
            <p className="mono faint cmp-head">ESKİDEN</p>
            <p className="mono yellow cmp-head now">ELEVIRE İLE</p>
            {COMPARE.map((c) => (
              <div key={c.now} className={`cmp-row${c.oldM ? "" : " only-wide"}`}>
                <p className="old"><span className="cmp-mark" aria-hidden="true">×</span><s><Dual wide={c.old} narrow={c.oldM} /></s></p>
                <p className="now"><span className="cmp-mark" aria-hidden="true">✓</span><span><Dual wide={c.now} narrow={c.nowM} /></span></p>
              </div>
            ))}
          </div>
        </section>

        {/* ---------- 3 adım ---------- */}
        <section className="steps wrap" aria-labelledby="adim-baslik">
          <div className="head">
            <div>
              <SectionTag>3 ADIMDA BAŞLA</SectionTag>
              <h2 id="adim-baslik">Bugün kaydol.<br className="only-wide" /> Yarın defteri bırak.</h2>
            </div>
            <p className="head-lead only-wide">Kurulum yok, kart yok, eğitim gerektirmez. Üç adımda hazırsın.</p>
          </div>
          <ol className="step-row">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <span className="mono yellow" aria-hidden="true">0{i + 1}</span>
                <div>
                  <h3>{s.title}</h3>
                  <p><Dual wide={s.text} narrow={s.textM} /></p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* ---------- Fiyat ---------- */}
        <section id="fiyatlar" className="pricing wrap" aria-labelledby="fiyat-baslik">
          <SectionTag>FİYAT</SectionTag>
          <h2 id="fiyat-baslik">Tek paket. Net fiyat.</h2>
          <p className="head-lead"><Dual wide="Tüm modüller her planda açık. 7 gün ücretsiz dene, beğenmezsen hiçbir şey ödeme." narrow="Tüm modüller açık. 7 gün ücretsiz." /></p>
          <PricingCard
            monthly={monthly}
            yearly={yearly}
            yearlyPerMonth={formatTry(yearlyPrice / 12)}
            discountPct={discountPct}
            cta={<TryButton cta="fiyat" className="btn-block" />}
            payment={<p className="pay-note"><span aria-hidden="true">🔒</span> iyzico ile güvenli ödeme<span className="only-wide"> · Visa · Mastercard · Troy</span></p>}
            features={
              <>
                <p className="mono faint only-wide">HER ŞEY DAHİL</p>
                <ul className="only-wide">{INCLUDED.map((t) => <Check key={t}>{t}</Check>)}</ul>
                <ul className="only-narrow">{INCLUDED_MOBILE.map((t) => <Check key={t}>{t}</Check>)}</ul>
              </>
            }
          />
        </section>

        {/* ---------- SSS ---------- */}
        <section id="sss" className="faq wrap" aria-labelledby="sss-baslik">
          <div className="faq-side">
            <SectionTag>SSS</SectionTag>
            <h2 id="sss-baslik">Aklındaki <br className="only-wide" />sorular.</h2>
            <p className="lead only-wide">Cevabı bulamazsan WhatsApp&apos;tan yaz; mesai saatlerinde dakikalar içinde dönüyoruz.</p>
            <a className="btn btn-ghost btn-sm only-wide" href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" data-contact="whatsapp">
              WhatsApp&apos;tan sor
              <Arrow />
            </a>
          </div>
          <div className="faq-list">
            {faqItems(monthly, yearly).map((f, i) => (
              <details key={f.q} open={i === 0} className={f.wideOnly ? "only-wide" : undefined}>
                <summary>{f.q}<span className="faq-sign" aria-hidden="true" /></summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ---------- Kapanış ---------- */}
        <section className="final">
          <h2>Defteri bugün kapat.</h2>
          <p className="head-lead">7 gün ücretsiz. Kurulum yok, <Dual wide="kredi kartı" narrow="kart" /> gerekmez.</p>
          <div className="actions">
            <TryButton cta="kapanis" label="Ücretsiz hesabını aç" />
            <a className="btn btn-ghost only-wide" href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" data-contact="whatsapp">WhatsApp&apos;tan yaz</a>
          </div>
        </section>
      </main>

      <SiteFooter />

      {/* Mobilde ekrana sabit kayıt çubuğu. */}
      <div className="sticky-cta">
        <span><b>7 gün ücretsiz</b><span>Kurulum yok · kart gerekmez</span></span>
        <a className="btn btn-primary btn-sm" href="/kayit" data-cta="sabit-cubuk">Hemen dene<Arrow /></a>
      </div>
    </div>
  );
}
