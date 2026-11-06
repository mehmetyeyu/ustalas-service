"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAddon, usePermission } from "@/app/admin/AuthContext";
import { POLL_MAX_MS, pollDelay } from "@/lib/einvoice/poll";
import { formatCurrency } from "@/lib/format";
import { IssueInvoiceDialog } from "./IssueInvoiceDialog";
import { DOC_TYPE_LABELS, INVOICE_STATUS_LABELS } from "./OrderInvoiceCard";

// Cari ekstredeki e-Fatura bölümü — filo aylık faturası (tasarım §8.2 madde
// 7): seçili ayın faturalanmamış tamamlanmış siparişleri tek faturada
// ("Bu Ayı Faturala"; satırlarda plaka ve tarih, bkz. buildDraft) ve o ayın
// siparişlerine kesilmiş faturalar. İşlenen fatura varken yoklar (sipariş
// kartındaki gibi, src/lib/einvoice/poll.ts).
interface PeriodInvoice {
  id: number;
  status: keyof typeof INVOICE_STATUS_LABELS;
  doc_type: keyof typeof DOC_TYPE_LABELS | null;
  gib_invoice_no: string | null;
  gross_total: string | number;
  issue_date: string;
  error_message: string | null;
  order_count: number;
}
interface PeriodData {
  uninvoiced: { order_ids: number[]; count: number; total: number };
  invoices: PeriodInvoice[];
}

// buildDraft sınırı.
const MAX_ORDERS = 100;

export function PeriodInvoiceSection({ customerId, month, monthLabel }: { customerId: string; month: string; monthLabel: string }) {
  const enabled = useAddon("einvoice");
  const canView = usePermission("invoices.view");
  const canIssue = usePermission("invoices.issue");
  const [data, setData] = useState<PeriodData | null>(null);
  const [showIssue, setShowIssue] = useState(false);
  const pollStart = useRef<number | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/invoices/period?customer_id=${customerId}&month=${month}`, { cache: "no-store" }).catch(() => null);
    const d = r ? await r.json().catch(() => null) : null;
    setData(r?.ok && d ? d : { uninvoiced: { order_ids: [], count: 0, total: 0 }, invoices: [] });
  }, [customerId, month]);

  useEffect(() => { if (enabled && canView) { setData(null); load(); } }, [enabled, canView, load]);

  const processing = data?.invoices.some((i) => i.status === "HAZIRLANIYOR" || i.status === "ISLENIYOR") ?? false;
  useEffect(() => {
    if (!processing) { pollStart.current = null; return; }
    pollStart.current ??= Date.now();
    if (Date.now() - pollStart.current > POLL_MAX_MS) return;
    // Durum ucu faturayı ilerletir; liste sonra tazelenir.
    const open = data!.invoices.filter((i) => i.status === "HAZIRLANIYOR" || i.status === "ISLENIYOR");
    const t = setTimeout(async () => {
      await Promise.all(open.map((i) => fetch(`/api/invoices/${i.id}/status`, { cache: "no-store" }).catch(() => null)));
      await load();
    }, pollDelay(pollStart.current));
    return () => clearTimeout(t);
  }, [processing, data, load]);

  if (!enabled || !canView) return null;

  const u = data?.uninvoiced;
  const tooMany = (u?.count ?? 0) > MAX_ORDERS;
  return (
    <section aria-labelledby="ekstre-efatura" className="mb-6 rounded-xl border border-v2-line bg-v2-surface p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="ekstre-efatura" className="text-[15px] font-semibold text-v2-fg">e-Fatura</h2>
          <p className="mt-0.5 text-sm text-v2-fg-muted">
            {!data ? "Yükleniyor..." : u!.count === 0
              ? `${monthLabel} için faturalanmamış tamamlanmış sipariş yok.`
              : `${monthLabel}: faturalanmamış ${u!.count} sipariş · ${formatCurrency(u!.total)}`}
          </p>
          {tooMany && <p className="mt-1 text-xs text-red-600">Bir faturada en fazla {MAX_ORDERS} sipariş olabilir; siparişleri sipariş detayından ayrı ayrı faturalayın.</p>}
        </div>
        {canIssue && (
          <button
            type="button"
            onClick={() => setShowIssue(true)}
            disabled={!u || u.count === 0 || tooMany}
            className="h-10 shrink-0 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Bu Ayı Faturala
          </button>
        )}
      </div>
      {data && data.invoices.length > 0 && (
        <ul className="mt-4 flex flex-col divide-y divide-v2-line border-t border-v2-line text-sm">
          {data.invoices.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
              <span className="text-v2-fg">
                <span className="font-mono">{i.gib_invoice_no ?? `#${i.id}`}</span>
                <span className="text-v2-fg-muted"> · {i.doc_type ? DOC_TYPE_LABELS[i.doc_type] : "Fatura"} · {i.order_count} sipariş</span>
              </span>
              <span className="flex items-center gap-3">
                <span className="tabular-nums font-semibold text-v2-fg">{formatCurrency(Number(i.gross_total))}</span>
                <span className={i.status === "HATA" ? "text-red-600" : i.status === "RESMILESTI" ? "text-green-700" : "text-v2-fg-muted"}>{INVOICE_STATUS_LABELS[i.status]}</span>
                {i.status === "RESMILESTI" && <a href={`/api/invoices/${i.id}/pdf`} target="_blank" rel="noopener" className="font-medium text-v2-link hover:underline">PDF</a>}
              </span>
              {i.status === "HATA" && i.error_message && <span className="w-full text-xs text-red-700 [overflow-wrap:anywhere]">{i.error_message} — <Link prefetch={false} href="/admin/invoices" className="underline">Faturalar</Link>&apos;dan tekrar deneyin.</span>}
            </li>
          ))}
        </ul>
      )}
      {showIssue && u && (
        <IssueInvoiceDialog
          orderIds={u.order_ids}
          onClose={() => setShowIssue(false)}
          onIssued={() => { setShowIssue(false); pollStart.current = null; load(); }}
        />
      )}
    </section>
  );
}
