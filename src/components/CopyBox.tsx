"use client";

import { useState } from "react";

function CopyIcon({ copied }: { copied: boolean }) {
  if (copied) {
    return (
      <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 10l4 4 8-8" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
      <path d="M4.5 12.5H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h7.5a1 1 0 0 1 1 1v.5" />
    </svg>
  );
}

// compact: kısa, tek satırlık değerler (ör. Firma Kodu) için — çok satırlı
// textarea (embed kodu/link gibi uzun değerler için tasarlandı) kısa bir
// değerde orantısız/boş görünürdü. Kopyala butonu alanın İÇİNDE, sağ üstte
// bir ikon olarak durur (metin etiketi yerine) — tıklayınca ikon kısaca
// onay işaretine döner.
export function CopyBox({ label, value, compact }: { label: string; value: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* pano izni yoksa sessizce yoksay — kutudan elle seçip kopyalanabilir */ }
  }
  const copyButton = (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? "Kopyalandı" : "Kopyala"}
      aria-label={copied ? "Kopyalandı" : "Kopyala"}
      className={`absolute top-1.5 right-1.5 p-1.5 rounded-md transition-colors ${
        copied ? "text-emerald-600 bg-emerald-50" : "text-gray-400 hover:text-blue-600 hover:bg-blue-50"
      }`}
    >
      <CopyIcon copied={copied} />
    </button>
  );
  return (
    <div className="mb-3">
      <span className="block text-xs font-medium text-gray-600 mb-1">{label}</span>
      <div className="relative">
        {compact ? (
          <input
            type="text"
            readOnly
            value={value}
            onFocus={(e) => e.target.select()}
            className="w-full border border-gray-300 rounded-lg pl-3 pr-9 py-2 text-sm font-mono tracking-widest bg-gray-50 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        ) : (
          <textarea
            readOnly
            value={value}
            onFocus={(e) => e.target.select()}
            rows={2}
            className="w-full border border-gray-300 rounded-lg pl-3 pr-9 py-2 text-xs font-mono bg-gray-50 text-gray-700 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        )}
        {copyButton}
      </div>
    </div>
  );
}
