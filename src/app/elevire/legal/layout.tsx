import type { Viewport } from "next";
import { geist, geistMono } from "../fonts";
import { SiteFooter, SiteNav, TryButton } from "../SiteChrome";
import { CSS, INNER_CSS } from "../styles";
import LegalNav from "./LegalNav";

export const viewport: Viewport = { themeColor: "#07080a" };

// Yasal sayfalar — landing'in siyah temasıyla aynı (bkz. ../styles.ts).
export default function ElevireLegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`ev ev-inner ${geist.variable} ${geistMono.variable}`}>
      <style dangerouslySetInnerHTML={{ __html: CSS + INNER_CSS }} />
      <div className="bg-grid" aria-hidden="true" />
      <div className="bg-glow" aria-hidden="true" />
      <SiteNav base="/elevire" />
      <main className="legal wrap">
        <aside className="legal-side">
          <p className="tag mono">KURUMSAL</p>
          <LegalNav />
        </aside>
        <article className="legal-body">{children}</article>
      </main>
      <section className="final">
        <h2>Defteri bugün kapat.</h2>
        <p className="head-lead">7 gün ücretsiz. Kurulum yok, kredi kartı gerekmez.</p>
        <div className="actions">
          <TryButton cta="yasal-kapanis" label="Ücretsiz hesabını aç" />
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
