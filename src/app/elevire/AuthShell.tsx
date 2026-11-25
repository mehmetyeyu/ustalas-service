import { Check } from "./Check";
import { geist, geistMono } from "./fonts";
import { SiteFooter, SiteNav } from "./SiteChrome";
import { CSS, INNER_CSS } from "./styles";

const SIDE = {
  kayit: {
    tag: "7 GÜN ÜCRETSİZ",
    title: <>Defteri kapat. <br />İşini <em>tek ekrandan</em> yönet.</>,
    lead: "İş emri, lastik stoğu, lastik oteli, cari ve kasa tek bir yerde.",
    checks: ["Kurulum yok", "Kredi kartı gerekmez", "İstediğin an iptal"],
  },
  giris: {
    tag: "TEKRAR HOŞ GELDİN",
    title: <>Kaldığın yerden <em>devam et.</em></>,
    lead: "Firma kodun, kullanıcı adın ve şifrenle giriş yap; işin seni bekliyor.",
    checks: ["Bilgisayar, tablet ve telefondan", "Tüm veriler güncel"],
  },
} as const;

// Giriş ve kayıt ekranlarının ortak çerçevesi: landing'in menüsü, zemini ve
// alt bilgisi aynen; iki ekran aynı yerleşimde, karttaki sekmeyle birbirine
// geçilir (bkz. styles.ts @view-transition — sayfa geçişi yumuşak olur).
export default function AuthShell({ active, children }: { active: "giris" | "kayit"; children: React.ReactNode }) {
  const side = SIDE[active];
  return (
    <div className={`ev ev-inner ev-auth ${geist.variable} ${geistMono.variable}`}>
      <style dangerouslySetInnerHTML={{ __html: CSS + INNER_CSS }} />
      <div className="bg-grid" aria-hidden="true" />
      <div className="bg-glow" aria-hidden="true" />
      <SiteNav base="/elevire" active={active} />
      <main className="signup wrap">
        <div className="signup-side">
          <p className="tag mono">{side.tag}</p>
          <p className="big-title">{side.title}</p>
          <p className="head-lead">{side.lead}</p>
          <ul className="checks">{side.checks.map((c) => <Check key={c}>{c}</Check>)}</ul>
          <div className="side-floats" aria-hidden="true">
            <div className="float">
              <span className="float-icon green">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.73" strokeLinecap="round" strokeLinejoin="round"><path d="m3.4 8.4 3 3 6.2-6.4" /></svg>
              </span>
              <span><b>Stoktan otomatik düştü</b><span>Pirelli 235/40R18 · −4 adet</span></span>
            </div>
            <div className="float">
              <span className="plate mono">34 ELV 216</span>
              <span><b>Mevsim değişimi + depo</b><span>Can Aydın · ₺2.200</span></span>
            </div>
          </div>
        </div>
        <div className="signup-card card-surface">
          <nav className="tabs auth-tabs" aria-label="Giriş ve kayıt">
            <a className="tab" href="/admin/login" aria-current={active === "giris" ? "page" : undefined}>Giriş yap</a>
            <a className="tab" href="/kayit" aria-current={active === "kayit" ? "page" : undefined}>Kayıt ol</a>
          </nav>
          {children}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
