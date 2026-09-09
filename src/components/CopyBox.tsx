"use client";

import { useState } from "react";

export function CopyBox({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* pano izni yoksa sessizce yoksay — kutudan elle seçip kopyalanabilir */ }
  }
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-gray-600">{label}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="text-xs font-medium text-blue-600 hover:text-blue-800"
        >
          {copied ? "Kopyalandı ✓" : "Kopyala"}
        </button>
      </div>
      <textarea
        readOnly
        value={value}
        onFocus={(e) => e.target.select()}
        rows={2}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono bg-gray-50 text-gray-700 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}
