import type { ReactNode } from "react";

// Ayarlar sayfalarının (Profil, Genel Ayarlar, Randevu Ayarları) ortak
// iskeleti — eski ve yeni görünümde aynı düzen (renkler --v2-* değişkenleri,
// açık tema :root'ta da tanımlı, bkz. globals.css). Büyük ekranda her bölüm
// solda başlık + açıklama, sağda kart olarak dizilir; eskiden tüm bölümler
// dar tek bir sütunda (max-w-lg) alt alta sıkışıyordu.

export function SettingsPage({
  title,
  description,
  footer,
  children,
}: {
  title: string;
  description?: ReactNode;
  // Sayfa geneli Kaydet butonu — altta yapışkan çubukta, sağa yaslı.
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="max-w-5xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-v2-fg">{title}</h1>
        {description && <p className="mt-1 text-sm text-v2-fg-muted">{description}</p>}
      </header>
      <div>{children}</div>
      {footer && (
        <div className="sticky bottom-4 z-10 mt-2 flex justify-end rounded-xl border border-v2-line bg-v2-surface/90 px-4 py-3 shadow-lg backdrop-blur [&_button]:w-auto [&_button]:px-6">
          {footer}
        </div>
      )}
    </div>
  );
}

export function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-x-10 gap-y-4 border-t border-v2-line py-8 first:border-t-0 first:pt-0 lg:grid-cols-[240px_minmax(0,1fr)]">
      <div>
        <h2 className="text-[15px] font-semibold text-v2-fg">{title}</h2>
        {description && <p className="mt-1 text-sm leading-relaxed text-v2-fg-muted">{description}</p>}
      </div>
      <div className="min-w-0 rounded-xl border border-v2-line bg-v2-surface p-6 shadow-sm">{children}</div>
    </section>
  );
}
