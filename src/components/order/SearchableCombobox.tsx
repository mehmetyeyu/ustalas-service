"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { trIncludes } from "@/lib/trSearch";

// Yazdıkça daralan öneri listeli metin kutusu — Yeni Sipariş ("/"), Sipariş
// Düzelt (/admin/orders/[id]) ve Teklif formu ortak kullanır. (Ürünler ve
// Depolama ekranlarında hâlâ kendi yerel kopyaları var.)
export default function SearchableCombobox({
  value, onChange, options, placeholder,
}: {
  value: string;
  onChange: (val: string) => void;
  options: string[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  // Odaklanınca sıfırlanır: alan zaten bir değerle dolu gelse bile (ör. varsayılan
  // "Servis İşçiliği") açılışta tüm liste gösterilir, daraltma sadece yazarken olur.
  const [query, setQuery] = useState("");
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = query
    ? options.filter((o) => trIncludes(o, query))
    : options;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current && !containerRef.current.contains(e.target as Node) &&
        !(e.target as HTMLElement).closest("[data-combobox-list]")
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Dropdown, İşlem Satırları tablosunun yatay kaydırma alanı (overflow-x-auto)
  // tarafından kırpılmasın diye document.body'e portal ile taşınır; konumu
  // input'un ekran koordinatlarına göre hesaplanır.
  useEffect(() => {
    if (!open) return;
    function updateRect() {
      if (!inputRef.current) return;
      const r = inputRef.current.getBoundingClientRect();
      setRect({ top: r.bottom, left: r.left, width: r.width });
    }
    updateRect();
    window.addEventListener("scroll", updateRect, true);
    window.addEventListener("resize", updateRect);
    return () => {
      window.removeEventListener("scroll", updateRect, true);
      window.removeEventListener("resize", updateRect);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); setQuery(e.target.value); setOpen(true); }}
        onFocus={(e) => { setQuery(""); setOpen(true); e.target.select(); }}
        // Escape önce açık öneri listesini kapatır; içinde bulunduğu pencere
        // (useDialog) preventDefault'u görüp kapanmaz — ikinci Escape kapatır.
        onKeyDown={(e) => { if (e.key === "Escape" && open) { e.preventDefault(); setOpen(false); } }}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {open && filtered.length > 0 && rect && typeof document !== "undefined" && createPortal(
        <ul
          data-combobox-list
          style={{ position: "fixed", top: rect.top + 4, left: rect.left, width: rect.width }}
          className="z-50 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto"
        >
          {filtered.map((opt) => (
            <li
              key={opt}
              onMouseDown={(e) => { e.preventDefault(); onChange(opt); setOpen(false); }}
              className={`px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 hover:text-blue-700 ${value === opt ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700"}`}
            >
              {opt}
            </li>
          ))}
        </ul>,
        document.body
      )}
    </div>
  );
}
