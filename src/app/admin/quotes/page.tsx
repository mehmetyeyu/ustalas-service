"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useViewGuard, usePermission } from "../AuthContext";
import { useToast } from "@/components/ToastProvider";
import { StickyScrollX } from "@/components/StickyScrollX";
import QuoteStatusBadge from "@/components/quote/QuoteStatusBadge";
import { formatCurrency, formatDate } from "@/lib/format";
import { formatISODate, type QuoteStatus } from "@/lib/quotes";

interface QuoteRow {
  id: number;
  quote_no: string;
  customer_name: string | null;
  customer_phone: string | null;
  plate: string | null;
  status: QuoteStatus;
  valid_until: string;
  total_amount: number;
  order_id: number | null;
  custom_order_no: string | null;
  created_at: string;
  expired: boolean;
}

type Counts = Record<"all" | "acik" | "suresi_doldu" | "KABUL" | "RED" | "SIPARIS", number>;

const TABS: { key: string; label: string; countKey: keyof Counts }[] = [
  { key: "", label: "Tümü", countKey: "all" },
  { key: "acik", label: "Açık", countKey: "acik" },
  { key: "suresi_doldu", label: "Süresi Doldu", countKey: "suresi_doldu" },
  { key: "KABUL", label: "Kabul", countKey: "KABUL" },
  { key: "SIPARIS", label: "Siparişe Dönüştü", countKey: "SIPARIS" },
  { key: "RED", label: "Red", countKey: "RED" },
];

const LIMIT = 25;

export default function QuotesPage() {
  const allowed = useViewGuard("quotes");
  const canCreate = usePermission("quotes.create");
  const toast = useToast();
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<QuoteRow[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    if (status) params.set("status", status);
    if (debouncedSearch) params.set("q", debouncedSearch);
    fetch(`/api/quotes?${params}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        if (cancelled) return;
        setItems(data.items);
        setCounts(data.counts);
        setTotal(data.total);
      })
      .catch(() => { if (!cancelled) toast.error("Teklifler yüklenemedi."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [status, debouncedSearch, page, toast]);

  if (!allowed) return null;

  const pageCount = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-v2-fg">Teklifler</h1>
        {canCreate && (
          <Link
            href="/admin/quotes/new"
            className="self-start sm:self-auto bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors"
          >
            + Yeni Teklif
          </Link>
        )}
      </div>

      <div className="rounded-xl border border-v2-line bg-v2-surface shadow-sm p-4 mb-4 flex flex-col gap-3">
        <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-0.5" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={status === t.key}
              onClick={() => { setStatus(t.key); setPage(1); }}
              className={`shrink-0 h-9 rounded-lg px-3 text-sm font-medium whitespace-nowrap ${status === t.key ? "bg-v2-primary text-white" : "text-v2-fg-muted hover:bg-v2-muted"}`}
            >
              {t.label}
              {counts && <span className="ml-1.5 tabular-nums opacity-75">{counts[t.countKey]}</span>}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Teklif no, müşteri, plaka veya telefon ara..."
          className="w-full sm:w-96 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {loading && items.length === 0 ? (
        <div className="text-center text-v2-fg-muted py-12">Yükleniyor...</div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-v2-line bg-v2-surface shadow-sm p-12 text-center text-v2-fg-muted">
          {counts?.all === 0 && !debouncedSearch ? (
            <>
              <p className="font-medium text-v2-fg">Henüz teklif yok.</p>
              <p className="mt-1 text-sm">Müşteriye fiyat vermek için yeni bir teklif hazırlayın; kabul edilince tek tıkla siparişe dönüşür.</p>
            </>
          ) : "Bu filtreyle eşleşen teklif yok."}
        </div>
      ) : (
        <div className={`rounded-xl border border-v2-line bg-v2-surface shadow-sm overflow-clip ${loading ? "opacity-60" : ""}`}>
          <StickyScrollX>
            <table className="w-full text-sm">
              <thead className="border-b border-v2-line bg-v2-muted/50">
                <tr className="text-left text-v2-fg-muted">
                  <th className="px-4 py-3 font-medium whitespace-nowrap">Teklif No</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap">Müşteri</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap">Tarih</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap">Geçerlilik</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap text-right">Tutar</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap">Durum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-v2-line">
                {items.map((q) => (
                  <tr
                    key={q.id}
                    onClick={() => router.push(`/admin/quotes/${q.id}`)}
                    className="cursor-pointer hover:bg-v2-muted/60"
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Link href={`/admin/quotes/${q.id}`} onClick={(e) => e.stopPropagation()} className="font-semibold text-v2-link hover:underline">
                        {q.quote_no}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-v2-fg">{q.customer_name || "—"}</div>
                      {q.plate && <div className="font-mono text-xs text-v2-fg-muted">{q.plate}</div>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-v2-fg-muted">{formatDate(q.created_at).slice(0, 10)}</td>
                    <td className={`px-4 py-3 whitespace-nowrap ${q.expired ? "text-v2-warning-fg font-medium" : "text-v2-fg-muted"}`}>{formatISODate(q.valid_until)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-right font-semibold tabular-nums text-v2-fg">{formatCurrency(q.total_amount)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <QuoteStatusBadge status={q.status} expired={q.expired} />
                      {q.order_id != null && (
                        <span className="ml-2 text-xs text-v2-fg-muted">→ {q.custom_order_no || `#${q.order_id}`}</span>
                      )}
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
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="h-9 rounded-lg border border-gray-300 px-3 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            Önceki
          </button>
          <span className="tabular-nums text-v2-fg-muted">{page} / {pageCount}</span>
          <button
            type="button"
            disabled={page >= pageCount}
            onClick={() => setPage((p) => p + 1)}
            className="h-9 rounded-lg border border-gray-300 px-3 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            Sonraki
          </button>
        </div>
      )}
    </div>
  );
}
