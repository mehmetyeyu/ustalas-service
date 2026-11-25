import type { Metadata, Viewport } from "next";
import AuthShell from "../elevire/AuthShell";

export const metadata: Metadata = { title: "Ücretsiz Hesap Oluştur — Elevire" };
export const viewport: Viewport = { themeColor: "#07080a" };

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return <AuthShell active="kayit">{children}</AuthShell>;
}
