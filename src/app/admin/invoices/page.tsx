"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAddon, useAuth, useViewGuard } from "../AuthContext";
import { useToast } from "@/components/ToastProvider";
import { StickyScrollX } from "@/components/StickyScrollX";
import { DOC_TYPE_LABELS, INVOICE_STATUS_LABELS } from "@/components/einvoice/OrderInvoiceCard";
import { formatCurrency } from "@/lib/format";

// Faturalar (e-Fatura ek özelliği, docs/e-fatura-tasarim.md §8.5). Hatalı
// faturalar üstte — tekrar denenmeyi bekliyorlar. Fatura kesme sipariş
// detayından yapılır; bu liste takip içindir.
interface InvoiceListRow {
  id: number;
  doc_type: keyof typeof DOC_TYPE_LABELS | null;
  status: keyof typeof INVOICE_STATUS_LABELS;
  issue_date: string;
  buyer_name: string;
  gib_invoice_no: string | null;
  gross_total: number;
  plate_note: string | null;
  error_message: string | null;
  order_ids: number[];
}

const TABS = [
  { key: "", label: "Tümü" },
  { key: "RESMILESTI", label: "Resmileşen" },
  { key: "ISLENIYOR", label: "İşleniyor" },
  { key: "HATA", label: "Hatalı" },
  { key: "IPTAL", label: "İptal" },
];
const LIMIT = 25;

const STATUS_TONE: Record<InvoiceListRow["status"], string> = {
  HAZIRLANIYOR: "bg-v2-warning-bg text-v2-warning-fg",
  ISLENIYOR: "bg-v2-warning-bg text-v2-warning-fg",
  RESMILESTI: "bg-v2-success-bg text-v2-success-fg",
  HATA: "bg-red-50 text-red-700",
  IPTAL: "bg-v2-muted text-v2-fg-muted",
  REDDEDILDI: "bg-red-50 text-red-700",
};

function day(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

export default function InvoicesPage() {
  const allowed = useViewGuard("invoices");
  const enabled = useAddon("einvoice");
  const { loading: authLoading } = useAuth();
  const toast = useToast();
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<InvoiceListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    if (status) params.set("status", status);
    if (debounced) params.set("q", debounced);
    fetch(`/api/invoices?${params}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (!cancelled) { setItems(d.items); setTotal(d.total); } })
      .catch(() => { if (!cancelled) toast.error("Faturalar yüklenemedi."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [enabled, status, debounced, page, toast]);

  if (!allowed) return null;
  if (!authLoading && !enabled) {
    return (
      <div className="rounded-xl border border-v2-line bg-v2-surface p-10 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-v2-fg">e-Fatura / e-Arşiv</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-v2-fg-muted">
          Siparişten tek tuşla resmi fatura kesmek için e-Fatura modülü gerekir. Modül aylık/yıllık aboneliğe ek, tek seferlik ücretle açılır.
        </p>
      </div>
    );
  }

  const pageCount = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-v2-fg">Faturalar</h1>
        <p className="mt-1 text-sm text-v2-fg-muted">Fatura, sipariş detayındaki &ldquo;Fatura Kes&rdquo; ile kesilir.</p>
      </div>

      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-v2-line bg-v2-surface p-4 shadow-sm">
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={status === t.key}
              onClick={() => { setStatus(t.key); setPage(1); }}
              className={`h-9 shrink-0 whitespace-nowrap rounded-lg px-3 text-sm font-medium ${status === t.key ? "bg-v2-primary text-white" : "text-v2-fg-muted hover:bg-v2-muted"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Alıcı, fatura no veya plaka ara..."
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 sm:w-96"
        />
      </div>

      {loading && items.length === 0 ? (
        <div className="py-12 text-center text-v2-fg-muted">Yükleniyor...</div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-v2-line bg-v2-surface p-12 text-center text-v2-fg-muted shadow-sm">
          {status || debounced ? "Bu filtreyle eşleşen fatura yok." : "Henüz fatura kesilmedi."}
        </div>
      ) : (
        <div className={`overflow-clip rounded-xl border border-v2-line bg-v2-surface shadow-sm ${loading ? "opacity-60" : ""}`}>
          <StickyScrollX>
            <table className="w-full text-sm">
              <thead className="border-b border-v2-line bg-v2-muted/50">
                <tr className="text-left text-v2-fg-muted">
                  <th className="whitespace-nowrap px-4 py-3 font-medium">Fatura No</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">Alıcı</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">Tarih</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">Tür</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right font-medium">Tutar</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">Durum</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">Sipariş</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-v2-line">
                {items.map((inv) => (
                  <tr key={inv.id} className="align-top hover:bg-v2-muted/60">
                    <td className="whitespace-nowrap px-4 py-3">
                      {inv.status === "RESMILESTI" ? (
                        <a href={`/api/invoices/${inv.id}/pdf`} target="_blank" rel="noopener" className="font-mono font-semibold text-v2-link hover:underline">{inv.gib_invoice_no ?? `#${inv.id}`}</a>
                      ) : (
                        <span className="font-mono text-v2-fg-muted">{inv.gib_invoice_no ?? "—"}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-v2-fg">{inv.buyer_name}</div>
                      {inv.plate_note && <div className="text-xs text-v2-fg-muted">{inv.plate_note}</div>}
                      {inv.status === "HATA" && inv.error_message && <div className="mt-1 max-w-xs text-xs text-red-600 [overflow-wrap:anywhere]">{inv.error_message}</div>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-v2-fg-muted">{day(inv.issue_date)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-v2-fg-muted">{inv.doc_type ? DOC_TYPE_LABELS[inv.doc_type] : "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-v2-fg">{formatCurrency(inv.gross_total)}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_TONE[inv.status]}`}>{INVOICE_STATUS_LABELS[inv.status]}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {inv.order_ids.slice(0, 3).map((id) => (
                        <Link key={id} prefetch={false} href={`/admin/orders/${id}`} className="mr-2 text-v2-link hover:underline">#{id}</Link>
                      ))}
                      {inv.order_ids.length > 3 && <span className="text-xs text-v2-fg-muted">+{inv.order_ids.length - 3}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </StickyScrollX>
        </div>
      )}

      {pageCount > 1 && (
        <div className="mt-4 flex items-center justify-end gap-2 text-sm">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="h-9 rounded-lg border border-gray-300 px-3 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40">Önceki</button>
          <span className="tabular-nums text-v2-fg-muted">{page} / {pageCount}</span>
          <button type="button" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)} className="h-9 rounded-lg border border-gray-300 px-3 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40">Sonraki</button>
        </div>
      )}
    </div>
  );
}
