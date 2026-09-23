import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Image from "next/image";
import {
  PackageCheck,
  LayoutGrid,
  CalendarDays,
  ShieldCheck,
  CircleX,
  BadgeCheck,
  ReceiptText,
  Coins,
  TrendingDown,
} from "lucide-react";
import { formatTry } from "@/lib/exchangeRate";
import { getPlatformPricing } from "@/lib/platformPricing";
import WaveHand from "./WaveHand";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "900"],
  variable: "--font-inter",
});

// Bu sayfa Figma'daki gerçek "elevire" tasarımının (dosya 863Xtv4xA3PrwD5cSKaE7i,
// çerçeve 2:5711) birebir uygulanmasıdır — yapı, metin, renkler ve
// görseller Figma'dan alındı (bkz. plan). Fiyat artık platform_pricing'teki
// SABİT TL değeri (bkz. src/lib/platformPricing.ts) — Figma'daki 1.500/ay
// ve yıllık 12.000 TL (aylık karşılığı 1.000 TL) rakamlarıyla tutarlı,
// süper admin panelden değiştirilebilir.

const TITLE = "Elevire — Lastik Servisi Yönetim Yazılımı";
const DESCRIPTION =
  "Sipariş, stok, depo ve raporlama — hepsi tek ekranda. Elevire ile lastik servisinizi yönetmenin en kolay yolu. Kurulum yok, kredi kartı gerekmez.";

export const metadata: Metadata = {
  metadataBase: process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? new URL(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`)
    : undefined,
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/elevire" },
  openGraph: {
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

const AYLIK_FEATURES = [
  { Icon: PackageCheck, text: "Stok, müşteri ve iş takibi" },
  { Icon: LayoutGrid, text: "Tüm temel modüllere erişim" },
  { Icon: WhatsappIcon, text: "WhatsApp destek" },
  { Icon: CalendarDays, text: "7 gün ücretsiz deneme" },
  { Icon: ShieldCheck, text: "Taahhüt yok" },
  { Icon: CircleX, text: "İstediğin zaman iptal" },
];

const YILLIK_FEATURES = [
  { Icon: BadgeCheck, text: "Aylık plandaki tüm özellikler" },
  { Icon: ReceiptText, text: "Yıllık 12.000 TL faturalandırma" },
  { Icon: Coins, text: "Aylık karşılığı 1.000 TL" },
  { Icon: TrendingDown, text: "Toplam 6.000 TL avantaj" },
  { Icon: WhatsappIcon, text: "WhatsApp destek" },
  { Icon: ShieldCheck, text: "Taahhüt yok" },
];

function WhatsappIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M19.2 11.28C19.1985 12.4971 18.8885 13.694 18.299 14.7588C17.7094 15.8236 16.8595 16.7215 15.8288 17.3687C14.798 18.016 13.62 18.3913 12.4048 18.4597C11.1896 18.5282 9.97695 18.2874 8.88005 17.76L4.80005 19.2L6.12005 15.36C5.4649 14.4327 5.03834 13.3637 4.87517 12.2401C4.71201 11.1165 4.81687 9.97027 5.1812 8.89495C5.54553 7.81963 6.159 6.84571 6.97152 6.0527C7.78404 5.25969 8.77259 4.67008 9.85645 4.33199C10.9403 3.99391 12.0888 3.91694 13.208 4.10737C14.3273 4.29779 15.3857 4.75022 16.2968 5.42771C17.2079 6.10519 17.9458 6.98854 18.4504 8.00563C18.9549 9.02271 19.2118 10.1447 19.2 11.28Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Logomark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 43 42" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M43 22.3148L13.6323 24.6816C13.7575 26.2343 13.9328 27.7746 14.1581 29.3023C14.3834 30.8301 14.6713 32.3703 15.0218 33.9231C17.225 34.0733 19.3531 34.1485 21.4061 34.1485C22.5328 34.1485 23.6218 34.136 24.6734 34.1109C25.7249 34.0608 26.814 33.9982 27.9406 33.9231C27.9907 33.4222 28.0282 32.9213 28.0533 32.4204C28.0783 31.9195 28.0908 31.4186 28.0908 30.9177C28.0908 30.4669 28.0783 30.0286 28.0533 29.6029C28.0533 29.1521 28.0157 28.7013 27.9406 28.2504L42.0987 28.551C41.3977 30.9302 40.3837 32.9714 39.0568 34.6744C37.7549 36.3775 36.2026 37.78 34.4 38.8819C32.6224 39.9589 30.632 40.7478 28.4288 41.2487C26.2256 41.7496 23.9098 42 21.4812 42C18.5019 42 15.6978 41.5993 13.069 40.7979C10.4652 39.9964 8.1869 38.7066 6.23406 36.9284C4.30626 35.1252 2.77904 32.7835 1.6524 29.9034C0.550801 27.0233 0 23.492 0 19.3095C0 15.9284 0.588355 13.0233 1.76507 10.5939C2.94178 8.16458 4.50655 6.161 6.45939 4.58318C8.43726 3.00537 10.7156 1.85331 13.2943 1.12701C15.8981 0.375671 18.6271 0 21.4812 0C24.4606 0 27.2521 0.400716 29.8559 1.20215C32.4847 2.00358 34.763 3.25581 36.6908 4.95886C38.6437 6.6619 40.1834 8.84079 41.31 11.4955C42.4367 14.1503 43 17.3184 43 21V22.3148ZM13.2568 16.7925H28.3162C28.3162 13.6869 28.0032 10.7317 27.3773 7.92665C25.2242 7.47585 22.9709 7.25045 20.6175 7.25045C18.3141 7.25045 15.9857 7.47585 13.6323 7.92665C13.4821 9.32916 13.382 10.7567 13.3319 12.2093C13.2818 13.6369 13.2568 15.1646 13.2568 16.7925Z"
        fill="#ffcf3d"
      />
    </svg>
  );
}

export default async function ElevirePage() {
  const { monthlyPrice, yearlyPrice } = await getPlatformPricing();
  const yearlyMonthlyEquivalent = yearlyPrice / 12;
  const savings = monthlyPrice * 12 - yearlyPrice;

  return (
    <div className={`elevire ${inter.variable}`}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ---------- Hero ---------- */}
      <div id="top" className="hero">
        <Image src="/elevire/hero.jpg" alt="" fill priority className="hero-img" sizes="100vw" />
        <div className="hero-scrim" />
        <nav className="nav wrap">
          <a className="logo" href="#top" aria-label="Elevire">
            <Logomark className="logo-mark" />
          </a>
          <a className="nav-cta" href="/kayit">7 Gün Ücretsiz Dene</a>
        </nav>
      </div>

      {/* ---------- Bento ---------- */}
      <div className="bento">
        <div className="wrap">
          <div className="bento-row bento-row-1">
            <a className="bento-card" href="/kayit">
              <div className="bento-media">
                <Image src="/elevire/bento-1.jpg" alt="" fill sizes="(max-width: 800px) 100vw, 50vw" className="bento-img" />
              </div>
              <h2>Stok, müşteri ve iş takibi.{" "}Tek ekranda.</h2>
              <p>
                Defter, dağınık Excel ve &ldquo;kimde ne vardı?&rdquo; karmaşasını geride bırakın. Elevire; lastikçiler
                ve oto servisler için stok, müşteri ve iş geçmişini tek yerde toplar.
              </p>
            </a>
            <a className="bento-card" href="/kayit">
              <div className="bento-media">
                <Image src="/elevire/bento-main.jpg" alt="" fill sizes="(max-width: 800px) 100vw, 50vw" className="bento-img" />
              </div>
              <h2>Elevire&apos;ın içinden.</h2>
              <p>Tek bir panelde stok, müşteri ve iş takibinin tamamı.</p>
            </a>
          </div>
          <div className="bento-row bento-row-2">
            <a className="bento-card" href="/kayit">
              <div className="bento-media bento-media-sm">
                <Image src="/elevire/bento-stok.jpg" alt="" fill sizes="(max-width: 800px) 100vw, 33vw" className="bento-img" />
              </div>
              <h3>Stok Ekle</h3>
              <p>Lastik markası, ebadı ve adedini birkaç saniyede sisteme kaydedin.</p>
            </a>
            <a className="bento-card" href="/kayit">
              <div className="bento-media bento-media-sm">
                <Image src="/elevire/bento-musteri.jpg" alt="" fill sizes="(max-width: 800px) 100vw, 33vw" className="bento-img" />
              </div>
              <h3>Müşteriyi Kaydet</h3>
              <p>Müşteri bilgilerini ve araç plakasını tek seferde kaydedin, bir daha aramayın.</p>
            </a>
            <a className="bento-card" href="/kayit">
              <div className="bento-media bento-media-sm">
                <Image src="/elevire/bento-gecmis.jpg" alt="" fill sizes="(max-width: 800px) 100vw, 33vw" className="bento-img" />
              </div>
              <h3>İş Geçmişini Takip Et</h3>
              <p>Yapılan her işlem otomatik olarak müşterinin geçmişine eklenir.</p>
            </a>
          </div>
        </div>
      </div>

      {/* ---------- Pricing ---------- */}
      <div className="pricing">
        <div className="pricing-photo">
          <Image src="/elevire/pricing-bg.jpg" alt="" fill sizes="100vw" className="pricing-photo-img" />
          <div className="pricing-photo-scrim" />
          <div className="wrap pricing-photo-inner">
            <span className="pricing-eyebrow">LASTİKÇİLER VE OTO SERVİSLER İÇİN</span>
            <p className="pricing-statement">
              Stok takibi, müşteri yönetimi, iş geçmişi ve temel modüller tek sistemde. Karmaşık paketler yok, net
              fiyat var.
            </p>
          </div>
        </div>

        <div className="pricing-panel">
          <div className="wrap">
            <h2 className="pricing-heading">Tek paket. Net fiyat.</h2>
            <div className="pricing-grid">
              <div className="price-card">
                <div className="price-media">
                  <Image src="/elevire/price-aylik.jpg" alt="" fill sizes="(max-width: 800px) 100vw, 50vw" className="price-media-img" />
                </div>
                <div className="price-card-head">
                  <h3>Aylık</h3>
                  <p className="price-amount">₺{formatTry(monthlyPrice)} TL/ay</p>
                </div>
                <p className="price-note">Her ay, dilediğiniz zaman iptal edebileceğiniz şekilde faturalanır.</p>
                <ul className="price-features">
                  {AYLIK_FEATURES.map(({ Icon, text }) => (
                    <li key={text}>
                      <Icon className="price-feature-icon" strokeWidth={1.5} aria-hidden="true" />
                      {text}
                    </li>
                  ))}
                </ul>
                <a className="price-cta price-cta-orange" href="/kayit">7 Gün Ücretsiz Dene</a>
              </div>

              <div className="price-card">
                <div className="price-media">
                  <Image src="/elevire/price-yillik.jpg" alt="" fill sizes="(max-width: 800px) 100vw, 50vw" className="price-media-img" />
                </div>
                <div className="price-card-head">
                  <h3>Yıllık</h3>
                  <p className="price-amount price-amount-accent">₺{formatTry(yearlyMonthlyEquivalent)} TL/ay</p>
                </div>
                <p className="price-note">
                  yıllık {formatTry(yearlyPrice)} TL faturalanır
                  <br />
                  {formatTry(savings)} TL avantaj
                </p>
                <ul className="price-features">
                  {YILLIK_FEATURES.map(({ Icon, text }) => (
                    <li key={text}>
                      <Icon className="price-feature-icon" strokeWidth={1.5} aria-hidden="true" />
                      {text}
                    </li>
                  ))}
                </ul>
                <a className="price-cta price-cta-dark" href="/kayit">7 Gün Ücretsiz Dene</a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ---------- Closing + Footer ---------- */}
      <div id="demo" className="closing">
        <div className="wrap closing-inner">
          <WaveHand />
          <h2>İşini tek ekrandan yönetmeye hazır mısın?</h2>
          <a className="closing-cta" href="/kayit">7 Gün Ücretsiz Dene</a>
        </div>

        <footer className="wrap footer">
          <nav className="legal-nav">
            <a href="/elevire/legal/hakkimizda">Hakkımızda</a>
            <a href="/elevire/legal/gizlilik">Gizlilik Sözleşmesi</a>
            <a href="/elevire/legal/mesafeli-satis-sozlesmesi">Mesafeli Satış Sözleşmesi</a>
            <a href="/elevire/legal/iptal-ve-iade">İptal ve İade Koşulları</a>
          </nav>
          <div className="footer-bottom">
            <span className="footer-copyright">© 2026 Elevire. Tüm hakları saklıdır.</span>
            <div className="payment-badges">
              <img src="/payment-logos/logo-band-white.svg" alt="iyzico ile Öde, Mastercard, Visa, American Express, Troy" height={20} />
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

const CSS = `
  .elevire {
    --ink: #0a0d12;
    --heading: #080a0c;
    --body: #717470;
    --surface: #ffffff;
    --line: #e5e4de;
    --yellow: #ffcf3d;
    --orange: #f8672d;
    --muted-2: #535862;
    --footer-muted: #91948f;
    --dark: #1c1d1a;
    --darker: #0b0b0c;
    --paper: #f3f2ea;

    --font-body: var(--font-inter), "Segoe UI", sans-serif;
  }

  .elevire, .elevire * { box-sizing: border-box; }

  .elevire {
    margin: 0;
    background: var(--surface);
    color: var(--ink);
    font-family: var(--font-body);
    font-size: 16px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
    overflow-x: hidden;
  }

  .elevire a { color: inherit; text-decoration: none; }

  .elevire .wrap {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 24px;
  }

  .elevire h1, .elevire h2, .elevire h3 { margin: 0; text-wrap: balance; }
  .elevire p { margin: 0; }

  /* ---------- hero ---------- */
  .elevire .hero {
    position: relative;
    height: min(88vh, 780px);
    min-height: 460px;
    overflow: hidden;
  }
  .elevire .hero-img { object-fit: cover; z-index: 0; }
  .elevire .hero-scrim {
    position: absolute;
    inset: 0;
    z-index: 1;
    background: linear-gradient(180deg, rgba(0,0,0,0.32) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 100%);
  }
  .elevire .nav {
    position: absolute;
    top: 28px;
    left: 0;
    right: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .elevire .logo {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: #000000;
    flex: none;
  }
  .elevire .logo-mark { width: 30px; height: 29px; }
  .elevire .nav-cta {
    display: inline-flex;
    align-items: center;
    font-weight: 700;
    font-size: 0.9rem;
    background: var(--yellow);
    color: #000000;
    padding: 12px 22px;
    border-radius: 999px;
    white-space: nowrap;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }
  .elevire .nav-cta:hover { transform: translateY(-1px); box-shadow: 0 8px 18px -8px rgba(0,0,0,0.45); }

  /* ---------- bento ---------- */
  .elevire .bento { padding: 72px 0 88px; }
  .elevire .bento-row {
    display: grid;
    gap: 40px;
    margin-bottom: 40px;
  }
  .elevire .bento-row-1 { grid-template-columns: 1fr 1fr; }
  .elevire .bento-row-2 { grid-template-columns: repeat(3, 1fr); gap: 18px; margin-bottom: 0; }

  .elevire .bento-card {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .elevire .bento-media {
    position: relative;
    width: 100%;
    aspect-ratio: 735 / 900;
    border-radius: 20px;
    overflow: hidden;
    background: var(--paper);
  }
  .elevire .bento-media-sm { aspect-ratio: 600 / 750; }
  .elevire .bento-img { object-fit: cover; transition: transform 0.4s ease; }
  .elevire .bento-card:hover .bento-img { transform: scale(1.03); }

  .elevire .bento-card h2 {
    font-size: 1.4rem;
    font-weight: 500;
    color: var(--heading);
    line-height: 1.25;
  }
  .elevire .bento-card h3 {
    font-size: 1.4rem;
    font-weight: 400;
    color: var(--heading);
    line-height: 1.25;
  }
  .elevire .bento-card p {
    color: var(--body);
    font-size: 1rem;
    line-height: 1.5;
    max-width: 46ch;
  }

  @media (max-width: 860px) {
    .elevire .bento-row-1, .elevire .bento-row-2 { grid-template-columns: 1fr; }
  }

  /* ---------- pricing ---------- */
  .elevire .pricing { background: var(--dark); }
  .elevire .pricing-photo {
    position: relative;
    height: clamp(360px, 42vw, 480px);
    overflow: hidden;
  }
  .elevire .pricing-photo-img { object-fit: cover; }
  .elevire .pricing-photo-scrim {
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgba(10,13,18,0.55) 0%, rgba(10,13,18,0.75) 100%);
  }
  .elevire .pricing-photo-inner {
    position: relative;
    z-index: 1;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 20px;
    max-width: 720px;
  }
  .elevire .pricing-eyebrow {
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: #fafafa;
  }
  .elevire .pricing-statement {
    font-size: clamp(1.6rem, 3.2vw, 2.5rem);
    font-weight: 900;
    line-height: 1.1;
    color: #fafafa;
  }

  .elevire .pricing-panel {
    position: relative;
    background: var(--paper);
    border-radius: 48px 48px 0 0;
    margin-top: -48px;
    padding: 56px 0 88px;
  }
  .elevire .pricing-heading {
    text-align: center;
    font-size: clamp(1.8rem, 3.4vw, 2.4rem);
    font-weight: 400;
    color: #000000;
    margin-bottom: 40px;
  }
  .elevire .pricing-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 24px;
    max-width: 760px;
    margin: 0 auto;
  }
  .elevire .price-card {
    background: var(--surface);
    border-radius: 24px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 40px -28px rgba(10,13,18,0.35);
  }
  .elevire .price-media {
    position: relative;
    width: 100%;
    aspect-ratio: 522 / 300;
    background: var(--yellow);
  }
  .elevire .price-media-img { object-fit: cover; }
  .elevire .price-card-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    padding: 24px 28px 0;
  }
  .elevire .price-card-head h3 {
    font-size: 1.3rem;
    font-weight: 400;
    color: var(--ink);
  }
  .elevire .price-amount {
    font-size: 1.1rem;
    color: var(--ink);
    white-space: nowrap;
  }
  .elevire .price-amount-accent { color: var(--orange); }
  .elevire .price-note {
    font-size: 0.85rem;
    color: var(--muted-2);
    line-height: 1.5;
    margin: 14px 28px 20px;
  }
  .elevire .price-features {
    list-style: none;
    margin: 0 0 24px;
    padding: 0 28px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .elevire .price-features li {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 0.88rem;
    color: var(--ink);
  }
  .elevire .price-feature-icon { width: 18px; height: 18px; flex: none; color: var(--ink); }
  .elevire .price-cta {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 47px;
    margin: auto 28px 28px;
    border-radius: 12px;
    font-weight: 600;
    font-size: 0.95rem;
    color: #ffffff;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }
  .elevire .price-cta:hover { transform: translateY(-1px); box-shadow: 0 10px 22px -12px rgba(0,0,0,0.5); }
  .elevire .price-cta-orange { background: var(--orange); }
  .elevire .price-cta-dark { background: var(--ink); }

  /* ---------- closing + footer ---------- */
  .elevire .closing { background: var(--darker); padding-top: 96px; }
  .elevire .closing-inner {
    text-align: center;
    max-width: 720px;
    margin: 0 auto;
    padding-bottom: 88px;
  }
  .elevire .closing-inner h2 {
    font-size: clamp(2rem, 4.2vw, 3.2rem);
    font-weight: 400;
    color: #ffffff;
    line-height: 1.15;
  }
  .elevire .wave-hand {
    width: 96px;
    margin: 0 auto 20px;
  }
  .elevire .wave-hand-inner {
    transform: rotate(var(--mouse-tilt, 0deg));
    transform-origin: 72% 88%;
    transition: transform 0.25s ease-out;
  }
  .elevire .wave-hand-inner img { display: block; width: 100%; height: auto; }
  .elevire .wave-hand-inner.is-waving { animation: elevire-wave 1.6s ease-in-out; }
  @keyframes elevire-wave {
    0%, 100% { transform: rotate(0deg); }
    15% { transform: rotate(16deg); }
    30% { transform: rotate(-10deg); }
    45% { transform: rotate(16deg); }
    60% { transform: rotate(-6deg); }
    75% { transform: rotate(9deg); }
  }
  @media (prefers-reduced-motion: reduce) {
    .elevire .wave-hand-inner.is-waving { animation: none; }
  }
  .elevire .closing-cta {
    display: inline-flex;
    align-items: center;
    margin-top: 36px;
    padding: 18px 40px;
    border-radius: 999px;
    background: var(--yellow);
    color: #000000;
    font-weight: 500;
    font-size: 1.1rem;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }
  .elevire .closing-cta:hover { transform: translateY(-2px); box-shadow: 0 14px 28px -14px rgba(255,207,61,0.55); }

  .elevire .footer {
    border-top: 1px solid rgba(255,255,255,0.1);
    padding: 24px 0 32px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .elevire .legal-nav {
    display: flex;
    flex-wrap: wrap;
    gap: 18px;
  }
  .elevire .legal-nav a {
    font-size: 0.85rem;
    color: var(--footer-muted);
  }
  .elevire .legal-nav a:hover { color: #ffffff; }
  .elevire .footer-bottom {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
  }
  .elevire .footer-copyright { font-size: 0.85rem; color: #ffffff; }
  .elevire .payment-badges { display: flex; align-items: center; }

  @media (max-width: 640px) {
    .elevire .nav { top: 18px; }
    .elevire .pricing-panel { border-radius: 32px 32px 0 0; margin-top: -32px; }
  }
`;
