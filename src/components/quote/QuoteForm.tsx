"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ToastProvider";
import { formatCurrency } from "@/lib/format";
import { useServices, useCustomers, useSuppliers, useProductSizes, invalidateAfter } from "@/lib/queries";
import SearchableCombobox from "@/components/order/SearchableCombobox";
import TireBatchPicker from "@/components/order/TireBatchPicker";
import {
  addDaysISO, computeQuoteTotals, DEFAULT_VALIDITY_DAYS, formatISODate, lineTotal, priceForVatMode, todayIstanbul,
  VALIDITY_DAY_OPTIONS, VAT_RATES, type VatMode, type VatRate,
} from "@/lib/quotes";

// Teklif oluşturma/düzenleme formu — Yeni Sipariş formuyla (src/app/page.tsx)
// aynı satır düzeni ve aynı seçiciler. Farkları:
// * Fiyat BİRİM fiyat olarak girilir, Tutar = Adet × Birim hesaplanır
//   (siparişte Tutar satır toplamıdır).
// * KDV dahil/hariç ve oran teklif başına seçilir; otomatik doldurulan
//   katalog/parti fiyatları (KDV dahil tutuluyor) hariç modda nete çevrilir.
//   Mod sonradan değiştirilirse girilmiş fiyatlar BİLEREK çevrilmez —
//   kullanıcı fiyatı hangi anlamla yazdıysa öyle kalır.
// * Stok düşmez/rezerve edilmez; stoktan fazla adet sadece uyarı verir.
// * Maliyet/Kâr yalnızca quotes.view_cost izniyle görünür (sunucu da izinsiz
//   kullanıcıya maliyet göndermez/kabul etmez — bkz. src/lib/quoteStore.ts).

export interface QuoteLineData {
  id?: number;
  service_name: string;
  product_id: number | null;
  supplier: string | null;
  stock_code: string | null;
  size_desc: string | null;
  brand: string | null;
  model_name: string | null;
  quantity: number;
  unit_price: number;
  cost_total?: number | null;
}

export interface QuoteFormInitial {
  id: number;
  quote_no: string;
  customer_name: string | null;
  customer_phone: string | null;
  plate: string | null;
  notes: string | null;
  vat_mode: VatMode;
  vat_rate: VatRate;
  valid_until: string;
  lines: QuoteLineData[];
}

interface LineState {
  id?: number;
  service_name: string;
  supplier: string;
  stock_code: string;
  size_desc: string;
  brand: string;
  model_name: string;
  quantity: string;
  unit_price: string;
  cost_total: string;
  product_id: number | null;
  max_stock: number | null;
  unit_purchase_price: number | null;
}

const TEDARIKCI_SEED = ["Servis İşçiliği"];
const NO_STRINGS: string[] = [];

const EMPTY_LINE: LineState = {
  service_name: "", supplier: "Servis İşçiliği", stock_code: "", size_desc: "", brand: "", model_name: "",
  quantity: "1", unit_price: "", cost_total: "", product_id: null, max_stock: null, unit_purchase_price: null,
};

function num(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function qtyOf(l: LineState): number {
  return Math.max(1, Math.round(num(l.quantity)) || 1);
}

function toLineState(l: QuoteLineData): LineState {
  return {
    id: l.id,
    service_name: l.service_name,
    supplier: l.supplier ?? "",
    stock_code: l.stock_code ?? "",
    size_desc: l.size_desc ?? "",
    brand: l.brand ?? "",
    model_name: l.model_name ?? "",
    quantity: String(l.quantity),
    unit_price: String(l.unit_price),
    cost_total: l.cost_total != null ? String(l.cost_total) : "",
    product_id: l.product_id,
    max_stock: null,
    unit_purchase_price: null,
  };
}

const inputCls = "w-full border border-gray-300 rounded-lg px-4 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500";
const labelCls = "block text-[13px] font-medium text-gray-700 mb-1.5";

export default function QuoteForm({ initial, canViewCost }: { initial?: QuoteFormInitial; canViewCost: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();

  const services = useServices().data;
  const productSaleServiceNames = useMemo(() => new Set((services ?? []).filter((s) => s.tracks_size).map((s) => s.name)), [services]);
  const priceByName = useMemo(
    () => new Map((services ?? []).filter((s) => s.price != null).map((s) => [s.name.toLocaleLowerCase("tr-TR"), Number(s.price)])),
    [services]
  );
  const customers = useCustomers().data;
  const suppliersData = useSuppliers().data;
  const supplierOptions = useMemo(
    () => Array.from(new Set([...TEDARIKCI_SEED, ...(suppliersData ?? []).map((s) => s.name)])).sort((a, b) => a.localeCompare(b, "tr-TR")),
    [suppliersData]
  );
  const sizeOptions = useProductSizes().data ?? NO_STRINGS;

  const today = todayIstanbul();
  const [customerName, setCustomerName] = useState(initial?.customer_name ?? "");
  const [customerPhone, setCustomerPhone] = useState(initial?.customer_phone ?? "");
  const [plate, setPlate] = useState(initial?.plate ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [vatMode, setVatMode] = useState<VatMode>(initial?.vat_mode ?? "dahil");
  const [vatRate, setVatRate] = useState<VatRate>(initial?.vat_rate ?? 20);
  const [validUntil, setValidUntil] = useState(initial?.valid_until ?? addDaysISO(today, DEFAULT_VALIDITY_DAYS));
  const [lines, setLines] = useState<LineState[]>(() => (initial?.lines.length ? initial.lines.map(toLineState) : [{ ...EMPTY_LINE }]));
  const [saving, setSaving] = useState(false);

  const phoneByCustomer = useMemo(
    () => new Map((customers ?? []).map((c) => [c.name.toLocaleLowerCase("tr-TR"), c.phone])),
    [customers]
  );

  function updateLine(index: number, patch: Partial<LineState>) {
    setLines((prev) => prev.map((l, i) => {
      if (i !== index) return l;
      const next = { ...l, ...patch };
      if (patch.service_name !== undefined && patch.service_name !== l.service_name) {
        const trimmed = patch.service_name.trim();
        const match = priceByName.get(trimmed.toLocaleLowerCase("tr-TR"));
        if (match != null && !l.unit_price.trim()) next.unit_price = String(priceForVatMode(match, vatMode, vatRate));
        next.product_id = null;
        next.max_stock = null;
        next.unit_purchase_price = null;
        const isSale = productSaleServiceNames.has(trimmed);
        if (!isSale) { next.size_desc = ""; next.brand = ""; next.model_name = ""; next.stock_code = ""; }
        if (isSale) {
          if (l.supplier === "Servis İşçiliği") next.supplier = "";
        } else if (!l.supplier.trim()) {
          next.supplier = "Servis İşçiliği";
        }
      }
      return next;
    }));
  }

  function handleSupplierChange(index: number, line: LineState, val: string) {
    if (productSaleServiceNames.has(line.service_name.trim()) && line.product_id != null) {
      updateLine(index, { supplier: val, stock_code: "", size_desc: "", brand: "", model_name: "", product_id: null, max_stock: null, unit_purchase_price: null });
    } else {
      updateLine(index, { supplier: val });
    }
  }

  function handleQuantityChange(index: number, line: LineState, quantity: string) {
    // Parti seçiliyse maliyet (satır toplamı) adetle birlikte güncellenir —
    // birim fiyat zaten birim, değişmez.
    if (line.unit_purchase_price != null) {
      const qty = Math.max(1, Math.round(num(quantity)) || 1);
      updateLine(index, { quantity, cost_total: String(lineTotal(qty, line.unit_purchase_price)) });
    } else {
      updateLine(index, { quantity });
    }
  }

  const validLines = lines.filter((l) => l.service_name.trim());
  const totals = computeQuoteTotals(validLines.map((l) => ({ quantity: qtyOf(l), unit_price: num(l.unit_price) })), vatMode, vatRate);
  // Kâr = KDV dahil genel toplam − maliyet: teklif siparişe dönüşünce sipariş
  // ekranında görünecek Kâr (müşterinin ödediği Tutar − Maliyet) ile aynı
  // sayı çıksın diye.
  const totalCost = validLines.reduce((s, l) => s + num(l.cost_total), 0);
  const totalKar = totals.total - totalCost;
  const validityDays = Math.round((new Date(`${validUntil}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 864e5);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerName.trim() && !plate.trim()) {
      toast.error("Müşteri adı veya plakadan en az biri girilmelidir.");
      return;
    }
    if (validLines.length === 0) {
      toast.error("En az bir satır giriniz.");
      return;
    }
    if (totals.total <= 0) {
      toast.error("Teklif tutarı 0'dan büyük olmalıdır.");
      return;
    }
    if (!validUntil) {
      toast.error("Geçerlilik tarihi seçiniz.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(initial ? `/api/quotes/${initial.id}` : "/api/quotes", {
        method: initial ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: customerName.trim() || null,
          customer_phone: customerPhone.trim() || null,
          plate: plate.replace(/\s+/g, "").toUpperCase() || null,
          notes: notes.trim() || null,
          vat_mode: vatMode,
          vat_rate: vatRate,
          valid_until: validUntil,
          lines: validLines.map((l) => ({
            id: l.id ?? null,
            service_name: l.service_name.trim(),
            supplier: l.supplier.trim() || null,
            stock_code: l.stock_code.trim() || null,
            size_desc: l.size_desc.trim() || null,
            brand: l.brand.trim() || null,
            model_name: l.model_name.trim() || null,
            quantity: qtyOf(l),
            unit_price: num(l.unit_price),
            cost_total: canViewCost && l.cost_total.trim() ? num(l.cost_total) : null,
            product_id: l.product_id,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Kaydetme başarısız.");
      invalidateAfter(queryClient, "quote");
      toast.success(initial ? "Teklif güncellendi." : `Teklif ${data.quote_no} oluşturuldu.`);
      router.push(`/admin/quotes/${initial ? initial.id : data.id}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Hata oluştu.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <section aria-labelledby="teklif-musteri" className="rounded-xl border border-v2-line bg-v2-surface shadow-sm p-5">
        <h2 id="teklif-musteri" className="mb-4 text-[15px] font-semibold text-v2-fg">Müşteri</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>Müşteri Adı</label>
            <SearchableCombobox
              value={customerName}
              onChange={(val) => {
                setCustomerName(val);
                if (!customerPhone) {
                  const known = phoneByCustomer.get(val.trim().toLocaleLowerCase("tr-TR"));
                  if (known) setCustomerPhone(known);
                }
              }}
              options={(customers ?? []).map((c) => c.name)}
              placeholder="Müşteri seç veya yaz..."
            />
          </div>
          <div>
            <label className={labelCls}>Telefon</label>
            <input type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="0555 000 00 00" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Araç Plakası <span className="text-gray-400 font-normal">(opsiyonel)</span></label>
            <input
              type="text"
              value={plate}
              onChange={(e) => setPlate(e.target.value.replace(/\s+/g, ""))}
              placeholder="34 ABC 123"
              className={`${inputCls} font-mono uppercase`}
            />
          </div>
        </div>
      </section>

      <section aria-labelledby="teklif-ayarlari" className="rounded-xl border border-v2-line bg-v2-surface shadow-sm p-5">
        <h2 id="teklif-ayarlari" className="mb-4 text-[15px] font-semibold text-v2-fg">Fiyat ve Geçerlilik</h2>
        <div className="grid grid-cols-1 lg:grid-cols-[auto_auto_1fr] gap-5">
          <fieldset>
            <legend className={labelCls}>Fiyatlar</legend>
            <div className="inline-flex rounded-lg border border-gray-300 p-0.5" role="radiogroup">
              {(["dahil", "haric"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={vatMode === m}
                  onClick={() => setVatMode(m)}
                  className={`h-10 rounded-md px-4 text-sm font-semibold ${vatMode === m ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}
                >
                  {m === "dahil" ? "KDV Dahil" : "KDV Hariç"}
                </button>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor="teklif-kdv" className={labelCls}>KDV Oranı</label>
            <select
              id="teklif-kdv"
              value={vatRate}
              onChange={(e) => setVatRate(Number(e.target.value) as VatRate)}
              className="h-11 border border-gray-300 rounded-lg px-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {VAT_RATES.map((r) => <option key={r} value={r}>%{r}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="teklif-gecerlilik" className={labelCls}>Geçerlilik</label>
            <div className="flex flex-wrap items-center gap-2">
              {VALIDITY_DAY_OPTIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setValidUntil(addDaysISO(today, d))}
                  className={`h-11 rounded-lg border px-3.5 text-sm font-semibold ${validityDays === d ? "border-blue-600 bg-blue-50 text-blue-700" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}
                >
                  {d} gün
                </button>
              ))}
              <input
                id="teklif-gecerlilik"
                type="date"
                value={validUntil}
                min={today}
                onChange={(e) => setValidUntil(e.target.value)}
                className="h-11 border border-gray-300 rounded-lg px-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {validUntil && (
              <p className="mt-1.5 text-xs text-gray-500">
                {formatISODate(validUntil)} tarihine kadar geçerli{validityDays >= 0 ? ` (${validityDays} gün)` : " — geçmiş bir tarih"}
              </p>
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="teklif-satirlar" className="rounded-xl border border-v2-line bg-v2-surface shadow-sm">
        <div className="flex items-center justify-between border-b border-v2-line px-5 py-4">
          <h2 id="teklif-satirlar" className="text-[15px] font-semibold text-v2-fg">
            Ürün ve Hizmetler <span className="text-red-500">*</span>
          </h2>
          <span className="text-[13px] text-v2-fg-muted">
            Fiyatlar {vatMode === "dahil" ? "KDV dahil" : "KDV hariç"} · {lines.length} satır
          </span>
        </div>
        {lines.map((line, i) => {
          const isProductSale = productSaleServiceNames.has(line.service_name.trim());
          const overStock = line.product_id != null && line.max_stock != null && qtyOf(line) > line.max_stock;
          const amount = lineTotal(qtyOf(line), num(line.unit_price));
          const name = line.service_name.trim();
          return (
            <div key={i} className="flex flex-col gap-3.5 border-b border-v2-line px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-v2-fg-muted">
                  Satır {i + 1}{name ? ` · ${name}` : ""}
                </span>
                {lines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}
                    aria-label={`Satır ${i + 1}'i sil`}
                    title="Satırı sil"
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-v2-fg-muted hover:bg-v2-danger-bg hover:text-v2-danger-fg"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></svg>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-[repeat(24,minmax(0,1fr))]">
                <div className="col-span-2 min-w-0 sm:col-span-1 lg:col-span-6">
                  <label className={labelCls}>Ürün / Hizmet</label>
                  <SearchableCombobox value={line.service_name} onChange={(val) => updateLine(i, { service_name: val })} options={(services ?? []).map((s) => s.name)} placeholder="İşlem seç veya yaz..." />
                </div>
                <div className="col-span-2 min-w-0 sm:col-span-1 lg:col-span-6">
                  <label className={labelCls}>Tedarikçi</label>
                  <SearchableCombobox value={line.supplier} onChange={(val) => handleSupplierChange(i, line, val)} options={supplierOptions} placeholder="Tedarikçi seç veya yaz..." />
                </div>
                {isProductSale && (
                  <TireBatchPicker
                    supplier={line.supplier}
                    code={line.stock_code}
                    productId={line.product_id}
                    onCodeChange={(val) => updateLine(i, { stock_code: val })}
                    onBatchSelect={(batch) => {
                      const qty = qtyOf(line);
                      const sale = batch?.avg_sale_price != null ? Number(batch.avg_sale_price) : null;
                      const purchase = batch?.avg_purchase_price != null ? Number(batch.avg_purchase_price) : null;
                      updateLine(i, {
                        product_id: batch?.id ?? null,
                        size_desc: batch?.size_desc || line.size_desc,
                        brand: batch?.brand || line.brand,
                        model_name: batch?.model_name || line.model_name,
                        max_stock: batch?.stock_qty ?? null,
                        unit_purchase_price: purchase,
                        unit_price: batch && sale != null ? String(priceForVatMode(sale, vatMode, vatRate)) : line.unit_price,
                        cost_total: batch && purchase != null ? String(lineTotal(qty, purchase)) : line.cost_total,
                      });
                    }}
                    cellClassName="col-span-2 min-w-0 sm:col-span-1 lg:col-span-6"
                    labelClassName={labelCls}
                  />
                )}
                {isProductSale && (
                  <div className="col-span-2 min-w-0 sm:col-span-1 lg:col-span-4">
                    <label className={labelCls}>Ebat</label>
                    <SearchableCombobox value={line.size_desc} onChange={(val) => updateLine(i, { size_desc: val })} options={sizeOptions} placeholder="205/60R16" />
                  </div>
                )}
                {isProductSale && (
                  <div className="col-span-2 min-w-0 sm:col-span-1 lg:col-span-4">
                    <label className={labelCls}>Marka</label>
                    <input type="text" value={line.brand} onChange={(e) => updateLine(i, { brand: e.target.value })} placeholder="Marka" className={inputCls} />
                  </div>
                )}
                {isProductSale && (
                  <div className="col-span-2 min-w-0 sm:col-span-1 lg:col-span-4">
                    <label className={labelCls}>Model</label>
                    <input type="text" value={line.model_name} onChange={(e) => updateLine(i, { model_name: e.target.value })} placeholder="Model" className={inputCls} />
                  </div>
                )}
                <div className="lg:col-span-2">
                  <div className="mb-1.5 flex items-center justify-between gap-1">
                    <label className="block text-[13px] font-medium text-gray-700">Adet</label>
                    {line.product_id != null && line.max_stock != null && (
                      <span
                        title={overStock ? "Seçili partide bu kadar stok yok — teklif yine kaydedilir, stok siparişe dönüştürürken kontrol edilir." : "Seçili partide kalan stok"}
                        className={`whitespace-nowrap rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums ${overStock ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-600"}`}
                      >
                        Stok {line.max_stock}
                      </span>
                    )}
                  </div>
                  <input
                    type="number"
                    min="1"
                    value={line.quantity}
                    onChange={(e) => handleQuantityChange(i, line, e.target.value)}
                    className={`${inputCls} text-right ${overStock ? "border-amber-400" : ""}`}
                  />
                </div>
                <div className={canViewCost ? "lg:col-span-3" : "lg:col-span-5"}>
                  <label className={labelCls}>Birim Fiyat (₺)</label>
                  <input type="number" min="0" step="0.01" value={line.unit_price} onChange={(e) => updateLine(i, { unit_price: e.target.value })} className={`${inputCls} text-right`} />
                </div>
                <div className={canViewCost ? "lg:col-span-3" : "lg:col-span-5"}>
                  <span className={labelCls}>Tutar</span>
                  <div className="flex h-[46px] items-center justify-end text-base font-semibold tabular-nums text-v2-fg">{formatCurrency(amount)}</div>
                </div>
                {canViewCost && (
                  <div className="lg:col-span-2">
                    <label className={labelCls} title="Satırın toplam alış maliyeti — teklif çıktısında görünmez">Maliyet</label>
                    <input type="number" min="0" step="0.01" value={line.cost_total} onChange={(e) => updateLine(i, { cost_total: e.target.value })} placeholder="0" className={`${inputCls} px-2 text-right`} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div className="p-5">
          <button
            type="button"
            onClick={() => setLines((prev) => [...prev, { ...EMPTY_LINE }])}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-v2-line-strong text-sm font-semibold text-v2-link hover:bg-v2-muted"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M12 5v14M5 12h14" /></svg>
            Satır Ekle
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-v2-line bg-v2-surface shadow-sm p-5">
        <label htmlFor="teklif-notlar" className="mb-2.5 block text-[15px] font-semibold text-v2-fg">Notlar</label>
        <textarea
          id="teklif-notlar"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Teklifte müşteriye görünecek not (ör. montaj dahildir, ödeme koşulları)..."
          rows={3}
          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
        />
      </section>

      <div className="sticky bottom-3 sm:bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 sm:gap-4 rounded-xl border border-v2-line bg-v2-surface/95 px-4 sm:px-5 py-3 shadow-lg backdrop-blur">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-1 sm:gap-x-8">
          <div className="flex flex-col">
            <span className="text-xs text-v2-fg-muted">Ara Toplam</span>
            <span className="text-base font-semibold leading-8 tabular-nums text-v2-fg">{formatCurrency(totals.net)}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-v2-fg-muted">KDV %{vatRate}</span>
            <span className="text-base font-semibold leading-8 tabular-nums text-v2-fg">{formatCurrency(totals.vat)}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-v2-fg-muted">Genel Toplam</span>
            <span className="text-2xl font-bold leading-8 tracking-tight tabular-nums text-v2-fg">{formatCurrency(totals.total)}</span>
          </div>
          {canViewCost && (
            <div className="flex flex-col">
              <span className="text-xs text-v2-fg-muted">Kâr</span>
              <span className={`text-base font-semibold leading-8 tabular-nums ${totalKar >= 0 ? "text-v2-success-fg" : "text-v2-danger-fg"}`}>{formatCurrency(totalKar)}</span>
            </div>
          )}
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <button
            type="button"
            onClick={() => router.back()}
            className="h-12 flex-1 sm:flex-none rounded-xl border border-gray-300 px-5 text-[15px] font-semibold text-gray-700 hover:bg-gray-50"
          >
            Vazgeç
          </button>
          <button
            type="submit"
            disabled={saving}
            className="h-12 flex-1 sm:flex-none rounded-xl bg-blue-600 px-7 text-[15px] font-semibold text-white transition-colors hover:bg-blue-700 disabled:bg-blue-300"
          >
            {saving ? "Kaydediliyor..." : initial ? "Kaydet" : "Teklifi Oluştur"}
          </button>
        </div>
      </div>
    </form>
  );
}
