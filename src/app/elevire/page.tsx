import type { Metadata } from "next";
import { Oswald, Source_Sans_3, JetBrains_Mono } from "next/font/google";

const oswald = Oswald({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-oswald",
});
const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  weight: ["400", "600", "700", "900"],
  variable: "--font-source-sans",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: "Elevire — Lastik Servisi Yönetim Yazılımı",
  description:
    "Sipariş, stok, depo ve raporlama — hepsi tek ekranda. Elevire ile lastik servisinizi yönetmenin en kolay yolu.",
};

const FEATURES = [
  { code: "SİP", title: "Sipariş Yönetimi", text: "Plaka bazlı sipariş kaydı, uygulanan hizmetler ve ödeme takibi tek ekranda." },
  { code: "STK", title: "Stok & Fiyat Takibi", text: "Ürün stok seviyeleri, parti bazlı alış/satış fiyat geçmişi." },
  { code: "DEPO", title: "Mevsimlik Depolama Takibi", text: "Hangi lastik ne zaman depoya girdi, bekleyen kayıtlar için otomatik uyarı." },
  { code: "TED", title: "Tedarikçi Takibi", text: "Tedarikçi bazlı ürün ve maliyet kayıtları." },
  { code: "RPR", title: "Raporlama", text: "Satış, hizmet ve kâr analizleri; işletmenizin nabzını anlık görün." },
  { code: "XLS", title: "Excel İçe/Dışa Aktarma", text: "Mevcut verilerinizi hazır şablonlarla saniyeler içinde sisteme taşıyın." },
  { code: "KLN", title: "Çoklu Kullanıcı & Yetkilendirme", text: "Çalışanlarınız için ayrı hesaplar, rol bazlı erişim kontrolü." },
];

export default function ElevirePage() {
  return (
    <div className={`elevire ${oswald.variable} ${sourceSans.variable} ${jetbrainsMono.variable}`}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="topbar">
        <div className="wrap">
          <a className="wordmark" href="#top">
            <span className="bar"></span>Elevire
          </a>
          <a className="nav-cta" href="#demo">Demoyu Dene</a>
        </div>
      </div>

      <div id="top" className="hero">
        <div className="hero-tread"></div>
        <div className="hero-rings" aria-hidden="true">
          <svg viewBox="0 0 400 400" fill="none">
            <circle cx="200" cy="200" r="188" stroke="var(--line)" strokeWidth="1" />
            <circle cx="200" cy="200" r="150" stroke="var(--line)" strokeWidth="1" />
            <circle cx="200" cy="200" r="112" stroke="var(--line)" strokeWidth="1" />
            <circle cx="200" cy="200" r="74" stroke="var(--accent-2)" strokeWidth="1.5" opacity="0.55" />
            <circle cx="200" cy="200" r="36" stroke="var(--accent)" strokeWidth="2" opacity="0.8" />
          </svg>
        </div>
        <div className="wrap hero-inner">
          <div className="eyebrow">Lastik Servisi Yönetim Yazılımı</div>
          <h1 className="headline">
            Lastik Servisinizi<br />Yönetmenin <em>En Kolay</em><br />Yolu
          </h1>
          <p className="sub">
            Sipariş, stok, depo ve raporlama — hepsi tek ekranda. Excel dosyaları ve kağıt fişlerle uğraşmayı bırakın.
          </p>
          <div className="hero-actions">
            <a className="btn btn-primary" href="#demo">Demoyu Ücretsiz Dene</a>
            <span className="hero-note">KURULUM YOK · KREDİ KARTI GEREKMEZ</span>
          </div>
        </div>
      </div>

      <div className="problem">
        <div className="wrap">
          <div>
            <span className="problem-tag">NEDEN ELEVIRE</span>
            <h2>Servis defteri artık<br />dijital olmalı.</h2>
          </div>
          <p className="problem-text">
            Lastik servisinizde her gün onlarca sipariş, mevsimlik depolama kaydı ve stok hareketi oluyor. Bunları
            dağınık Excel dosyalarında veya defterde takip etmek zaman kaybettiriyor, hata riskini artırıyor. Elevire,
            bu işlerin hepsini tek bir yerde, basitçe yönetmenizi sağlar.
          </p>
        </div>
      </div>

      <div className="features">
        <div className="wrap">
          <div className="features-head">
            <h2>Tek Sistem,<br />Yedi İş.</h2>
            <p>Sabahtan akşama işletmenizi ayakta tutan her şey Elevire içinde.</p>
          </div>
          <div className="feature-grid">
            {FEATURES.map((f) => (
              <div className="feature-card" key={f.code}>
                <span className="plate"><span className="band"></span><span>{f.code}</span></span>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div id="demo" className="closing">
        <div className="hero-tread"></div>
        <div className="wrap closing-inner">
          <h2>Hemen Deneyin,<br />Farkı Görün.</h2>
          <p>Kurulum gerekmez, kredi kartı istenmez — demo hesabıyla dakikalar içinde sisteme göz atın.</p>
          <div className="hero-actions">
            <a className="btn btn-primary" href="#">Demoyu Ücretsiz Dene</a>
          </div>
          <p style={{ marginTop: "18px" }} className="hero-note">KURULUM YOK · KREDİ KARTI GEREKMEZ</p>
        </div>
      </div>

      <footer>
        <div className="wrap">
          <span>© 2026 Elevire</span>
          <span>bir Yeyu ürünü</span>
        </div>
      </footer>
    </div>
  );
}

const CSS = `
  .elevire {
    --ink: #1c1c1a;
    --ink-soft: #4a4a45;
    --ground: #f0efea;
    --ground-alt: #e7e5dd;
    --surface: #fbfaf7;
    --line: #d8d6cc;
    --accent: #b96a1c;
    --accent-ink: #ffffff;
    --accent-2: #2c4a75;
    --accent-2-soft: #dbe3ee;
    --shadow: 220 15% 15%;

    --font-display: var(--font-oswald), "Arial Narrow", sans-serif;
    --font-body: var(--font-source-sans), "Segoe UI", sans-serif;
    --font-mono: var(--font-jetbrains-mono), "Courier New", monospace;
  }

  @media (prefers-color-scheme: dark) {
    .elevire:not([data-theme="light"]) {
      --ink: #eeece4;
      --ink-soft: #b3b0a4;
      --ground: #17181a;
      --ground-alt: #1e2022;
      --surface: #202224;
      --line: #34363a;
      --accent: #e79438;
      --accent-ink: #1c1305;
      --accent-2: #7fa0d6;
      --accent-2-soft: #223247;
      --shadow: 0 0% 0%;
    }
  }
  .elevire[data-theme="dark"] {
    --ink: #eeece4;
    --ink-soft: #b3b0a4;
    --ground: #17181a;
    --ground-alt: #1e2022;
    --surface: #202224;
    --line: #34363a;
    --accent: #e79438;
    --accent-ink: #1c1305;
    --accent-2: #7fa0d6;
    --accent-2-soft: #223247;
    --shadow: 0 0% 0%;
  }

  .elevire, .elevire * { box-sizing: border-box; }

  .elevire {
    margin: 0;
    background: var(--ground);
    color: var(--ink);
    font-family: var(--font-body);
    font-size: 17px;
    line-height: 1.55;
    -webkit-font-smoothing: antialiased;
    overflow-x: hidden;
  }

  .elevire a { color: inherit; }

  .elevire .wrap {
    max-width: 1120px;
    margin: 0 auto;
    padding: 0 28px;
  }

  .elevire h1, .elevire h2, .elevire h3 {
    font-family: var(--font-display);
    font-weight: 600;
    letter-spacing: 0.01em;
    text-wrap: balance;
    margin: 0;
  }

  .elevire p { margin: 0; }

  /* ---------- top bar ---------- */
  .elevire .topbar {
    position: sticky;
    top: 0;
    z-index: 40;
    background: color-mix(in srgb, var(--ground) 88%, transparent);
    backdrop-filter: blur(6px);
    border-bottom: 1px solid var(--line);
  }
  .elevire .topbar .wrap {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 64px;
  }
  .elevire .wordmark {
    display: flex;
    align-items: center;
    gap: 10px;
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 1.3rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    text-decoration: none;
  }
  .elevire .wordmark .bar {
    width: 7px;
    height: 22px;
    background: var(--accent-2);
    border-radius: 1px;
    flex: none;
  }
  .elevire .nav-cta {
    font-family: var(--font-mono);
    font-size: 0.82rem;
    font-weight: 500;
    letter-spacing: 0.02em;
    text-decoration: none;
    padding: 9px 16px;
    border: 1px solid var(--ink);
    border-radius: 3px;
    white-space: nowrap;
    transition: background 0.15s ease, color 0.15s ease, transform 0.15s ease;
  }
  .elevire .nav-cta:hover { background: var(--ink); color: var(--ground); }

  /* ---------- hero ---------- */
  .elevire .hero {
    position: relative;
    padding: 88px 0 96px;
    overflow: hidden;
    border-bottom: 1px solid var(--line);
  }
  .elevire .hero-tread {
    position: absolute;
    inset: 0;
    z-index: 0;
    opacity: 0.5;
    background-image: repeating-linear-gradient(
      115deg,
      color-mix(in srgb, var(--ink) 5%, transparent) 0px,
      color-mix(in srgb, var(--ink) 5%, transparent) 2px,
      transparent 2px,
      transparent 34px
    );
    -webkit-mask-image: radial-gradient(ellipse 62% 90% at 82% 30%, black, transparent 72%);
    mask-image: radial-gradient(ellipse 62% 90% at 82% 30%, black, transparent 72%);
  }
  .elevire .hero-rings {
    position: absolute;
    right: -140px;
    top: 50%;
    transform: translateY(-50%);
    width: 620px;
    height: 620px;
    z-index: 0;
    pointer-events: none;
  }
  .elevire .hero-rings svg { width: 100%; height: 100%; display: block; }
  .elevire .hero-inner {
    position: relative;
    z-index: 1;
    max-width: 640px;
  }
  .elevire .eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-family: var(--font-mono);
    font-size: 0.78rem;
    letter-spacing: 0.06em;
    color: var(--ink-soft);
    margin-bottom: 22px;
    opacity: 0;
    animation: elevire-rise 0.7s 0.05s ease-out forwards;
  }
  .elevire .eyebrow::before {
    content: "";
    width: 9px;
    height: 9px;
    background: var(--accent);
    border-radius: 50%;
    flex: none;
  }
  .elevire h1.headline {
    font-size: clamp(2.6rem, 5.4vw, 4.1rem);
    line-height: 1.03;
    opacity: 0;
    animation: elevire-rise 0.7s 0.16s ease-out forwards;
  }
  .elevire h1.headline em {
    font-style: normal;
    color: var(--accent);
  }
  .elevire .sub {
    margin-top: 26px;
    max-width: 480px;
    font-size: 1.14rem;
    line-height: 1.6;
    color: var(--ink-soft);
    opacity: 0;
    animation: elevire-rise 0.7s 0.28s ease-out forwards;
  }
  .elevire .hero-actions {
    margin-top: 40px;
    display: flex;
    align-items: center;
    gap: 22px;
    flex-wrap: wrap;
    opacity: 0;
    animation: elevire-rise 0.7s 0.4s ease-out forwards;
  }

  @keyframes elevire-rise {
    from { opacity: 0; transform: translateY(14px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @media (prefers-reduced-motion: reduce) {
    .elevire .eyebrow, .elevire h1.headline, .elevire .sub, .elevire .hero-actions { animation: none; opacity: 1; }
  }

  .elevire .btn {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    font-family: var(--font-display);
    font-weight: 600;
    letter-spacing: 0.03em;
    font-size: 1rem;
    text-decoration: none;
    padding: 15px 26px;
    border-radius: 3px;
    border: 1px solid transparent;
    transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
  }
  .elevire .btn-primary {
    background: var(--accent);
    color: var(--accent-ink);
  }
  .elevire .btn-primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 24px -10px hsl(var(--shadow) / 0.5);
  }
  .elevire .btn-primary::after {
    content: "→";
    font-family: var(--font-body);
  }
  .elevire .hero-note {
    font-family: var(--font-mono);
    font-size: 0.82rem;
    color: var(--ink-soft);
  }

  /* ---------- problem ---------- */
  .elevire .problem {
    padding: 84px 0;
    border-bottom: 1px solid var(--line);
  }
  .elevire .problem .wrap {
    display: grid;
    grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
    gap: 56px;
    align-items: start;
  }
  .elevire .problem h2 {
    font-size: clamp(1.7rem, 3vw, 2.3rem);
    line-height: 1.12;
  }
  .elevire .problem-text {
    font-size: 1.08rem;
    color: var(--ink-soft);
    max-width: 62ch;
  }
  .elevire .problem-tag {
    display: inline-block;
    font-family: var(--font-mono);
    font-size: 0.76rem;
    letter-spacing: 0.05em;
    color: var(--accent-2);
    background: var(--accent-2-soft);
    padding: 4px 9px;
    border-radius: 3px;
    margin-bottom: 16px;
  }

  /* ---------- features ---------- */
  .elevire .features { padding: 84px 0 96px; }
  .elevire .features-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 24px;
    margin-bottom: 44px;
    flex-wrap: wrap;
  }
  .elevire .features-head h2 {
    font-size: clamp(1.7rem, 3vw, 2.3rem);
  }
  .elevire .features-head p {
    color: var(--ink-soft);
    max-width: 34ch;
    font-size: 0.98rem;
  }
  .elevire .feature-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(255px, 1fr));
    gap: 1px;
    background: var(--line);
    border: 1px solid var(--line);
  }
  .elevire .feature-card {
    background: var(--surface);
    padding: 26px 24px 28px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    transition: background 0.18s ease;
  }
  .elevire .feature-card:hover { background: var(--ground-alt); }
  .elevire .plate {
    display: inline-flex;
    align-items: stretch;
    align-self: flex-start;
    border: 1px solid var(--ink);
    border-radius: 3px;
    overflow: hidden;
    font-family: var(--font-mono);
    font-weight: 500;
    font-size: 0.78rem;
    letter-spacing: 0.04em;
  }
  .elevire .plate span {
    padding: 4px 8px;
  }
  .elevire .plate .band {
    background: var(--accent-2);
    color: #fff;
    width: 6px;
    padding: 0;
    flex: none;
  }
  .elevire .feature-card h3 {
    font-size: 1.05rem;
    text-transform: none;
    letter-spacing: 0;
    font-weight: 700;
    line-height: 1.3;
  }
  .elevire .feature-card p {
    color: var(--ink-soft);
    font-size: 0.95rem;
    line-height: 1.55;
  }

  /* ---------- closing cta ---------- */
  .elevire .closing {
    position: relative;
    padding: 96px 0;
    background: var(--ink);
    color: var(--ground);
    overflow: hidden;
  }
  .elevire .closing .hero-tread {
    opacity: 0.16;
    background-image: repeating-linear-gradient(
      115deg,
      color-mix(in srgb, var(--ground) 100%, transparent) 0px,
      color-mix(in srgb, var(--ground) 100%, transparent) 2px,
      transparent 2px,
      transparent 34px
    );
    -webkit-mask-image: radial-gradient(ellipse 70% 100% at 18% 40%, black, transparent 72%);
    mask-image: radial-gradient(ellipse 70% 100% at 18% 40%, black, transparent 72%);
  }
  .elevire .closing-inner {
    position: relative;
    z-index: 1;
    text-align: center;
    max-width: 620px;
    margin: 0 auto;
  }
  .elevire .closing h2 {
    font-size: clamp(2rem, 4vw, 2.9rem);
    color: var(--ground);
    line-height: 1.08;
  }
  .elevire .closing p {
    margin-top: 20px;
    color: color-mix(in srgb, var(--ground) 72%, transparent);
    font-size: 1.08rem;
  }
  .elevire .closing .hero-actions {
    justify-content: center;
    margin-top: 36px;
    animation: none;
    opacity: 1;
  }
  .elevire .closing .hero-note { color: color-mix(in srgb, var(--ground) 55%, transparent); }

  /* ---------- footer ---------- */
  .elevire footer {
    padding: 30px 0;
  }
  .elevire footer .wrap {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    font-family: var(--font-mono);
    font-size: 0.78rem;
    color: var(--ink-soft);
  }

  @media (max-width: 760px) {
    .elevire .problem .wrap { grid-template-columns: 1fr; gap: 28px; }
    .elevire .hero-rings { display: none; }
    .elevire .hero { padding: 64px 0 72px; }
  }
`;
