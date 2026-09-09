"use client";

// Native `title` tooltipleri tarayıcıya göre gecikmeli/tutarsız açıldığından,
// projeye özgü, anında görünen küçük bir tooltip. Kütüphane eklemeden, salt
// CSS (group-hover) ile çalışır.
// align="right" (varsayılan) balonu tetikleyicinin SAĞ kenarına hizalar ve
// SOLA doğru genişletir — sayfanın sol kenarına yakın bir tetikleyicide (ör.
// Sipariş Listesi'ndeki en soldaki checkbox sütunu) bu, balonun ekran dışına
// taşıp kesilmesine yol açar; o durumda align="left" (SAĞA doğru genişler) kullanılır.
export function Tooltip({ text, children, align = "right" }: { text: string; children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <span className="relative inline-flex group">
      {children}
      <span className={`pointer-events-none absolute ${align === "left" ? "left-0" : "right-0"} top-full z-50 mt-2 hidden w-64 rounded-lg bg-gray-900 px-3 py-2 text-xs leading-snug text-white shadow-lg group-hover:block`}>
        {text}
      </span>
    </span>
  );
}
