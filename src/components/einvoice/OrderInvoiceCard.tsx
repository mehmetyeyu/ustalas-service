"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAddon, usePermission } from "@/app/admin/AuthContext";
import { useToast } from "@/components/ToastProvider";
import { useConfirm } from "@/components/ConfirmProvider";
import { formatCurrency, formatDate } from "@/lib/format";
import { IssueInvoiceDialog } from "./IssueInvoiceDialog";

// Sipariş detayındaki fatura kartı (docs/e-fatura-tasarim.md §8.2). Fatura
// işlenirken durum ucunu 3 sn'de bir yoklar (sağlayıcıda webhook yok);
// 3 dakikada bitmezse yoklamayı bırakır — iş arka planda sürer, sayfa
// yeniden açılınca ya da günlük kontrolde tamamlanır.
interface InvoiceSummary {
  id: number;
  doc_type: "e_arsiv" | "e_fatura" | null;
  status: "HAZIRLANIYOR" | "ISLENIYOR" | "RESMILESTI" | "HATA" | "IPTAL" | "REDDEDILDI";
  issue_date: string;
  buyer_name: string;
  gib_invoice_no: string | null;
  gross_total: number | string;
  error_message: string | null;
  cancellable_until: string | null;
}

const POLL_MS = 3000;
const POLL_MAX_MS = 3 * 60 * 1000;
const OPEN = new Set(["HAZIRLANIYOR", "ISLENIYOR"]);

export const DOC_TYPE_LABELS = { e_arsiv: "e-Arşiv", e_fatura: "e-Fatura" } as const;
export const INVOICE_STATUS_LABELS: Record<InvoiceSummary["status"], string> = {
  HAZIRLANIYOR: "Hazırlanıyor",
  ISLENIYOR: "GİB'e gönderiliyor",
  RESMILESTI: "Resmileşti",
  HATA: "Hata",
  IPTAL: "İptal edildi",
  REDDEDILDI: "Alıcı reddetti",
};

export function OrderInvoiceCard({ orderId, orderDone, autoOpen, className }: {
  orderId: number;
  orderDone: boolean;
  autoOpen?: number;   // değiştikçe (ör. "Kapatınca fatura kes") pencere açılır
  className?: string;
}) {
  const enabled = useAddon("einvoice");
  const canView = usePermission("invoices.view");
  const canIssue = usePermission("invoices.issue");
  const canCancel = usePermission("invoices.cancel");
  const toast = useToast();
  const confirm = useConfirm();
  const [invoices, setInvoices] = useState<InvoiceSummary[] | null>(null);
  const [showIssue, setShowIssue] = useState(false);
  const [busy, setBusy] = useState(false);
  const pollStart = useRef<number | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/invoices?order_id=${orderId}&limit=10`, { cache: "no-store" });
    const d = await r.json().catch(() => ({}));
    setInvoices(r.ok && Array.isArray(d.items) ? d.items : []);
  }, [orderId]);

  useEffect(() => { if (enabled && canView) load(); }, [enabled, canView, load]);

  const current = invoices?.find((i) => i.status !== "IPTAL" && i.status !== "REDDEDILDI") ?? null;
  const past = invoices?.filter((i) => i !== current) ?? [];

  // İşlenen faturayı yokla.
  useEffect(() => {
    if (!current || !OPEN.has(current.status)) { pollStart.current = null; return; }
    pollStart.current ??= Date.now();
    if (Date.now() - pollStart.current > POLL_MAX_MS) return;
    const t = setTimeout(async () => {
      const r = await fetch(`/api/invoices/${current.id}/status`, { cache: "no-store" }).catch(() => null);
      const d = r ? await r.json().catch(() => ({})) : {};
      if (r?.ok && d.invoice) {
        setInvoices((list) => (list ?? []).map((i) => (i.id === d.invoice.id ? { ...i, ...d.invoice } : i)));
        if (d.invoice.status === "RESMILESTI") toast.success("Fatura resmileşti.");
      } else {
        setInvoices((list) => [...(list ?? [])]); // bir sonraki denemeyi tetikle
      }
    }, POLL_MS);
    return () => clearTimeout(t);
  }, [current, toast]);

  useEffect(() => {
    if (autoOpen && enabled && canIssue && orderDone && invoices && !current) setShowIssue(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnızca tetikleyici değişince
  }, [autoOpen, invoices === null]);

  async function action(path: "retry" | "cancel", message?: string) {
    if (message && !(await confirm({ message, variant: "danger" }))) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/invoices/${current!.id}/${path}`, { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "İşlem başarısız.");
      pollStart.current = null;
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "İşlem başarısız.");
    } finally {
      setBusy(false);
    }
  }

  // WhatsApp: imzalı 30 günlük PDF linkiyle hazır mesaj (/api/invoices/:id/share).
  // Sekme tıklama anında açılır — istek bittikten sonra açılsa tarayıcı
  // açılır pencere sayıp engelleyebilir.
  async function shareWhatsApp() {
    const w = window.open("about:blank", "_blank");
    setBusy(true);
    try {
      const r = await fetch(`/api/invoices/${current!.id}/share`, { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.whatsappUrl) throw new Error(d.error || "Paylaşım linki oluşturulamadı.");
      if (w) {
        w.opener = null;
        w.location.href = d.whatsappUrl;
      } else {
        window.location.href = d.whatsappUrl;
      }
    } catch (err) {
      w?.close();
      toast.error(err instanceof Error ? err.message : "Paylaşım linki oluşturulamadı.");
    } finally {
      setBusy(false);
    }
  }

  if (!enabled || !canView) return null;

  const cancellable = current?.status === "RESMILESTI" && current.doc_type === "e_arsiv" && !!current.cancellable_until && new Date(current.cancellable_until).getTime() > Date.now();
  const stalled = current && OPEN.has(current.status) && pollStart.current != null && Date.now() - pollStart.current > POLL_MAX_MS;
  const btn = "inline-flex h-9 items-center justify-center rounded-lg border border-v2-line bg-v2-surface px-3 text-sm font-medium text-v2-fg hover:bg-v2-muted disabled:opacity-50";

  return (
    <section aria-labelledby="fatura" className={className}>
      <div className="mb-3 flex items-center justify-between">
        <h2 id="fatura" className="text-[15px] font-semibold text-v2-fg">Fatura</h2>
        {current?.doc_type && <span className="rounded-md bg-v2-muted px-2 py-0.5 text-xs font-medium text-v2-fg">{DOC_TYPE_LABELS[current.doc_type]}</span>}
      </div>
      {invoices === null ? (
        <p className="text-sm text-v2-fg-muted">Yükleniyor...</p>
      ) : !current ? (
        <div className="flex flex-col gap-3 text-sm">
          <p className="text-v2-fg-muted">{orderDone ? "Bu siparişin resmi faturası yok." : "Fatura, sipariş kapatıldıktan sonra kesilebilir."}</p>
          {canIssue && orderDone && (
            <button type="button" onClick={() => setShowIssue(true)} className="h-10 w-full rounded-lg bg-v2-primary text-sm font-semibold text-white hover:bg-v2-primary-hover">
              Fatura Kes
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between"><span className="text-v2-fg-muted">Durum</span>
            <span className={`font-semibold ${current.status === "RESMILESTI" ? "text-v2-success-fg" : current.status === "HATA" ? "text-red-600" : "text-v2-warning-fg"}`}>
              {INVOICE_STATUS_LABELS[current.status]}{OPEN.has(current.status) && !stalled ? "…" : ""}
            </span>
          </div>
          {current.gib_invoice_no && <div className="flex justify-between"><span className="text-v2-fg-muted">Fatura No</span><span className="font-mono text-v2-fg">{current.gib_invoice_no}</span></div>}
          <div className="flex justify-between"><span className="text-v2-fg-muted">Tarih</span><span className="text-v2-fg">{formatDate(current.issue_date).slice(0, 10)}</span></div>
          <div className="flex justify-between"><span className="text-v2-fg-muted">Alıcı</span><span className="text-right text-v2-fg [overflow-wrap:anywhere]">{current.buyer_name}</span></div>
          <div className="flex justify-between"><span className="text-v2-fg-muted">Tutar</span><span className="font-semibold tabular-nums text-v2-fg">{formatCurrency(Number(current.gross_total))}</span></div>
          {current.error_message && <p className="rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-700 [overflow-wrap:anywhere]">{current.error_message}</p>}
          {stalled && <p className="text-xs text-v2-fg-muted">İşlem uzun sürüyor; arka planda devam ediyor. Sayfayı daha sonra yenileyin.</p>}
          <div className="mt-1 flex flex-wrap gap-2">
            {current.status === "RESMILESTI" && (
              <>
                <a href={`/api/invoices/${current.id}/pdf`} target="_blank" rel="noopener" className={btn}>PDF Aç</a>
                <a href={`/api/invoices/${current.id}/pdf?download=1`} className={btn}>İndir</a>
                <button type="button" disabled={busy} onClick={shareWhatsApp} className={btn}>WhatsApp</button>
              </>
            )}
            {current.status === "HATA" && canIssue && <button type="button" disabled={busy} onClick={() => action("retry")} className={btn}>Tekrar Dene</button>}
            {current.status === "HATA" && canCancel && (
              <button type="button" disabled={busy} onClick={() => action("cancel", "Bu faturadan vazgeçilsin mi? Resmileşmemiş taslak silinir, sipariş yeniden faturalanabilir.")} className={`${btn} text-red-600`}>Vazgeç</button>
            )}
            {cancellable && canCancel && (
              <button type="button" disabled={busy} onClick={() => action("cancel", `e-Arşiv faturası iptal edilsin mi? İptal ${formatDate(current.cancellable_until!)} tarihine kadar yapılabilir; sipariş yeniden faturalanabilir hale gelir.`)} className={`${btn} text-red-600`}>
                Faturayı İptal Et
              </button>
            )}
          </div>
        </div>
      )}
      {past.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1 border-t border-v2-line pt-2 text-xs text-v2-fg-muted">
          {past.map((p) => (
            <li key={p.id} className="flex justify-between"><span>{p.gib_invoice_no ?? `#${p.id}`}</span><span>{INVOICE_STATUS_LABELS[p.status]}</span></li>
          ))}
        </ul>
      )}
      {showIssue && (
        <IssueInvoiceDialog
          orderIds={[orderId]}
          onClose={() => setShowIssue(false)}
          onIssued={() => { setShowIssue(false); pollStart.current = null; load(); }}
        />
      )}
    </section>
  );
}
