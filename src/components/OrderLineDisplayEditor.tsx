"use client";

import { ORDER_LINE_FIELDS, formatOrderLine, type OrderLineField } from "@/lib/orderLineDisplay";

const LABEL = Object.fromEntries(ORDER_LINE_FIELDS.map((f) => [f.key, f.label])) as Record<OrderLineField, string>;

// Önizlemedeki örnek sipariş satırı.
const SAMPLE = {
  size_desc: "235/40R18", brand: "Pirelli", model_name: "P Zero", quantity: 2,
  stock_code: "PZ2354018", supplier: "Örnek Tedarikçi",
};

// Genel Ayarlar > Sipariş Listesi — "Yapılan İşlem" alt satırında hangi
// bilgilerin hangi sırayla görüneceği (bkz. src/lib/orderLineDisplay.ts).
export function OrderLineDisplayEditor({ value, onChange }: { value: OrderLineField[]; onChange: (v: OrderLineField[]) => void }) {
  const unused = ORDER_LINE_FIELDS.filter((f) => !value.includes(f.key));
  const move = (i: number, dir: -1 | 1) => {
    const next = [...value];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    onChange(next);
  };
  const preview = formatOrderLine(SAMPLE, value);

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Yapılan İşlem Altındaki Ürün Bilgisi</label>
      <p className="text-xs text-gray-400 mb-3">
        Sipariş Listesi&apos;nde hizmet adının (ör. Lastik Satışı) altında hangi bilgilerin hangi sırayla görüneceğini seçin.
      </p>

      <ol className="flex flex-wrap items-center gap-2">
        {value.map((key, i) => (
          <li key={key} className="inline-flex items-center rounded-lg border border-blue-200 bg-blue-50 text-sm text-blue-800">
            <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`${LABEL[key]} sola taşı`}
              className="px-1.5 py-1.5 text-blue-500 hover:text-blue-800 disabled:opacity-30">‹</button>
            <span className="px-1 font-medium">{LABEL[key]}</span>
            <button type="button" onClick={() => move(i, 1)} disabled={i === value.length - 1} aria-label={`${LABEL[key]} sağa taşı`}
              className="px-1.5 py-1.5 text-blue-500 hover:text-blue-800 disabled:opacity-30">›</button>
            <button type="button" onClick={() => onChange(value.filter((k) => k !== key))} aria-label={`${LABEL[key]} kaldır`}
              className="border-l border-blue-200 px-2 py-1.5 text-blue-400 hover:text-red-600">×</button>
          </li>
        ))}
        {unused.map((f) => (
          <li key={f.key}>
            <button type="button" onClick={() => onChange([...value, f.key])}
              className="rounded-lg border border-dashed border-gray-300 px-2.5 py-1.5 text-sm text-gray-500 hover:border-gray-400 hover:text-gray-700">
              + {f.label}
            </button>
          </li>
        ))}
      </ol>

      <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
        <div className="text-[11px] uppercase tracking-wide text-gray-400 mb-0.5">Önizleme</div>
        <div className="text-sm text-gray-700">Lastik Satışı</div>
        <div className="text-xs text-gray-500">{preview || "— ürün bilgisi gösterilmez —"}</div>
      </div>
    </div>
  );
}
