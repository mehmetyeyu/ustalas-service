"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/ToastProvider";
import { useDialog } from "@/lib/useDialog";
import { formatPlate, normalizePlate } from "@/lib/plate";
import { todayIstanbul } from "@/lib/quotes";
import { oppositeMevsim } from "@/lib/seasonChange";
import type { StorageOrderDraft } from "@/lib/storageOrderDraft";
import {
  EMPTY_TIRE_FIELDS, INPUT_CLS, LABEL_BLOCKED_MSG, MevsimCheckboxes, TireFields, openLabelWindow, printLabel, tirePayload,
} from "@/components/storage/storageForm";

type ActiveTire = StorageOrderDraft["active"][number];

const describe = (a: ActiveTire) =>
  [a.adet ? `${a.adet} adet` : null, a.mevsim?.replace(/,/g, "/"), a.marka, a.ebat, a.rft ? "RFT" : null, a.jantli ? "Jantlı" : null].filter(Boolean).join(" · ");

// Siparişten "Depoya Al" — araçtan çıkan lastiği sipariş ekranından ayrılmadan
// depoya yazar. Aracın depoda lastiği varsa önce sorulur: müşteri onu geri
// alıyorsa Değişim Yap (eski kayıt teslim edilir, aynı depo no), almıyorsa
// ayrı kayıt. Formu Depolama ile ortaktır (storageForm).
export default function OrderStorageDialog({ orderId, canEdit, onClose, onSaved }: {
  orderId: number;
  canEdit: boolean; // storage.edit — Değişim Yap için
  onClose: () => void;
  onSaved: (depoNo: number | null) => void;
}) {
  const toast = useToast();
  const dialog = useDialog(() => { if (!saving) onClose(); });
  const [draft, setDraft] = useState<StorageOrderDraft | null>(null);
  const [loadError, setLoadError] = useState("");
  // undefined: henüz seçilmedi (aracın depoda lastiği var), null: yeni kayıt.
  const [swap, setSwap] = useState<ActiveTire | null | undefined>(undefined);
  const [form, setForm] = useState({ ...EMPTY_TIRE_FIELDS, depo_no: "", mevsim: "", aciklama: "", islem_tarihi: todayIstanbul() });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/storage/order-draft?order=${orderId}`, { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) { setLoadError(data.error ?? "Sipariş bilgisi alınamadı."); return; }
        const d = data as StorageOrderDraft;
        setDraft(d);
        setForm((f) => ({ ...f, adet: String(d.adet), ebat: d.ebat, mevsim: d.mevsim, aciklama: d.aciklama }));
        if (d.active.length === 0) setSwap(null);
      })
      .catch(() => { if (!cancelled) setLoadError("Bağlantı hatası, tekrar deneyin."); });
    return () => { cancelled = true; };
  }, [orderId]);

  function chooseSwap(a: ActiveTire) {
    setSwap(a);
    setForm((f) => ({ ...f, mevsim: f.mevsim || oppositeMevsim(a.mevsim) }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft || swap === undefined || saving) return;
    if (!form.mevsim) {
      toast.error("Çıkan lastiğin mevsimini seçin.");
      return;
    }
    // Pencere tıklama anında açılır (bkz. openLabelWindow).
    const labelWin = openLabelWindow();
    let printed = false;
    setSaving(true);
    try {
      const { depo_no, ...rest } = form;
      const common = { ...rest, ...tirePayload(form), order_id: draft.order_id };
      const res = await fetch(swap ? `/api/storage/${swap.id}/degisim` : "/api/storage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(swap ? common : {
          ...common, depo_no: depo_no ? Number(depo_no) : null,
          plate: draft.plate, customer_name: draft.customer_name ?? "", phone: draft.phone ?? "",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Depoya alınamadı.");
        return;
      }
      printed = await printLabel(data, labelWin);
      if (printed) toast.success(`Depo No ${data.depo_no} ile depoya alındı, etiket yazdırılıyor.`);
      else toast.warning(`Depo No ${data.depo_no} ile depoya alındı. ${LABEL_BLOCKED_MSG}`);
      onSaved(data.depo_no);
    } catch {
      toast.error("Bağlantı hatası, tekrar deneyin.");
    } finally {
      if (!printed) labelWin?.close();
      setSaving(false);
    }
  }

  const cancelBtn = "flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg hover:bg-gray-50";
  const choosing = !!draft && !draft.existing && swap === undefined;
  const showForm = !!draft && !draft.existing && swap !== undefined;

  return (
    <div ref={dialog} role="dialog" aria-modal="true" aria-label="Depoya Al" className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col">
        <div className="p-6 pb-4">
          <h2 className="text-xl font-bold text-gray-800">{swap ? `Değişim Yap — Depo No ${swap.depo_no ?? "—"}` : "Çıkan Lastikleri Depoya Al"}</h2>
          {draft && (
            <p className="mt-1 mb-5 text-sm text-gray-500 [overflow-wrap:anywhere]">
              {[formatPlate(normalizePlate(draft.plate)), draft.customer_name, draft.phone, `Sipariş ${draft.order_no}`].filter(Boolean).join(" · ")}
            </p>
          )}
          {!draft && !loadError && <p role="status" className="py-8 text-center text-sm text-gray-400">Yükleniyor...</p>}
          {loadError && <p role="alert" className="py-6 text-sm text-red-600">{loadError}</p>}
          {draft?.existing && (
            <p className="pb-4 text-sm text-gray-700">
              Bu siparişin lastikleri zaten depoya alınmış{draft.existing.depo_no != null ? ` (Depo No ${draft.existing.depo_no}${draft.existing.teslim_edildi ? ", teslim edildi" : ""})` : ""}.
            </p>
          )}

          {choosing && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-gray-700">Bu aracın depoda lastiği var. Müşteri geri alıyor mu?</p>
              {draft.active.map((a) => (
                <div key={a.id} className="flex flex-col gap-3 rounded-lg border border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 text-sm">
                    <div className="font-semibold text-gray-800">Depo No {a.depo_no ?? "—"}</div>
                    <div className="text-gray-500 [overflow-wrap:anywhere]">{describe(a) || "—"}</div>
                  </div>
                  {canEdit && (
                    <button type="button" onClick={() => chooseSwap(a)}
                      className="shrink-0 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
                      Geri alıyor — Değişim Yap
                    </button>
                  )}
                </div>
              ))}
              {!canEdit && <p className="text-xs text-gray-500">Değişim yapmak için depolama düzenleme yetkisi gerekir.</p>}
              <button type="button" onClick={() => setSwap(null)}
                className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
                Depoda kalacak — çıkan lastiği ayrıca depoya al
              </button>
            </div>
          )}

          {showForm && (
            <div className="flex flex-col gap-4">
              {swap && (
                <p className="rounded-lg bg-v2-info-bg px-3 py-2 text-xs text-v2-info-fg">
                  Depodaki {describe(swap) || "lastik"} teslim edilmiş sayılacak; çıkan lastik aynı depo numarasına yazılacak.
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {!swap && (
                  <div>
                    <label htmlFor="depoya-al-no" className="block text-xs font-medium text-gray-600 mb-1">Depo No</label>
                    <input id="depoya-al-no" type="number" min="1" value={form.depo_no} placeholder="Otomatik"
                      onChange={(e) => setForm({ ...form, depo_no: e.target.value })} className={INPUT_CLS} />
                  </div>
                )}
                <div>
                  <label htmlFor="depoya-al-tarih" className="block text-xs font-medium text-gray-600 mb-1">İşlem Tarihi</label>
                  <input id="depoya-al-tarih" type="date" value={form.islem_tarihi}
                    onChange={(e) => setForm({ ...form, islem_tarihi: e.target.value })} className={INPUT_CLS} />
                </div>
              </div>
              <div>
                <span className="block text-xs font-medium text-gray-600 mb-2">Çıkan lastiğin mevsimi</span>
                <MevsimCheckboxes value={form.mevsim} onChange={(mevsim) => setForm((f) => ({ ...f, mevsim }))} />
              </div>
              <div className="border-t border-gray-100 pt-4">
                <TireFields value={form} onChange={(patch) => setForm((f) => ({ ...f, ...patch }))} />
              </div>
              <div>
                <label htmlFor="depoya-al-aciklama" className="block text-xs font-medium text-gray-600 mb-1">Açıklama</label>
                <input id="depoya-al-aciklama" type="text" value={form.aciklama}
                  onChange={(e) => setForm({ ...form, aciklama: e.target.value })} className={INPUT_CLS} />
              </div>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 sm:static bg-white border-t border-gray-100 sm:border-t-0 px-6 py-4 sm:pt-0 sm:pb-6 flex gap-3">
          {showForm && draft.active.length > 0 && (
            <button type="button" onClick={() => setSwap(undefined)} disabled={saving} className={cancelBtn}>Geri</button>
          )}
          <button type="button" onClick={onClose} disabled={saving} className={cancelBtn}>{draft?.existing || loadError ? "Kapat" : "İptal"}</button>
          {showForm && (
            <button type="submit" disabled={saving}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-2.5 rounded-lg">
              {saving ? "Kaydediliyor..." : "Kaydet ve Etiket Yazdır"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
