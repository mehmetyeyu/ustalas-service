"use client";

// Native `title` tooltipleri tarayıcıya göre gecikmeli/tutarsız açıldığından,
// projeye özgü, anında görünen küçük bir tooltip. Kütüphane eklemeden, salt
// CSS (group-hover) ile çalışır.
export function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <span className="relative inline-flex group">
      {children}
      <span className="pointer-events-none absolute right-0 top-full z-50 mt-2 hidden w-64 rounded-lg bg-gray-900 px-3 py-2 text-xs leading-snug text-white shadow-lg group-hover:block">
        {text}
      </span>
    </span>
  );
}
