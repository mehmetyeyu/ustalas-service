"use client";

import { useRef } from "react";
import { formatLiveTR, parseLiveTRInput } from "@/lib/format";

// Yazarken binlik ayraçlı/ondalık virgüllü Türkçe biçimde gösteren, ama dışarıya
// her zaman düz sayı metni ("1234.5") veren tutar inputu — Raporlar Yıllık Özet
// Gelir/Gider ve Müşteriler Tahsilat Tutarı ortak kullanır. Tek yer, iki ayrı
// sayfada ayrı ayrı yazılmış (ve kolayca birbirinden sapabilecek) cursor
// pozisyon matematiğini tekrarlamaktan kaçınır.
interface TRNumberInputProps {
  value: string; // ham state — nokta ondalık, binlik ayraçsız ("1234.5")
  onChange: (raw: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
}

// Binlik ayraç noktaları hariç her şey "anlamlı": rakamlar + ondalık virgülü.
// Sadece rakam saymak yetmiyor — virgülün hemen ardından yazılan bir karakter,
// virgülden SONRA değil ÖNCE konumlanırdı (virgül "sayılmadığı" için).
function meaningfulCharsBeforeCursor(value: string, cursor: number): number {
  return (value.slice(0, cursor).match(/[\d,]/g) ?? []).length;
}

// Biçimlenmiş metinde, baştan itibaren n'inci anlamlı karakterden HEMEN
// SONRAki pozisyonu bulur — cursor'ı yeniden biçimlenmiş metinde aynı
// "mantıksal" yere koymak için.
function cursorAfterMeaningfulChars(formatted: string, n: number): number {
  if (n <= 0) return 0;
  let count = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (/[\d,]/.test(formatted[i])) {
      count++;
      if (count === n) return i + 1;
    }
  }
  return formatted.length;
}

export function TRNumberInput({ value, onChange, placeholder, className, id }: TRNumberInputProps) {
  const ref = useRef<HTMLInputElement>(null);
  const displayValue = formatLiveTR(value);

  return (
    <input
      ref={ref}
      id={id}
      type="text"
      inputMode="decimal"
      value={displayValue}
      placeholder={placeholder}
      className={className}
      onChange={(e) => {
        const typed = e.target.value;
        const cursor = e.target.selectionStart ?? typed.length;
        const before = meaningfulCharsBeforeCursor(typed, cursor);

        const raw = parseLiveTRInput(typed);
        onChange(raw);

        // onChange tetiklediği re-render'dan SONRA input value'su yeni
        // displayValue'ya güncellenir — cursor'ı ona göre bir sonraki
        // paint'te yeniden konumlandırmak gerekiyor (senkron set işe yaramaz,
        // React henüz value'yu güncellemedi).
        const newDisplay = formatLiveTR(raw);
        requestAnimationFrame(() => {
          const el = ref.current;
          if (!el) return;
          const newCursor = cursorAfterMeaningfulChars(newDisplay, before);
          el.setSelectionRange(newCursor, newCursor);
        });
      }}
    />
  );
}
