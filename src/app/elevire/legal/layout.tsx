import Image from "next/image";
import WaveHand from "../WaveHand";
import Logomark from "../Logomark";
import { inter } from "../fonts";

const LEGAL_LINKS = [
  { href: "/elevire/legal/hakkimizda", label: "Hakkımızda" },
  { href: "/elevire/legal/gizlilik", label: "Gizlilik Sözleşmesi" },
  { href: "/elevire/legal/mesafeli-satis-sozlesmesi", label: "Mesafeli Satış Sözleşmesi" },
  { href: "/elevire/legal/iptal-ve-iade", label: "İptal ve İade Koşulları" },
];

const CSS = `
  .elevire-legal {
    --ink: #0a0d12;
    --heading: #080a0c;
    --body: #717470;
    --surface: #ffffff;
    --line: #e5e4de;
    --yellow: #ffcf3d;
    --orange: #f8672d;
    --paper: #f3f2ea;
    --font-body: var(--font-inter), "Segoe UI", sans-serif;
  }
  .elevire-legal, .elevire-legal * { box-sizing: border-box; }
  .elevire-legal {
    margin: 0; min-height: 100vh; background: var(--surface); color: var(--ink);
    font-family: var(--font-body); font-size: 16px; line-height: 1.65;
  }
  .elevire-legal a { color: var(--orange); }

  .elevire-legal .hero {
    position: relative; height: min(46vh, 420px); min-height: 280px; overflow: hidden;
  }
  .elevire-legal .hero-img { object-fit: cover; z-index: 0; }
  .elevire-legal .hero-scrim {
    position: absolute; inset: 0; z-index: 1;
    background: linear-gradient(180deg, rgba(0,0,0,0.32) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 100%);
  }
  .elevire-legal .nav {
    position: absolute; top: 28px; left: 0; right: 0; z-index: 2;
    max-width: 1200px; margin: 0 auto; padding: 0 24px;
    display: flex; align-items: center; justify-content: space-between;
  }
  .elevire-legal .logo {
    display: flex; align-items: center; justify-content: center;
    width: 52px; height: 52px; border-radius: 50%; background: #000000; flex: none;
  }
  .elevire-legal .logo-mark { width: 30px; height: 29px; }
  .elevire-legal .nav-cta {
    display: inline-flex; align-items: center; font-weight: 700; font-size: 0.9rem;
    background: var(--yellow); color: #000000; padding: 12px 22px; border-radius: 999px;
    white-space: nowrap; text-decoration: none;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }
  .elevire-legal .nav-cta:hover { transform: translateY(-1px); box-shadow: 0 8px 18px -8px rgba(0,0,0,0.45); }

  .elevire-legal main { max-width: 1200px; margin: 0 auto; padding: 48px 24px 64px; }
  .elevire-legal h1 {
    font-weight: 600; font-size: 1.9rem; color: var(--heading);
    text-wrap: balance; margin: 0 0 8px;
  }
  .elevire-legal .updated {
    font-size: 0.8rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase;
    color: var(--body); margin-bottom: 32px;
  }
  .elevire-legal h2 {
    font-weight: 500; font-size: 1.25rem; color: var(--heading); line-height: 1.25;
    margin: 32px 0 10px;
  }
  .elevire-legal p, .elevire-legal li { margin: 0 0 12px; color: var(--body); }
  .elevire-legal strong { color: var(--heading); font-weight: 600; }
  .elevire-legal ul, .elevire-legal ol { padding-left: 22px; margin: 0 0 16px; }
  .elevire-legal .company-box {
    background: var(--paper); border: 1px solid var(--line); border-radius: 10px;
    padding: 18px 20px; font-size: 0.9rem; margin: 24px 0;
  }
  .elevire-legal .company-box p { margin: 0 0 4px; }
  .elevire-legal .disclaimer {
    font-size: 0.82rem; font-style: italic; color: var(--body);
    border-left: 3px solid var(--orange); padding: 10px 16px; margin: 24px 0;
  }
  .elevire-legal .closing { background: #0b0b0c; padding-top: 96px; margin-top: 64px; }
  .elevire-legal .closing-inner {
    text-align: center; max-width: 720px; margin: 0 auto; padding: 0 24px 88px;
  }
  .elevire-legal .closing-inner h2 {
    font-family: var(--font-body); font-weight: 400; margin: 0;
    font-size: clamp(2rem, 4.2vw, 3.2rem); color: #ffffff; line-height: 1.15;
  }
  .elevire-legal .wave-hand { width: 96px; margin: 0 auto 20px; }
  .elevire-legal .wave-hand-inner {
    transform: rotate(var(--mouse-tilt, 0deg));
    transform-origin: 72% 88%;
    transition: transform 0.25s ease-out;
  }
  .elevire-legal .wave-hand-inner img { display: block; width: 100%; height: auto; }
  .elevire-legal .wave-hand-inner.is-waving { animation: elevire-legal-wave 1.6s ease-in-out; }
  @keyframes elevire-legal-wave {
    0%, 100% { transform: rotate(0deg); }
    15% { transform: rotate(16deg); }
    30% { transform: rotate(-10deg); }
    45% { transform: rotate(16deg); }
    60% { transform: rotate(-6deg); }
    75% { transform: rotate(9deg); }
  }
  @media (prefers-reduced-motion: reduce) {
    .elevire-legal .wave-hand-inner.is-waving { animation: none; }
  }
  .elevire-legal .closing-cta {
    display: inline-flex; align-items: center; margin-top: 36px;
    padding: 18px 40px; border-radius: 999px; background: var(--yellow);
    color: #000000; font-weight: 500; font-size: 1.1rem; text-decoration: none;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }
  .elevire-legal .closing-cta:hover { transform: translateY(-2px); box-shadow: 0 14px 28px -14px rgba(255,207,61,0.55); }

  .elevire-legal footer {
    border-top: 1px solid rgba(255,255,255,0.1);
    background: #0b0b0c;
    padding: 24px 0 32px;
  }
  .elevire-legal footer .wrap {
    max-width: 1200px; margin: 0 auto; padding: 0 24px;
    display: flex; flex-direction: column; gap: 16px;
  }
  .elevire-legal footer .legal-nav { display: flex; flex-wrap: wrap; gap: 18px; font-size: 0.85rem; }
  .elevire-legal footer .legal-nav a { color: #91948f; }
  .elevire-legal footer .legal-nav a:hover { color: #ffffff; }
  .elevire-legal footer .footer-bottom {
    display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;
  }
  .elevire-legal footer .footer-copyright { font-size: 0.85rem; color: #ffffff; }
  .elevire-legal footer .payment-badges { display: flex; align-items: center; }
`;

export default function ElevireLegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`elevire-legal ${inter.variable}`}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="hero">
        <Image src="/elevire/hero.jpg" alt="" fill priority sizes="100vw" className="hero-img" />
        <div className="hero-scrim" />
        <nav className="nav">
          <a className="logo" href="/elevire" aria-label="Elevire">
            <Logomark className="logo-mark" />
          </a>
          <a className="nav-cta" href="/kayit">7 Gün Ücretsiz Dene</a>
        </nav>
      </div>
      <main>{children}</main>
      <div className="closing">
        <div className="closing-inner">
          <WaveHand />
          <h2>İşini tek ekrandan yönetmeye hazır mısın?</h2>
          <a className="closing-cta" href="/kayit">7 Gün Ücretsiz Dene</a>
        </div>

        <footer>
          <div className="wrap">
            <nav className="legal-nav">
              {LEGAL_LINKS.map((l) => (
                <a key={l.href} href={l.href}>{l.label}</a>
              ))}
            </nav>
            <div className="footer-bottom">
              <span className="footer-copyright">© 2026 Elevire. Tüm hakları saklıdır.</span>
              <div className="payment-badges">
                <img src="/payment-logos/logo-band-white.svg" alt="iyzico ile Öde, Mastercard, Visa, American Express, Troy" height={20} />
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
