"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useViewGuard, usePermission } from "../../AuthContext";
import { useToast } from "@/components/ToastProvider";
import { useConfirm } from "@/components/ConfirmProvider";
import { StickyScrollX } from "@/components/StickyScrollX";
import QuoteStatusBadge from "@/components/quote/QuoteStatusBadge";
import { formatCurrency, formatDate } from "@/lib/format";
import { useQueryClient } from "@tanstack/react-query";
import { useCompanyInfo, useMe, invalidateAfter } from "@/lib/queries";
import { useDialog } from "@/lib/useDialog";
import { buildQuotePrintHtml, buildQuoteWhatsAppText, buildWhatsAppUrl, type CompanyDoc } from "@/lib/quoteDocument";
import { formatISODate, isQuoteLocked, type QuoteStatus, type QuoteTotals, type VatMode, type VatRate } from "@/lib/quotes";

interface QuoteDetail {
  id: number;
  quote_no: string;
  customer_name: string | null;
  customer_phone: string | null;
  plate: string | null;
  status: QuoteStatus;
  vat_mode: VatMode;
  vat_rate: VatRate;
  valid_until: string;
  notes: string | null;
  order_id: number | null;
  custom_order_no: string | null;
  converted_at: string | null;
  created_at: string;
  updated_at: string;
  created_by_name: string | null;
  expired: boolean;
  can_view_cost: boolean;
  totals: QuoteTotals;
  lines: {
    id: number; service_name: string; product_id: number | null; supplier: string | null; stock_code: string | null; size_desc: string | null;
    brand: string | null; model_name: string | null; quantity: number; unit_price: number; line_total: number; cost_total?: number | null;
  }[];
}

// Durum düğmeleri: o anki duruma göre anlamlı geçişler. Siparişe dönüştürme
// (SIPARIS) ayrı bir adım — burada yok.
const STATUS_ACTIONS: Record<QuoteStatus, { to: QuoteStatus; label: string }[]> = {
  TASLAK: [{ to: "GONDERILDI", label: "Gönderildi" }, { to: "KABUL", label: "Kabul Edildi" }, { to: "RED", label: "Reddedildi" }],
  GONDERILDI: [{ to: "KABUL", label: "Kabul Edildi" }, { to: "RED", label: "Reddedildi" }, { to: "TASLAK", label: "Taslağa Al" }],
  KABUL: [{ to: "GONDERILDI", label: "Kabulü Geri Al" }],
  RED: [{ to: "GONDERILDI", label: "Yeniden Aç" }],
  SIPARIS: [],
};

export default function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const allowed = useViewGuard("quotes");
  const canEdit = usePermission("quotes.edit");
  const canDelete = usePermission("quotes.delete");
  const canConvert = usePermission("quotes.convert");
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const [showConvert, setShowConvert] = useState(false);
  const convertDialog = useDialog(() => setShowConvert(false));
  const [convertPlate, setConvertPlate] = useState("");
  const [convertOrderNo, setConvertOrderNo] = useState("");
  // Dönüştürme penceresi açılınca partilerin GÜNCEL stoğu — teklif stok
  // ayırmadığı için arada satılmış olabilir; yetmiyorsa önceden uyarılır
  // (sunucu zaten reddeder, bu sadece sürprizi önler).
  const [stockShort, setStockShort] = useState<{ name: string; need: number; have: number }[]>([]);
  const [quote, setQuote] = useState<QuoteDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Çıktının başlığı ve WhatsApp mesajındaki firma adı — sayfa açılırken
  // önceden çekilir ki WhatsApp penceresi tıklamayla aynı anda (açılır
  // pencere engeline takılmadan) açılabilsin.
  const company = useCompanyInfo<CompanyDoc>().data ?? null;

  const load = useCallback(() => {
    return fetch(`/api/quotes/${id}`, { cache: "no-store" })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Teklif yüklenemedi.");
        setQuote(data);
      })
      .catch((e: Error) => setError(e.message));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function setStatus(to: QuoteStatus) {
    setBusy(true);
    try {
      const res = await fetch(`/api/quotes/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: to }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Durum değiştirilemedi.");
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Hata oluştu.");
    } finally {
      setBusy(false);
    }
  }

  function handlePrint() {
    if (!quote) return;
    const win = window.open("", "_blank");
    if (!win) {
      toast.error("Yazdırma penceresi açılamadı — tarayıcının açılır pencere iznini kontrol edin.");
      return;
    }
    win.document.write(buildQuotePrintHtml(quote, company));
    win.document.close();
  }

  // Taslak bir teklif WhatsApp'tan gönderilince "Gönderildi" olarak
  // işaretlenir — personelin ayrıca hatırlaması gerekmesin. Mesajın gerçekten
  // gönderildiği bilinemez (WhatsApp'ta vazgeçilebilir); yanlışsa "Taslağa
  // Al" ile geri alınır.
  function handleWhatsApp() {
    if (!quote) return;
    window.open(buildWhatsAppUrl(quote.customer_phone, buildQuoteWhatsAppText(quote, company?.name ?? null)), "_blank", "noopener");
    if (canEdit && quote.status === "TASLAK") void setStatus("GONDERILDI");
  }

  function openConvert() {
    if (!quote) return;
    setConvertPlate("");
    setConvertOrderNo("");
    setStockShort([]);
    setShowConvert(true);
    const productLines = quote.lines.filter((l) => l.product_id != null);
    Promise.all(productLines.map((l) =>
      fetch(`/api/products/${l.product_id}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { stock_qty?: number } | null) => ({ l, have: typeof d?.stock_qty === "number" ? d.stock_qty : null }))
        .catch(() => ({ l, have: null }))
    )).then((rows) => {
      // Aynı parti birden fazla satırda olabilir — ihtiyaç toplanır.
      const need = new Map<number, { name: string; need: number; have: number | null }>();
      for (const { l, have } of rows) {
        const cur = need.get(l.product_id!) ?? { name: [l.stock_code, l.size_desc, l.brand].filter(Boolean).join(" · ") || l.service_name, need: 0, have };
        cur.need += l.quantity;
        need.set(l.product_id!, cur);
      }
      setStockShort(Array.from(need.values()).filter((x): x is { name: string; need: number; have: number } => x.have != null && x.have < x.need));
    });
  }

  async function handleConvert() {
    if (!quote) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/quotes/${id}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plate: convertPlate.trim() || null, custom_order_no: convertOrderNo.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Siparişe dönüştürülemedi.");
      invalidateAfter(queryClient, "order");
      toast.success(`Teklif ${quote.quote_no} siparişe dönüştürüldü.`);
      router.push(`/admin/orders/${data.order_id}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Hata oluştu.");
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!quote) return;
    if (!(await confirm({ message: `${quote.quote_no} numaralı teklif silinsin mi? Bu işlem geri alınamaz.`, confirmText: "Sil", variant: "danger" }))) return;
    setBusy(true);
    const res = await fetch(`/api/quotes/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Teklif silindi.");
      router.push("/admin/quotes");
    } else {
      toast.error((await res.json().catch(() => ({}))).error || "Silinemedi.");
      setBusy(false);
    }
  }

  if (!allowed) return null;
  if (error) return <div className="rounded-xl border border-v2-line bg-v2-surface p-8 text-center text-v2-fg-muted">{error}</div>;
  if (!quote) return <div className="text-center text-v2-fg-muted py-12">Yükleniyor...</div>;

  const locked = isQuoteLocked(quote.status);
  const totalCost = quote.lines.reduce((s, l) => s + Number(l.cost_total || 0), 0);
  // Partisi seçili ama maliyeti boş bir satır varsa kâr gerçekte olduğundan
  // yüksek görünürdü — rakam yerine "—" (dönüştürmede maliyet partiden dolar).
  const costMissing = quote.lines.some((l) => l.product_id != null && l.cost_total == null);
  const hasProductCols = quote.lines.some((l) => l.size_desc || l.brand || l.stock_code);

  return (
    <div className="max-w-6xl">
      <header className="mb-6">
        <Link href="/admin/quotes" className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-v2-fg-subtle hover:text-v2-fg">
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="m15 18-6-6 6-6" /></svg>
          Teklifler
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-v2-fg">Teklif {quote.quote_no}</h1>
            <QuoteStatusBadge status={quote.status} expired={quote.expired} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={handlePrint} className="h-10 inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2M6 14h12v7H6z" /></svg>
              Yazdır / PDF
            </button>
            <button type="button" onClick={handleWhatsApp} className="h-10 inline-flex items-center gap-1.5 rounded-lg bg-[#1f9d55] px-4 text-sm font-semibold text-white hover:bg-[#188046]">
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3Z" /></svg>
              WhatsApp ile Gönder
            </button>
            {canConvert && !locked && quote.status !== "RED" && (
              <button type="button" disabled={busy} onClick={openConvert} className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-blue-300">
                Siparişe Dönüştür
              </button>
            )}
            {canEdit && !locked && (
              <Link href={`/admin/quotes/${quote.id}/edit`} className="h-10 inline-flex items-center rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Düzenle
              </Link>
            )}
            {canDelete && !locked && (
              <button type="button" disabled={busy} onClick={handleDelete} className="h-10 rounded-lg border border-red-200 px-4 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">
                Sil
              </button>
            )}
          </div>
        </div>
      </header>

      {locked && quote.order_id != null && (
        <div className="mb-6 rounded-xl border border-v2-line bg-v2-primary-soft px-5 py-4 text-sm text-v2-fg">
          Bu teklif {quote.converted_at ? formatDate(quote.converted_at) : ""} tarihinde siparişe dönüştürüldü:{" "}
          <Link href={`/admin/orders/${quote.order_id}`} className="font-semibold text-v2-link hover:underline">
            Sipariş {quote.custom_order_no || `#${quote.order_id}`}
          </Link>. Teklif artık değiştirilemez.
        </div>
      )}

      {canEdit && STATUS_ACTIONS[quote.status].length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-v2-line bg-v2-surface px-5 py-3 shadow-sm">
          <span className="mr-1 text-sm text-v2-fg-muted">Durumu işaretle:</span>
          {STATUS_ACTIONS[quote.status].map((a) => (
            <button
              key={a.to}
              type="button"
              disabled={busy}
              onClick={() => setStatus(a.to)}
              className="h-9 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {a.label}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <section className="rounded-xl border border-v2-line bg-v2-surface shadow-sm overflow-clip">
            <h2 className="border-b border-v2-line px-5 py-4 text-[15px] font-semibold text-v2-fg">
              Ürün ve Hizmetler <span className="ml-1 text-[13px] font-normal text-v2-fg-muted">Fiyatlar {quote.vat_mode === "dahil" ? "KDV dahil" : "KDV hariç"}</span>
            </h2>
            <StickyScrollX>
              <table className="w-full text-sm">
                <thead className="border-b border-v2-line bg-v2-muted/50 text-left text-v2-fg-muted">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Ürün / Hizmet</th>
                    {hasProductCols && <th className="px-4 py-2.5 font-medium whitespace-nowrap">Ebat / Marka</th>}
                    <th className="px-4 py-2.5 font-medium text-right">Adet</th>
                    <th className="px-4 py-2.5 font-medium text-right whitespace-nowrap">Birim Fiyat</th>
                    <th className="px-4 py-2.5 font-medium text-right">Tutar</th>
                    {quote.can_view_cost && <th className="px-4 py-2.5 font-medium text-right">Maliyet</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-v2-line">
                  {quote.lines.map((l) => (
                    <tr key={l.id}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-v2-fg">{l.service_name}</div>
                        {l.stock_code && <div className="text-xs text-v2-fg-muted">{l.stock_code}{l.supplier ? ` · ${l.supplier}` : ""}</div>}
                      </td>
                      {hasProductCols && (
                        <td className="px-4 py-3 text-v2-fg-muted">
                          {[l.size_desc, l.brand, l.model_name].filter(Boolean).join(" · ") || "—"}
                        </td>
                      )}
                      <td className="px-4 py-3 text-right tabular-nums">{l.quantity}</td>
                      <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">{formatCurrency(l.unit_price)}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums whitespace-nowrap">{formatCurrency(l.line_total)}</td>
                      {quote.can_view_cost && (
                        <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap text-v2-fg-muted">{l.cost_total != null ? formatCurrency(l.cost_total) : "—"}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </StickyScrollX>
          </section>

          {quote.notes && (
            <section className="rounded-xl border border-v2-line bg-v2-surface shadow-sm p-5">
              <h2 className="mb-2 text-[15px] font-semibold text-v2-fg">Notlar</h2>
              <p className="whitespace-pre-wrap text-sm text-v2-fg">{quote.notes}</p>
            </section>
          )}
        </div>

        <aside className="flex flex-col gap-6">
          <section className="rounded-xl border border-v2-line bg-v2-surface shadow-sm p-5">
            <dl className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-v2-fg-muted">Ara Toplam</dt><dd className="tabular-nums">{formatCurrency(quote.totals.net)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-v2-fg-muted">KDV %{quote.vat_rate}</dt><dd className="tabular-nums">{formatCurrency(quote.totals.vat)}</dd></div>
              <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-v2-line pt-3">
                <dt className="font-semibold text-v2-fg">Genel Toplam</dt>
                <dd className="text-xl font-bold tabular-nums text-v2-fg">{formatCurrency(quote.totals.total)}</dd>
              </div>
              {quote.can_view_cost && (
                <div className="flex justify-between gap-3">
                  <dt className="text-v2-fg-muted">Kâr</dt>
                  {costMissing ? (
                    <dd className="text-v2-fg-muted" title="Bazı ürün satırlarının maliyeti girilmemiş">—</dd>
                  ) : (
                    <dd className={`font-semibold tabular-nums ${quote.totals.total - totalCost >= 0 ? "text-v2-success-fg" : "text-v2-danger-fg"}`}>{formatCurrency(quote.totals.total - totalCost)}</dd>
                  )}
                </div>
              )}
            </dl>
          </section>

          <section className="rounded-xl border border-v2-line bg-v2-surface shadow-sm p-5">
            <dl className="flex flex-col gap-3 text-sm">
              <div><dt className="text-xs text-v2-fg-muted">Müşteri</dt><dd className="font-medium text-v2-fg">{quote.customer_name || "—"}</dd></div>
              {quote.customer_phone && <div><dt className="text-xs text-v2-fg-muted">Telefon</dt><dd><a href={`tel:${quote.customer_phone}`} className="text-v2-link">{quote.customer_phone}</a></dd></div>}
              {quote.plate && <div><dt className="text-xs text-v2-fg-muted">Plaka</dt><dd className="font-mono">{quote.plate}</dd></div>}
              <div>
                <dt className="text-xs text-v2-fg-muted">Geçerlilik</dt>
                <dd className={quote.expired ? "font-medium text-v2-warning-fg" : ""}>{formatISODate(quote.valid_until)}{quote.expired ? " — süresi doldu" : ""}</dd>
              </div>
              <div><dt className="text-xs text-v2-fg-muted">Oluşturan</dt><dd>{quote.created_by_name || "—"} · {formatDate(quote.created_at)}</dd></div>
            </dl>
          </section>
        </aside>
      </div>

      {showConvert && (
        <div ref={convertDialog} role="dialog" aria-modal="true" aria-label="Siparişe Dönüştür" className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-v2-surface p-6 shadow-xl">
            <h2 className="mb-1 text-xl font-bold text-v2-fg">Siparişe Dönüştür</h2>
            <p className="mb-4 text-sm text-v2-fg-muted">
              {quote.quote_no} · {quote.customer_name || quote.plate} · <span className="font-semibold text-v2-fg">{formatCurrency(quote.totals.total)}</span>
            </p>
            <ul className="mb-4 list-disc space-y-1 pl-5 text-sm text-v2-fg">
              <li>Teklifteki satırlarla <strong>Beklemede</strong> bir sipariş açılır; ödeme siparişten alınır.</li>
              {quote.lines.some((l) => l.product_id != null) && <li>Seçili partilerin stoğu şimdi düşülür.</li>}
              <li>Teklif kilitlenir, artık değiştirilemez.</li>
            </ul>
            {quote.expired && (
              <div className="mb-3 rounded-lg bg-v2-warning-bg px-3 py-2 text-sm text-v2-warning-fg">
                Bu teklifin geçerlilik süresi {formatISODate(quote.valid_until)} tarihinde doldu — fiyatların hâlâ geçerli olduğundan emin olun.
              </div>
            )}
            {stockShort.length > 0 && (
              <div className="mb-3 rounded-lg bg-v2-danger-bg px-3 py-2 text-sm text-v2-danger-fg">
                Stok yetersiz: {stockShort.map((x) => `${x.name} (gereken ${x.need}, kalan ${x.have})`).join(", ")}. Teklifi düzenleyip başka parti seçin.
              </div>
            )}
            {me?.plate_required !== false && !quote.plate && (
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">Araç Plakası <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={convertPlate}
                  onChange={(e) => setConvertPlate(e.target.value.replace(/\s+/g, ""))}
                  placeholder="34 ABC 123"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 font-mono uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
            {me?.custom_order_no_enabled && (
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">Sipariş No <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={convertOrderNo}
                  onChange={(e) => setConvertOrderNo(e.target.value)}
                  placeholder="Kendi sipariş numaranız"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
            <div className="mt-5 flex gap-3">
              <button type="button" onClick={() => setShowConvert(false)} className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg hover:bg-gray-50">
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleConvert}
                disabled={busy || stockShort.length > 0 || (me?.plate_required !== false && !quote.plate && !convertPlate.trim()) || (!!me?.custom_order_no_enabled && !convertOrderNo.trim())}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-2.5 rounded-lg transition-colors"
              >
                {busy ? "Dönüştürülüyor..." : "Siparişi Oluştur"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
