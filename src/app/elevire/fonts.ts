import { Geist, Geist_Mono } from "next/font/google";

// Landing, yasal sayfalar ve /kayit. latin-ext: ş, ğ, ı, İ ve ₺. Ağırlık
// verilmez — değişken font tek dosya iner.
export const geist = Geist({ subsets: ["latin", "latin-ext"], variable: "--font-geist" });
export const geistMono = Geist_Mono({ subsets: ["latin", "latin-ext"], variable: "--font-geist-mono" });
