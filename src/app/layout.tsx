import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="tr">
      <body className="bg-gray-50 min-h-screen">{children}</body>
    </html>
  );
}
