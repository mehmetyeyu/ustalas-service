"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useDialog } from "@/lib/useDialog";
import { useMe, useServices, invalidateAfter } from "@/lib/queries";
import { useToast } from "@/components/ToastProvider";
import { useConfirm } from "@/components/ConfirmProvider";
import { TRNumberInput } from "@/components/TRNumberInput";
import { formatPlate } from "@/lib/plate";
import { formatCurrency } from "@/lib/format";
import { todayIstanbul } from "@/lib/quotes";
import { oppositeMevsim } from "@/lib/seasonChange";

// Toplu mevsim değişimi penceresi (firma sayfası) — POST
// /api/customers/[id]/season-change. Her satır, araçtan çıkan lastiğin
// bilgileri: depodakinden kopyalanır, mevsim tersine çevrilir; satırda
// düzeltilebilir. İsteğe bağlı her araç için sipariş açılır.

export interface SeasonVehicle {
  id: number;
  plate: string;
  active_storage: {
    id: number; depo_no: number | null; mevsim: string | null; adet: number | null;
    ebat: string | null; marka: string | null; model_name: string | null;
  } | null;
}

interface Row {
  storage_id: number;
  plate: string;
  depo_no: number | null;
  stored: string;
  selected: boolean;
  mevsim: string;
  ebat: string;
  marka: string;
  adet: string;
  dis_derinligi: string;
  custom_order_no: string;
}

const MEVSIM_OPTIONS = ["Kışlık", "Yazlık", "Dört Mevsim"];
const input = "w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

export function BulkSeasonChangeDialog({
  customerId, customerName, vehicles, onClose, onDone,
}: {
  customerId: number;
  customerName: string;
  vehicles: SeasonVehicle[];
  onClose: () => void;
  onDone: () => void;
}) {
  const dialogRef = useDialog(onClose);
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const customOrderNoEnabled = !!useMe().data?.custom_order_no_enabled;
  const servicesData = useServices().data;
  const [rows, setRows] = useState<Row[]>(() =>
    vehicles.filter((v) => v.active_storage).map((v) => {
      const s = v.active_storage!;
      return {
        storage_id: s.id,
        plate: v.plate,
        depo_no: s.depo_no,
        stored: [s.adet ? `${s.adet} ×` : null, s.mevsim, s.ebat, s.marka].filter(Boolean).join(" "),
        selected: true,
        mevsim: oppositeMevsim(s.mevsim),
        ebat: s.ebat ?? "",
        marka: s.marka ?? "",
        adet: String(s.adet ?? 4),
        dis_derinligi: "",
        custom_order_no: "",
      };
    })
  );
  const [islemTarihi, setIslemTarihi] = useState(todayIstanbul());
  const [withOrders, setWithOrders] = useState(false);
  const [serviceName, setServiceName] = useState("");
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ changed: number; order_ids: number[] } | null>(null);

  const selected = rows.filter((r) => r.selected);
  const allSelected = rows.length > 0 && selected.length === rows.length;
  const serviceOptions = useMemo(() => (servicesData ?? []).filter((s) => !s.tracks_size), [servicesData]);

  function update(i: number, patch: Partial<Row>) {
    setRows((cur) => cur.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  function chooseService(name: string) {
    setServiceName(name);
    const svc = serviceOptions.find((s) => s.name === name);
    if (svc?.price != null && !price) setPrice(String(svc.price));
  }

  async function submit() {
    if (selected.length === 0) { toast.error("En az bir araç seçin."); return; }
    if (withOrders && !serviceName) { toast.error("Sipariş için hizmet seçin."); return; }
    if (withOrders && customOrderNoEnabled && selected.some((r) => !r.custom_order_no.trim())) {
      toast.error("Her araç için Sipariş No girin.");
      return;
    }
    const unit = Number(price || 0);
    const message = withOrders
      ? `${selected.length} araçta mevsim değişimi yapılacak ve her biri için ${formatCurrency(unit)} tutarında "${serviceName}" siparişi açılacak. Onaylıyor musunuz?`
      : `${selected.length} araçta mevsim değişimi yapılacak: depodaki kayıtlar teslim edilmiş sayılacak, araçlardan çıkan lastikler aynı depo numarasına kaydedilecek. Onaylıyor musunuz?`;
    if (!(await confirm({ message, confirmText: "Değişimi Yap" }))) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/customers/${customerId}/season-change`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          islem_tarihi: islemTarihi,
          items: selected.map((r) => ({
            storage_id: r.storage_id,
            mevsim: r.mevsim || null,
            ebat: r.ebat || null,
            marka: r.marka || null,
            adet: Number(r.adet) || 4,
            dis_derinligi: r.dis_derinligi || null,
            custom_order_no: r.custom_order_no || null,
          })),
          order: withOrders ? { service_name: serviceName, unit_price: unit } : null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Değişim yapılamadı.");
      invalidateAfter(queryClient, "order");
      setResult(body);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Hata oluştu.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Toplu Mevsim Değişimi" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-1 text-xl font-bold text-gray-800">{customerName} — Toplu Mevsim Değişimi</h2>
        {result ? (
          <>
            <p className="my-4 text-sm text-gray-700">
              {result.changed} araçta değişim yapıldı.
              {result.order_ids.length > 0 && <> {result.order_ids.length} sipariş açıldı (Beklemede); ödemesi her siparişin detayından alınır.</>}
              {" "}Yeni depo etiketleri Depolama ekranından yazdırılabilir.
            </p>
            {result.order_ids.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {result.order_ids.map((oid) => (
                  <Link key={oid} prefetch={false} href={`/admin/orders/${oid}`} className="rounded-md bg-gray-100 px-2 py-1 font-mono text-xs font-semibold text-blue-700 hover:underline">#{oid}</Link>
                ))}
              </div>
            )}
            <button type="button" onClick={onClose} className="self-end rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700">Kapat</button>
          </>
        ) : (
          <>
            <p className="mb-4 text-sm text-gray-500">
              Depodaki kayıt teslim edilmiş sayılır, araçtan çıkan lastik aynı depo numarasına kaydedilir. Çıkan lastiğin bilgileri depodakinden doldu ve mevsim tersine çevrildi; farklıysa satırda düzeltin.
            </p>
            <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 text-left text-xs text-gray-600">
                  <tr>
                    <th className="px-2 py-2">
                      <input type="checkbox" aria-label="Tümünü seç" checked={allSelected} onChange={() => setRows((cur) => cur.map((r) => ({ ...r, selected: !allSelected })))} className="h-4 w-4" />
                    </th>
                    <th className="px-2 py-2 font-medium">Araç / Depo</th>
                    <th className="px-2 py-2 font-medium">Depoda (teslim edilecek)</th>
                    <th className="px-2 py-2 font-medium">Çıkan: Mevsim</th>
                    <th className="px-2 py-2 font-medium">Ebat</th>
                    <th className="px-2 py-2 font-medium">Marka</th>
                    <th className="w-16 px-2 py-2 font-medium">Adet</th>
                    <th className="px-2 py-2 font-medium">Diş Derinliği</th>
                    {withOrders && customOrderNoEnabled && <th className="px-2 py-2 font-medium">Sipariş No</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((r, i) => (
                    <tr key={r.storage_id} className={r.selected ? "" : "opacity-50"}>
                      <td className="px-2 py-1.5">
                        <input type="checkbox" aria-label={`${formatPlate(r.plate)} seç`} checked={r.selected} onChange={() => update(i, { selected: !r.selected })} className="h-4 w-4" />
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5">
                        <div className="font-mono font-semibold text-gray-800">{formatPlate(r.plate)}</div>
                        <div className="text-xs text-gray-500">Depo {r.depo_no ?? "—"}</div>
                      </td>
                      <td className="px-2 py-1.5 text-xs text-gray-600">{r.stored || "—"}</td>
                      <td className="px-2 py-1.5">
                        <select aria-label="Çıkan lastiğin mevsimi" value={r.mevsim} onChange={(e) => update(i, { mevsim: e.target.value })} className={input}>
                          <option value="">—</option>
                          {MEVSIM_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1.5"><input aria-label="Ebat" value={r.ebat} onChange={(e) => update(i, { ebat: e.target.value })} className={input} /></td>
                      <td className="px-2 py-1.5"><input aria-label="Marka" value={r.marka} onChange={(e) => update(i, { marka: e.target.value })} className={input} /></td>
                      <td className="px-2 py-1.5"><input aria-label="Adet" type="number" min={1} max={20} value={r.adet} onChange={(e) => update(i, { adet: e.target.value })} className={input} /></td>
                      <td className="px-2 py-1.5"><input aria-label="Diş derinliği" value={r.dis_derinligi} onChange={(e) => update(i, { dis_derinligi: e.target.value })} placeholder="5-5-5-5" className={input} /></td>
                      {withOrders && customOrderNoEnabled && (
                        <td className="px-2 py-1.5"><input aria-label="Sipariş No" value={r.custom_order_no} onChange={(e) => update(i, { custom_order_no: e.target.value })} className={input} /></td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[auto_1fr] sm:items-start">
              <label className="text-sm font-medium text-gray-700">
                İşlem Tarihi
                <input type="date" value={islemTarihi} max={todayIstanbul()} onChange={(e) => setIslemTarihi(e.target.value)} className="mt-1 block rounded-lg border border-gray-300 px-3 py-2" />
              </label>
              <div className="rounded-lg border border-gray-200 p-3">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <input type="checkbox" checked={withOrders} onChange={(e) => setWithOrders(e.target.checked)} className="h-4 w-4" />
                  Her araç için sipariş aç
                </label>
                {withOrders && (
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="text-sm text-gray-700">
                      Hizmet
                      <select value={serviceName} onChange={(e) => chooseService(e.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2">
                        <option value="">Seçin…</option>
                        {serviceOptions.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
                      </select>
                    </label>
                    <label className="text-sm text-gray-700">
                      Araç başı tutar (₺)
                      <TRNumberInput value={price} onChange={setPrice} placeholder="0,00" className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2" />
                    </label>
                    <p className="text-xs text-gray-500 sm:col-span-2">
                      Siparişler Beklemede açılır; ödemesi (cari, kurumsal indirim) her siparişin Ödeme Al &amp; Kapat ekranından alınır.
                      {customOrderNoEnabled && " Elle Sipariş No açık olduğu için tabloda her araç için Sipariş No girin."}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-5 flex gap-3">
              <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-gray-300 py-2.5 font-medium text-gray-700 hover:bg-gray-50">İptal</button>
              <button
                type="button"
                onClick={submit}
                disabled={saving || selected.length === 0}
                className="flex-1 rounded-lg bg-blue-600 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:bg-blue-300"
              >
                {saving ? "Yapılıyor..." : `${selected.length} Araçta Değişim Yap`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
