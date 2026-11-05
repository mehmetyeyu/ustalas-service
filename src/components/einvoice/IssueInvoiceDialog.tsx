"use client";

import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/ToastProvider";
import { useDialog } from "@/lib/useDialog";
import { formatCurrency } from "@/lib/format";
import { classifyTaxId, normalizeTaxId } from "@/lib/taxId";

// "Fatura Kes" penceresi (docs/e-fatura-tasarim.md §5.1, §8.2). Alıcı bilgileri
// müşteri kaydından gelir; eksikler burada tamamlanır ve müşteri kaydına da
// yazılır. Bireyselde "TC vermek istemiyor" seçeneği (kullanıcı kararı
// 2026-10-30) GİB yer tutucusunu gönderir ve kayda yazılmaz.
interface DraftLine { description: string; quantity: number; vatRate: number; grossAfterDiscount: number }
interface Draft {
  customer: { id: number; is_corporate: boolean } | null;
  buyer: { name: string; tax_number: string; tax_office: string; address: string; city: string; district: string; email: string; phone: string };
  lines: DraftLine[];
  totals: { net: number; vat: number; gross: number; discount: number };
  plate_note: string | null;
  company_place: { city: string | null; district: string | null };
}

export interface IssuedInvoice { id: number; status: string }

const input = "h-11 w-full rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

function istanbulToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
}

export function IssueInvoiceDialog({ orderIds, onClose, onIssued }: {
  orderIds: number[];
  onClose: () => void;
  onIssued: (invoice: IssuedInvoice) => void;
}) {
  const toast = useToast();
  const dialogRef = useDialog(onClose);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<Draft["buyer"] | null>(null);
  const [anonymous, setAnonymous] = useState(false);
  const [issueDate, setIssueDate] = useState(istanbulToday());
  const [submitting, setSubmitting] = useState(false);

  const idsKey = orderIds.join(",");
  useEffect(() => {
    fetch(`/api/invoices/draft?order_ids=${idsKey}`, { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "Fatura bilgileri yüklenemedi.");
        setDraft(d);
        setForm(d.buyer);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Fatura bilgileri yüklenemedi."));
  }, [idsKey]);

  const taxNo = normalizeTaxId(form?.tax_number);
  const taxKind = classifyTaxId(taxNo);
  // Kurumsal: müşteri kurumsal işaretli ya da 10 haneli VKN yazılmış.
  const corporate = !anonymous && (taxKind === "vkn" || (!!draft?.customer?.is_corporate && taxKind !== "tckn"));
  const minDate = useMemo(() => {
    const d = new Date(`${istanbulToday()}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 7);
    return d.toISOString().slice(0, 10);
  }, []);

  const problem = !form ? null
    : !form.name.trim() ? "Alıcı adı zorunlu."
    : !anonymous && !taxKind ? (taxNo ? "Vergi no / TC kimlik no geçerli değil." : corporate ? "Vergi no zorunlu." : "TC kimlik no zorunlu (ya da 'TC vermek istemiyor'u işaretleyin).")
    : corporate && !form.tax_office.trim() ? "Vergi dairesi zorunlu."
    : corporate && !form.address.trim() ? "Adres zorunlu."
    : !(form.city.trim() || draft?.company_place.city) || !(form.district.trim() || draft?.company_place.district) ? "İl ve ilçe zorunlu."
    : null;

  async function submit() {
    if (!form || problem) return;
    setSubmitting(true);
    try {
      const r = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_ids: orderIds, issue_date: issueDate, buyer: { ...form, tax_number: anonymous ? "" : taxNo, anonymous } }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Fatura kesilemedi.");
      onIssued(d.invoice);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fatura kesilemedi.");
    } finally {
      setSubmitting(false);
    }
  }

  const set = (k: keyof Draft["buyer"]) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => (f ? { ...f, [k]: e.target.value } : f));

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Fatura Kes" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="text-xl font-bold text-gray-800">Fatura Kes</h2>
          <p className="mt-0.5 text-xs text-gray-500">Müşteri e-Fatura mükellefiyse e-Fatura, değilse e-Arşiv kesilir — sistem kendisi sorgular.</p>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loadError ? (
            <p className="text-sm text-red-600">{loadError}</p>
          ) : !draft || !form ? (
            <p className="text-sm text-gray-400">Yükleniyor...</p>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm sm:col-span-2">
                  <span className="mb-1 block font-medium text-gray-700">{corporate ? "Unvan" : "Ad Soyad"}</span>
                  <input value={form.name} onChange={set("name")} maxLength={200} className={input} />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-gray-700">{corporate ? "Vergi No" : "TC Kimlik No"}</span>
                  <input value={anonymous ? "" : form.tax_number} onChange={set("tax_number")} disabled={anonymous} inputMode="numeric" maxLength={14} className={`${input} disabled:bg-gray-100`} />
                </label>
                {corporate ? (
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium text-gray-700">Vergi Dairesi</span>
                    <input value={form.tax_office} onChange={set("tax_office")} maxLength={100} className={input} />
                  </label>
                ) : (
                  <label className="flex items-center gap-2 self-end pb-3 text-sm text-gray-700">
                    <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} className="h-4 w-4 accent-blue-600" />
                    TC vermek istemiyor
                  </label>
                )}
                <label className="block text-sm sm:col-span-2">
                  <span className="mb-1 block font-medium text-gray-700">Adres {corporate ? "" : <span className="font-normal text-gray-400">(isteğe bağlı)</span>}</span>
                  <input value={form.address} onChange={set("address")} maxLength={500} className={input} />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-gray-700">İl</span>
                  <input value={form.city} onChange={set("city")} maxLength={50} placeholder={draft.company_place.city ?? ""} className={input} />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-gray-700">İlçe</span>
                  <input value={form.district} onChange={set("district")} maxLength={50} placeholder={draft.company_place.district ?? ""} className={input} />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-gray-700">E-posta <span className="font-normal text-gray-400">(isteğe bağlı)</span></span>
                  <input type="email" value={form.email} onChange={set("email")} maxLength={150} className={input} />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-gray-700">Fatura Tarihi</span>
                  <input type="date" value={issueDate} min={minDate} max={istanbulToday()} onChange={(e) => setIssueDate(e.target.value)} className={input} />
                </label>
              </div>
              {!corporate && (form.city.trim() === "" || form.district.trim() === "") && draft.company_place.city && (
                <p className="-mt-2 text-xs text-gray-400">İl/ilçe boş bırakılırsa firmanızın il/ilçesi ({draft.company_place.city}{draft.company_place.district ? ` / ${draft.company_place.district}` : ""}) yazılır.</p>
              )}

              <div className="rounded-lg border border-gray-200">
                <ul className="divide-y divide-gray-100 text-sm">
                  {draft.lines.map((l, i) => (
                    <li key={i} className="flex justify-between gap-3 px-3 py-2">
                      <span className="min-w-0 text-gray-700 [overflow-wrap:anywhere]">{l.quantity > 1 ? `${l.quantity} × ` : ""}{l.description} <span className="text-xs text-gray-400">· KDV %{l.vatRate}</span></span>
                      <span className="shrink-0 tabular-nums text-gray-800">{formatCurrency(l.grossAfterDiscount)}</span>
                    </li>
                  ))}
                </ul>
                <dl className="space-y-1 border-t border-gray-200 bg-gray-50 px-3 py-2 text-sm">
                  {draft.totals.discount > 0 && <div className="flex justify-between text-gray-500"><dt>İndirim (satırlara dağıtıldı)</dt><dd className="tabular-nums">{formatCurrency(draft.totals.discount)}</dd></div>}
                  <div className="flex justify-between text-gray-500"><dt>KDV Hariç</dt><dd className="tabular-nums">{formatCurrency(draft.totals.net)}</dd></div>
                  <div className="flex justify-between text-gray-500"><dt>KDV</dt><dd className="tabular-nums">{formatCurrency(draft.totals.vat)}</dd></div>
                  <div className="flex justify-between font-semibold text-gray-800"><dt>Genel Toplam</dt><dd className="tabular-nums">{formatCurrency(draft.totals.gross)}</dd></div>
                </dl>
              </div>
              {draft.plate_note && <p className="text-xs text-gray-500">Fatura notu: {draft.plate_note}</p>}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2 border-t border-gray-100 px-6 py-4">
          {problem && <p className="text-xs text-red-600">{problem}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-gray-300 py-2.5 font-medium text-gray-700 hover:bg-gray-50">Vazgeç</button>
            <button type="button" onClick={submit} disabled={!draft || !!problem || submitting} className="flex-1 rounded-lg bg-blue-600 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:bg-blue-300">
              {submitting ? "Kesiliyor..." : "Faturayı Kes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
