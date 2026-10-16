import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ToastProvider";
import { ConfirmProvider } from "@/components/ConfirmProvider";
import { QueryProvider } from "@/components/QueryProvider";
import { UI_BOOT_SCRIPT } from "@/lib/uiThemeBoot";

// Yeni panel görünümünün (v2) yazı tipleri — next/font build sırasında indirip
// kendi sunucumuzdan sunar (CSP font-src 'self'). preload kapalı: dosyalar
// ancak bir öğe bu fontu kullandığında (yalnızca v2'de) iner, eski görünüm
// ve herkese açık sayfalar hiç indirmez. latin-ext: ş, ğ, ı, İ için.
const v2Sans = IBM_Plex_Sans({ subsets: ["latin", "latin-ext"], weight: ["400", "500", "600", "700"], variable: "--font-v2-sans", preload: false, display: "swap" });
const v2Mono = IBM_Plex_Mono({ subsets: ["latin", "latin-ext"], weight: ["500"], variable: "--font-v2-mono", preload: false, display: "swap" });

export const metadata: Metadata = {
  title: "Lastik Servis Yönetim Sistemi",
  description: "Lastik, rot ve balans hizmetleri için sipariş ve yönetim sistemi",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // suppressHydrationWarning: UI_BOOT_SCRIPT hydration'dan önce <html>'e
    // data-ui/data-theme ekleyebilir (tema tercihi) — yalnızca bu elementin
    // öznitelikleri için, alt ağacı etkilemez.
    <html lang="tr" className={`${v2Sans.variable} ${v2Mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: UI_BOOT_SCRIPT }} />
      </head>
      <body className="bg-gray-50 min-h-screen">
        <QueryProvider>
          <ToastProvider>
            <ConfirmProvider>{children}</ConfirmProvider>
          </ToastProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
