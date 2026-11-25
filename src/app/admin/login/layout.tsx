import type { Metadata, Viewport } from "next";
import AuthShell from "../../elevire/AuthShell";

export const metadata: Metadata = { title: "Giriş Yap — Elevire" };
export const viewport: Viewport = { themeColor: "#07080a" };

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <AuthShell active="giris">{children}</AuthShell>;
}
