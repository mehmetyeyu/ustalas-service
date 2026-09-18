import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ToastProvider";
import { ConfirmProvider } from "@/components/ConfirmProvider";

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
      <body className="bg-gray-50 min-h-screen">
        <ToastProvider>
          <ConfirmProvider>{children}</ConfirmProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
