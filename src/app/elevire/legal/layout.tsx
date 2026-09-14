import { Oswald, Source_Sans_3, JetBrains_Mono } from "next/font/google";

const oswald = Oswald({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-oswald" });
const sourceSans = Source_Sans_3({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--font-source-sans" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-jetbrains-mono" });

const LEGAL_LINKS = [
  { href: "/elevire/legal/hakkimizda", label: "Hakkımızda" },
  { href: "/elevire/legal/gizlilik", label: "Gizlilik Sözleşmesi" },
  { href: "/elevire/legal/mesafeli-satis-sozlesmesi", label: "Mesafeli Satış Sözleşmesi" },
  { href: "/elevire/legal/iptal-ve-iade", label: "İptal ve İade Koşulları" },
];

const CSS = `
  .elevire-legal {
    --ink: #1c1c1a;
    --ink-soft: #4a4a45;
    --ground: #f0efea;
    --surface: #fbfaf7;
    --line: #d8d6cc;
    --accent-2: #2c4a75;
    --font-display: var(--font-oswald), "Arial Narrow", sans-serif;
    --font-body: var(--font-source-sans), "Segoe UI", sans-serif;
    --font-mono: var(--font-jetbrains-mono), "Courier New", monospace;
  }
  @media (prefers-color-scheme: dark) {
    .elevire-legal:not([data-theme="light"]) {
      --ink: #eeece4; --ink-soft: #b3b0a4; --ground: #17181a; --surface: #202224;
      --line: #34363a; --accent-2: #7fa0d6;
    }
  }
  .elevire-legal[data-theme="dark"] {
    --ink: #eeece4; --ink-soft: #b3b0a4; --ground: #17181a; --surface: #202224;
    --line: #34363a; --accent-2: #7fa0d6;
  }
  .elevire-legal, .elevire-legal * { box-sizing: border-box; }
  .elevire-legal {
    margin: 0; min-height: 100vh; background: var(--ground); color: var(--ink);
    font-family: var(--font-body); font-size: 16px; line-height: 1.65;
  }
  .elevire-legal a { color: var(--accent-2); }
  .elevire-legal header {
    padding: 18px 0; border-bottom: 1px solid var(--line);
  }
  .elevire-legal header .wrap { max-width: 760px; margin: 0 auto; padding: 0 24px; }
  .elevire-legal .wordmark {
    display: flex; align-items: center; gap: 10px; text-decoration: none;
    font-family: var(--font-display); font-weight: 600; font-size: 1.2rem;
    text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink);
  }
  .elevire-legal .wordmark .bar { width: 6px; height: 18px; background: var(--accent-2); border-radius: 1px; flex: none; }
  .elevire-legal main { max-width: 760px; margin: 0 auto; padding: 48px 24px 64px; }
  .elevire-legal h1 {
    font-family: var(--font-display); font-weight: 700; font-size: 1.9rem;
    letter-spacing: 0.01em; text-wrap: balance; margin: 0 0 8px;
  }
  .elevire-legal .updated { font-family: var(--font-mono); font-size: 0.78rem; color: var(--ink-soft); margin-bottom: 32px; }
  .elevire-legal h2 {
    font-family: var(--font-display); font-weight: 600; font-size: 1.15rem;
    margin: 32px 0 10px;
  }
  .elevire-legal p, .elevire-legal li { margin: 0 0 12px; color: var(--ink-soft); }
  .elevire-legal strong { color: var(--ink); font-weight: 600; }
  .elevire-legal ul, .elevire-legal ol { padding-left: 22px; margin: 0 0 16px; }
  .elevire-legal .company-box {
    background: var(--surface); border: 1px solid var(--line); border-radius: 10px;
    padding: 18px 20px; font-size: 0.9rem; margin: 24px 0;
  }
  .elevire-legal .company-box p { margin: 0 0 4px; }
  .elevire-legal .disclaimer {
    font-size: 0.82rem; font-style: italic; color: var(--ink-soft);
    border-left: 3px solid var(--accent-2); padding: 10px 16px; margin: 24px 0;
  }
  .elevire-legal footer { border-top: 1px solid var(--line); padding: 24px 0; }
  .elevire-legal footer .wrap {
    max-width: 760px; margin: 0 auto; padding: 0 24px;
    display: flex; flex-wrap: wrap; gap: 14px; align-items: center; justify-content: space-between;
  }
  .elevire-legal .legal-nav { display: flex; flex-wrap: wrap; gap: 14px; font-size: 0.82rem; }
  .elevire-legal .payment-badges { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .elevire-legal .payment-badge {
    font-family: var(--font-mono); font-size: 0.68rem; font-weight: 600; letter-spacing: 0.03em;
    color: var(--ink-soft); border: 1px solid var(--line); border-radius: 4px; padding: 3px 7px;
  }
`;

export default function ElevireLegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`elevire-legal ${oswald.variable} ${sourceSans.variable} ${jetbrainsMono.variable}`}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <header>
        <div className="wrap">
          <a className="wordmark" href="/elevire">
            <span className="bar"></span>Elevıre
          </a>
        </div>
      </header>
      <main>{children}</main>
      <footer>
        <div className="wrap">
          <nav className="legal-nav">
            {LEGAL_LINKS.map((l) => (
              <a key={l.href} href={l.href}>{l.label}</a>
            ))}
          </nav>
          <div className="payment-badges">
            <span className="payment-badge">VISA</span>
            <span className="payment-badge">Mastercard</span>
            <span className="payment-badge">iyzico ile Öde</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
