import { buildWhatsAppUrl } from "@/lib/quoteDocument";
import { COMPANY } from "./legal/company";
import Logo from "./Logo";
import MobileMenu from "./MobileMenu";
import ViewTransitionGuard from "./ViewTransitionGuard";

// Elevire'in herkese açık sayfalarının (landing, yasal sayfalar, /kayit) ortak
// parçaları: üst menü, alt bilgi, kayıt düğmesi. Stil: styles.ts (.ev).

export const WHATSAPP_URL = buildWhatsAppUrl(COMPANY.telefon, "Merhaba, Elevire hakkında bilgi almak istiyorum.");

const NAV = [
  { href: "#ozellikler", label: "Özellikler" },
  { href: "#lastik-oteli", label: "Lastik oteli" },
  { href: "#fiyatlar", label: "Fiyatlar" },
  { href: "#sss", label: "SSS" },
];

export function Arrow() {
  return (
    <svg className="arrow" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.47" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.3 8h9.2M8.8 4.2 12.6 8l-3.8 3.8" />
    </svg>
  );
}

export function Dual({ wide, narrow }: { wide: React.ReactNode; narrow: React.ReactNode }) {
  return (
    <>
      <span className="only-wide">{wide}</span>
      <span className="only-narrow">{narrow}</span>
    </>
  );
}

export function TryButton({ cta, label = "7 gün ücretsiz dene", className = "" }: { cta: string; label?: string; className?: string }) {
  return (
    <a className={`btn btn-primary ${className}`} href="/kayit" data-cta={cta}>
      {label}
      <Arrow />
    </a>
  );
}

// base: landing'de "" (sayfa içi bağlantı), iç sayfalarda "/elevire".
// active: giriş/kayıt ekranında ilgili bağlantı işaretlenir; kayıt ekranındaki
// "Ücretsiz dene" yeni bir kayıt tıklaması sayılmaz (data-cta yok).
export function SiteNav({ base = "", active }: { base?: string; active?: "giris" | "kayit" }) {
  const links = NAV.map((l) => ({ ...l, href: base + l.href }));
  return (
    <header className="nav">
      <ViewTransitionGuard />
      <div className="nav-pill">
        <a className="logo" href={base || "#top"} aria-label="Elevire ana sayfa"><Logo /></a>
        <nav className="nav-links" aria-label="Ana menü">
          {links.map((l) => <a key={l.href} href={l.href}>{l.label}</a>)}
        </nav>
        <div className="nav-actions">
          <a className="nav-login" href="/admin/login" aria-current={active === "giris" ? "page" : undefined}>Giriş yap</a>
          <a className="btn btn-primary btn-sm" href="/kayit" data-cta={active === "kayit" ? undefined : "nav"}>
            <span className="only-wide">Ücretsiz dene</span>
            <span className="only-narrow">Dene</span>
            <Arrow />
          </a>
          <MobileMenu links={[...links, { href: "/admin/login", label: "Giriş yap" }]} />
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="footer wrap">
      <Logo className="footer-logo only-narrow" />
      <p className="footer-about only-wide">Lastikçiler ve oto servisler için iş emri, stok, lastik oteli, cari ve kasa yönetimi.</p>
      <p className="footer-contact">
        <a href={`tel:${COMPANY.telefon.replace(/\s/g, "")}`}>{COMPANY.telefon}</a> · <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>
        <br />
        <Dual wide="Esentepe Mah. Talat Paşa Cad. No:5, Şişli / İstanbul" narrow="Şişli / İstanbul" />
      </p>
      <nav className="footer-legal" aria-label="Yasal">
        <a href="/elevire/legal/hakkimizda">Hakkımızda</a>
        <a href="/elevire/legal/gizlilik">Gizlilik</a>
        <a href="/elevire/legal/gizlilik">KVKK<span className="only-wide"> Aydınlatma</span></a>
        <a href="/elevire/legal/mesafeli-satis-sozlesmesi">Mesafeli Satış</a>
        <a href="/elevire/legal/iptal-ve-iade">İptal ve İade</a>
      </nav>
      <div className="footer-bottom">
        <span>© 2026 Elevire</span>
        {/* Tasarımdaki "iyzico · Visa · Mastercard · Troy · Amex" yazısı yerine
            iyzico'nun istediği logo bandı. */}
        <img src="/payment-logos/logo-band-white.svg" alt="iyzico ile Öde, Mastercard, Visa, American Express, Troy" height={18} />
      </div>
      <p className="wordmark" aria-hidden="true">elevire</p>
    </footer>
  );
}
