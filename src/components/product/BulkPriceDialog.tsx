"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useDialog } from "@/lib/useDialog";
import { invalidateAfter } from "@/lib/queries";
import { useToast } from "@/components/ToastProvider";
import { useConfirm } from "@/components/ConfirmProvider";
import { useDebouncedValue } from "@/hooks/useDebounce";
import { formatCurrency } from "@/lib/format";
import { BULK_PRICE_ROUNDINGS, parseTrDecimal, type BulkPriceMode, type BulkPriceRounding } from "@/lib/bulkPrice";

// Ürün Kataloğu — Toplu Satış Fiyatı Güncelleme (POST /api/products/bulk-price,
// neyin neden güncellendiği src/lib/bulkPrice.ts'te). Kapsam Ürünler
// sayfasının o anki filtreleri; değer değiştikçe sunucudan önizleme gelir,
// uygulamadan önce onay istenir.

export interface BulkPriceScope {
  search: string;
  season: string;
  stock: "in" | "out" | "";
}

interface Preview {
  codes: number;
  batches: number;
  samples: { code: string; brand: string | null; size_desc: string | null; stock: number; old_price: number | null; new_price: number | null }[];
}

const field = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

function scopeText(scope: BulkPriceScope): string {
  const parts = [
    scope.search ? `"${scope.search}" araması` : null,
    scope.season ? `${scope.season} mevsimi` : null,
    scope.stock === "in" ? "stokta olan ürünler" : scope.stock === "out" ? "stoğu biten ürünler" : null,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "tüm ürünler";
}

export function BulkPriceDialog({ scope, onClose, onDone }: { scope: BulkPriceScope; onClose: () => void; onDone: () => void }) {
  const dialogRef = useDialog(onClose);
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [direction, setDirection] = useState<1 | -1>(1);
  const [mode, setMode] = useState<BulkPriceMode>("percent");
  const [amount, setAmount] = useState("10");
  const [rounding, setRounding] = useState<BulkPriceRounding>("none");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [saving, setSaving] = useState(false);

  // "1.000" = bin (Türkçe binlik ayıracı), "10,5" = on buçuk.
  const numeric = parseTrDecimal(amount);
  const value = Number.isFinite(numeric) ? direction * numeric : NaN;
  // Debounce kimlik karşılaştırır — nesne her çizimde yeni olacağından metin.
  const requestKey = useDebouncedValue(JSON.stringify({ mode, value, rounding }), 300);
  const request = JSON.parse(requestKey) as { mode: BulkPriceMode; value: number | null; rounding: BulkPriceRounding };

  function body(apply: boolean) {
    return JSON.stringify({ ...request, apply, search: scope.search, season: scope.season, stock: scope.stock });
  }

  useEffect(() => {
    if (request.value == null || !Number.isFinite(request.value) || request.value === 0) {
      setPreview(null);
      setPreviewError(null);
      return;
    }
    let cancelled = false;
    setLoadingPreview(true);
    fetch("/api/products/bulk-price", { method: "POST", headers: { "Content-Type": "application/json" }, body: body(false) })
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (res.ok) { setPreview(data); setPreviewError(null); }
        else { setPreview(null); setPreviewError(data.error ?? "Önizleme alınamadı."); }
      })
      .catch(() => { if (!cancelled) setPreviewError("Önizleme alınamadı."); })
      .finally(() => { if (!cancelled) setLoadingPreview(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  const changeText = `${direction > 0 ? "+" : "−"}${mode === "percent" ? `%${numeric}` : formatCurrency(numeric)}`;
  // JSON'da NaN null olur; karşılaştırma da metin üzerinden.
  const stale = requestKey !== JSON.stringify({ mode, value, rounding });
  const canApply = !!preview && preview.batches > 0 && !stale && !loadingPreview && !saving;

  async function handleApply() {
    if (!preview) return;
    const ok = await confirm({
      message: `${preview.codes} ürünün (${preview.batches} parti) satış fiyatı ${changeText} güncellenecek. Geçmiş siparişler ve alış fiyatları değişmez.\nDevam edilsin mi?`,
      confirmText: "Fiyatları Güncelle",
    });
    if (!ok) return;
    setSaving(true);
    try {
      const res = await fetch("/api/products/bulk-price", { method: "POST", headers: { "Content-Type": "application/json" }, body: body(true) });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Fiyatlar güncellenemedi."); return; }
      toast.success(`${data.codes} ürünün satış fiyatı güncellendi.`);
      invalidateAfter(queryClient, "product");
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Toplu Fiyat Güncelle" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl">
        <div className="min-h-0 flex-1 overflow-y-auto p-6 pb-4">
          <div className="mb-1 flex items-start justify-between">
            <h2 className="text-xl font-bold text-gray-800">Toplu Fiyat Güncelle</h2>
            <button aria-label="Kapat" onClick={onClose} className="-m-2 rounded-lg p-2 text-gray-400 hover:text-gray-600">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="mb-5 text-sm text-gray-500">
            Kapsam: <span className="font-medium text-gray-700">{scopeText(scope)}</span> — listedeki filtreleri değiştirerek daraltabilirsiniz.
            Sadece <span className="font-medium text-gray-700">satış fiyatı</span> değişir; alış fiyatları ve geçmiş siparişler aynı kalır.
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">İşlem</label>
              <div role="radiogroup" aria-label="İşlem" className="grid grid-cols-2 rounded-lg border border-gray-300 p-0.5 text-sm">
                {([[1, "Zam (+)"], [-1, "İndirim (−)"]] as const).map(([d, label]) => (
                  <button key={d} type="button" role="radio" aria-checked={direction === d} onClick={() => setDirection(d)}
                    className={`rounded-md px-2 py-1.5 font-medium ${direction === d ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label htmlFor="bp-amount" className="mb-1 block text-xs font-medium text-gray-600">Miktar</label>
              <div className="flex">
                <input id="bp-amount" type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))}
                  className={`${field} rounded-r-none`} />
                <select aria-label="Birim" value={mode} onChange={(e) => setMode(e.target.value as BulkPriceMode)}
                  className="rounded-r-lg border border-l-0 border-gray-300 bg-gray-50 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="percent">%</option>
                  <option value="amount">TL</option>
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="bp-round" className="mb-1 block text-xs font-medium text-gray-600">Yuvarlama (yukarı)</label>
              <select id="bp-round" value={rounding} onChange={(e) => setRounding(e.target.value as BulkPriceRounding)} className={field}>
                {BULK_PRICE_ROUNDINGS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-gray-200">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
              <span className="text-sm font-semibold text-gray-700">Önizleme</span>
              <span className="text-xs text-gray-500">
                {loadingPreview ? "Hesaplanıyor…" : preview ? `${preview.codes} ürün · ${preview.batches} parti etkilenecek` : ""}
              </span>
            </div>
            {previewError ? (
              <p className="px-4 py-4 text-sm text-red-600">{previewError}</p>
            ) : !preview ? (
              <p className="px-4 py-4 text-sm text-gray-400">Bir değer girin.</p>
            ) : preview.samples.length === 0 ? (
              <p className="px-4 py-4 text-sm text-gray-500">Bu kapsamda satış fiyatı girilmiş ürün yok.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-gray-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">Ürün</th>
                    <th className="px-4 py-2 text-right font-medium">Şu an</th>
                    <th className="px-4 py-2 text-right font-medium">Yeni</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {preview.samples.map((s) => (
                    <tr key={s.code}>
                      <td className="px-4 py-2">
                        <div className="font-mono text-xs font-semibold text-gray-800">{s.code}</div>
                        <div className="text-xs text-gray-500">{[s.brand, s.size_desc].filter(Boolean).join(" · ") || "—"}</div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-right text-gray-500">{s.old_price != null ? formatCurrency(s.old_price) : "—"}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-right font-semibold text-gray-900">{s.new_price != null ? formatCurrency(s.new_price) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {preview && preview.codes > preview.samples.length && (
              <p className="border-t border-gray-100 px-4 py-2 text-xs text-gray-400">
                İlk {preview.samples.length} ürün gösteriliyor (en çok stoğu olanlar).
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-3 border-t border-gray-100 px-6 py-4">
          <button onClick={onClose} className="flex-1 rounded-lg border border-gray-300 py-2.5 font-medium text-gray-700 hover:bg-gray-50">İptal</button>
          <button onClick={handleApply} disabled={!canApply}
            className="flex-1 rounded-lg bg-blue-600 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:bg-blue-300">
            {saving ? "Güncelleniyor..." : preview && preview.batches > 0 ? `${preview.codes} Ürünü Güncelle` : "Fiyatları Güncelle"}
          </button>
        </div>
      </div>
    </div>
  );
}
