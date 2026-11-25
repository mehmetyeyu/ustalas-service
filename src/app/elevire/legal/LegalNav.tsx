"use client";

import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/elevire/legal/hakkimizda", label: "Hakkımızda" },
  { href: "/elevire/legal/gizlilik", label: "Gizlilik ve KVKK" },
  { href: "/elevire/legal/mesafeli-satis-sozlesmesi", label: "Mesafeli Satış Sözleşmesi" },
  { href: "/elevire/legal/iptal-ve-iade", label: "İptal ve İade Koşulları" },
];

export default function LegalNav() {
  const pathname = usePathname();
  return (
    <nav className="legal-nav" aria-label="Kurumsal sayfalar">
      {LINKS.map((l) => (
        <a key={l.href} href={l.href} aria-current={pathname === l.href ? "page" : undefined}>{l.label}</a>
      ))}
    </nav>
  );
}
