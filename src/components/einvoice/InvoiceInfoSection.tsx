"use client";

import { useState } from "react";
import { useToast } from "@/components/ToastProvider";
import { classifyTaxId, normalizeTaxId } from "@/lib/taxId";

// Müşterinin fatura bilgileri (e-Fatura modülü, docs/e-fatura-tasarim.md §8.6)
// — firma sayfasında görüntüle/düzenle. PATCH /api/customers/:id/invoice-info.
export interface InvoiceInfo {
  tax_no: string | null;
  tax_office: string | null;
  address: string | null;
  city: string | null;
  district: string | null;
  email: string | null;
}

const inputClass = "h-11 w-full rounded-lg border border-v2-line bg-v2-surface px-3 text-sm text-v2-fg focus:outline-none focus:ring-2 focus:ring-blue-500";

export function InvoiceInfoSection({ customerId, isCorporate, info, canEdit, onSaved }: {
  customerId: number;
  isCorporate: boolean;
  info: InvoiceInfo;
  canEdit: boolean;
  onSaved: (next: InvoiceInfo) => void;
}) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<InvoiceInfo>(info);
  const [saving, setSaving] = useState(false);
  const taxLabel = isCorporate ? "Vergi No (VKN / şahıs şirketinde TCKN)" : "TC Kimlik No";
  const taxNo = normalizeTaxId(form.tax_no);
  const taxInvalid = taxNo !== "" && !classifyTaxId(taxNo);

  function start() {
    setForm(info);
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    try {
      const r = await fetch(`/api/customers/${customerId}/invoice-info`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, tax_no: taxNo }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || "Fatura bilgileri kaydedilemedi.");
      onSaved(body as InvoiceInfo);
      setEditing(false);
      toast.success("Fatura bilgileri kaydedildi.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fatura bilgileri kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  const set = (k: keyof InvoiceInfo) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const rows: [string, string | null][] = [
    [taxLabel, info.tax_no],
    ...(isCorporate ? ([["Vergi Dairesi", info.tax_office]] as [string, string | null][]) : []),
    ["Adres", info.address],
    ["İl / İlçe", [info.city, info.district].filter(Boolean).join(" / ") || null],
    ["E-posta", info.email],
  ];

  return (
    <section aria-labelledby="fatura-bilgileri" className="mb-6 min-w-0 rounded-xl border border-v2-line bg-v2-surface shadow-sm">
      <div className="flex items-center justify-between border-b border-v2-line px-5 py-4">
        <h2 id="fatura-bilgileri" className="text-[15px] font-semibold text-v2-fg">Fatura Bilgileri</h2>
        {canEdit && !editing && (
          <button type="button" onClick={start} className="text-sm font-semibold text-v2-link hover:underline">Düzenle</button>
        )}
      </div>
      {editing ? (
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-v2-fg">{taxLabel}</span>
            <input value={form.tax_no ?? ""} onChange={set("tax_no")} inputMode="numeric" maxLength={14} className={inputClass} aria-invalid={taxInvalid} />
            {taxInvalid && <span className="mt-1 block text-xs text-red-600">Geçerli bir VKN (10 hane) ya da TC kimlik no (11 hane) girin.</span>}
          </label>
          {isCorporate && (
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-v2-fg">Vergi Dairesi</span>
              <input value={form.tax_office ?? ""} onChange={set("tax_office")} maxLength={100} className={inputClass} />
            </label>
          )}
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block font-medium text-v2-fg">Adres</span>
            <input value={form.address ?? ""} onChange={set("address")} maxLength={500} className={inputClass} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-v2-fg">İl</span>
            <input value={form.city ?? ""} onChange={set("city")} maxLength={50} className={inputClass} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-v2-fg">İlçe</span>
            <input value={form.district ?? ""} onChange={set("district")} maxLength={50} className={inputClass} />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block font-medium text-v2-fg">E-posta</span>
            <input type="email" value={form.email ?? ""} onChange={set("email")} maxLength={150} className={inputClass} />
          </label>
          <div className="flex gap-3 sm:col-span-2">
            <button type="button" onClick={() => setEditing(false)} className="h-11 flex-1 rounded-lg border border-v2-line font-medium text-v2-fg hover:bg-v2-muted">İptal</button>
            <button type="button" onClick={save} disabled={saving || taxInvalid} className="h-11 flex-1 rounded-lg bg-blue-600 font-semibold text-white hover:bg-blue-700 disabled:bg-blue-300">
              {saving ? "Kaydediliyor..." : "Kaydet"}
            </button>
          </div>
        </div>
      ) : (
        <dl className="grid gap-x-6 gap-y-3 p-5 text-sm sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs text-v2-fg-subtle">{label}</dt>
              <dd className="text-v2-fg [overflow-wrap:anywhere]">{value || "—"}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
