"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDate, formatCurrency, formatMoney } from "@/lib/format";
import { useViewGuard, usePermission } from "../AuthContext";
import { useToast } from "@/components/ToastProvider";
import { KasaSelect } from "@/components/KasaSelect";
import { flatPaymentOptions } from "@/lib/paymentTypes";
import { CURRENCY_OPTIONS } from "@/lib/kasalar";

interface KasaEntry {
  entry_type: "SIPARIS" | "CARI_TAHSILAT" | "MASRAF" | "MANUEL";
  source_id: number;
  ref_id: number | null;
  kasa_direction: 1 | -1;
  amount: number;
  entry_date: string;
  related_account: string | null;
  description: string;
  kasa_id: number | null;
  kasa_name: string | null;
  transfer_pair_id: number | null;
  transfer_pair_kasa_name: string | null;
  running_balance: number;
}

interface Kasa {
  id: number;
  name: string;
  linked_payment_type: string | null;
  currency: string;
}

const ENTRY_TYPE_LABELS: Record<KasaEntry["entry_type"], string> = {
  SIPARIS: "Sipariş Tahsilatı",
  MASRAF: "Masraf",
  CARI_TAHSILAT: "Cari Tahsilatı",
  MANUEL: "Manuel Hareket",
};

export default function KasaPage() {
  const toast = useToast();
  const allowed = useViewGuard("kasa");
  const canManage = usePermission("kasa.manage");
  const [entries, setEntries] = useState<KasaEntry[]>([]);
  const [balance, setBalance] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [deletingEntryId, setDeletingEntryId] = useState<number | null>(null);

  // "all" (Tüm Kasalar, varsayılan) | "unassigned" (kullanıcıya "Kasa" olarak
  // gösterilir — kasa sistemi eklenmeden önceki/hiç kasa seçilmemiş hareketler)
  // | sayısal kasa id'si
  const [kasaList, setKasaList] = useState<Kasa[]>([]);
  const [selectedKasa, setSelectedKasa] = useState<string>("all");
  // "unassigned" sekmesinin (ekranda "Kasa" olarak gösterilir) görünürlüğü —
  // sadece "Tüm Kasalar" verisi çekildiğinde belirlenir (bkz. fetchEntries),
  // sekme değiştirilince kaybolmasın/yanlış görünmesin diye ayrı bir state'te
  // tutulur.
  const [hasUnassigned, setHasUnassigned] = useState(false);
  // Opsiyonel tarih aralığı — ikisi de boşsa (varsayılan) tüm geçmiş
  // gösterilir (bkz. GET /api/kasa dosya başı yorumu: hacim arttıkça
  // performans için eklendi, ama varsayılan davranış değişmedi).
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<number | null>(null);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [amount, setAmount] = useState("");
  const [entryDate, setEntryDate] = useState("");
  const [description, setDescription] = useState("");
  const [entryKasaId, setEntryKasaId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const [showManageModal, setShowManageModal] = useState(false);
  const [newKasaName, setNewKasaName] = useState("");
  const [newKasaLinkedType, setNewKasaLinkedType] = useState("");
  const [newKasaCurrency, setNewKasaCurrency] = useState("TRY");
  const [renamingKasaId, setRenamingKasaId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameLinkedType, setRenameLinkedType] = useState("");
  const [renameCurrency, setRenameCurrency] = useState("TRY");
  const [kasaActionSaving, setKasaActionSaving] = useState(false);
  // "Nazım Hesap" gibi Nakit-dışı bir ödeme tipi bir kasaya bağlanabilir (bkz.
  // src/lib/kasalar.ts: resolveKasaId) — o tipteki işlemler otomatik bu kasaya
  // sayılır. Nakit/Cari hariç, tenant'ın gerçek ödeme tipi listesi.
  const [linkableTypes, setLinkableTypes] = useState<string[]>([]);
  // Para birimi -> TL kuru (bkz. src/app/api/currency-rates/route.ts) —
  // sadece canlı gösterim için, kullanıcı Kasaları Yönet'ten günceller.
  const [rates, setRates] = useState<Record<string, number>>({});
  const [rateInputs, setRateInputs] = useState<Record<string, string>>({});
  const [rateSaving, setRateSaving] = useState<string | null>(null);

  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferFrom, setTransferFrom] = useState<number | null>(null);
  const [transferTo, setTransferTo] = useState<number | null>(null);
  const [transferAmount, setTransferAmount] = useState("");
  const [transferDate, setTransferDate] = useState("");
  const [transferDescription, setTransferDescription] = useState("");
  const [transferSaving, setTransferSaving] = useState(false);

  async function fetchKasaList() {
    try {
      const res = await fetch("/api/kasalar");
      const data = await res.json();
      setKasaList(Array.isArray(data) ? data : []);
    } catch {
      // sessizce yut — kasa.view yoksa (403) özellik hiç görünmez kalır
    }
  }

  async function fetchRates() {
    try {
      const res = await fetch("/api/currency-rates");
      const data = await res.json();
      if (Array.isArray(data)) {
        const map: Record<string, number> = {};
        const inputs: Record<string, string> = {};
        for (const r of data as { currency: string; rate_to_try: number }[]) {
          map[r.currency] = Number(r.rate_to_try);
          inputs[r.currency] = String(r.rate_to_try);
        }
        setRates(map);
        setRateInputs((prev) => ({ ...inputs, ...prev }));
      }
    } catch {
      // sessizce yut
    }
  }

  // Kasaları Yönet'teki "Döviz Kurları" bölümünden bir para biriminin
  // güncel TL kurunu günceller — geçmiş işlemleri etkilemez, sadece bundan
  // sonraki CANLI gösterim/toplamı (bkz. GET /api/kasa: effective_amount).
  async function handleSaveRate(currency: string) {
    const rate = Number(rateInputs[currency]);
    if (!Number.isFinite(rate) || rate <= 0) {
      toast.error("Geçerli bir kur girin.");
      return;
    }
    setRateSaving(currency);
    try {
      const res = await fetch("/api/currency-rates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currency, rate_to_try: rate }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Kaydetme başarısız.");
      setRates((prev) => ({ ...prev, [currency]: rate }));
      await refreshAll();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Hata oluştu.");
    } finally {
      setRateSaving(null);
    }
  }

  // offset > 0 ise mevcut listenin sonuna eklenir ("Daha Fazla Yükle"),
  // aksi halde listeyi baştan değiştirir (filtre değişimi/yenileme). API
  // en yeniden en eskiye döndürdüğünden (bkz. GET /api/kasa) burada artık
  // ters çevirmeye gerek yok.
  async function fetchEntries(kasaFilter: string, from: string, to: string, offset = 0) {
    const append = offset > 0;
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const params = new URLSearchParams();
      if (kasaFilter !== "all") params.set("kasaId", kasaFilter);
      if (from && to) { params.set("from", from); params.set("to", to); }
      if (append) params.set("offset", String(offset));
      const qs = params.toString();
      const res = await fetch(`/api/kasa${qs ? `?${qs}` : ""}`, { cache: "no-store" });
      const data = await res.json();
      const list: KasaEntry[] = Array.isArray(data.entries) ? data.entries : [];
      setEntries((prev) => (append ? [...prev, ...list] : list));
      setBalance(Number(data.balance) || 0);
      setTotal(Number(data.total) || 0);
      setHasUnassigned(!!data.hasUnassigned);
    } finally {
      if (append) setLoadingMore(false); else setLoading(false);
    }
  }

  useEffect(() => {
    fetchKasaList();
    fetchRates();
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.payment_types)) {
          setLinkableTypes(flatPaymentOptions(d.payment_types).filter((t) => t !== "Nakit" && t !== "Cari"));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchEntries(selectedKasa, dateFrom, dateTo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKasa, dateFrom, dateTo]);

  async function refreshAll() {
    await Promise.all([fetchKasaList(), fetchEntries(selectedKasa, dateFrom, dateTo)]);
  }

  function openNew() {
    setEditingEntryId(null);
    setDirection(1);
    setAmount("");
    setEntryDate(new Date().toISOString().slice(0, 10));
    setDescription("");
    setEntryKasaId(selectedKasa !== "all" && selectedKasa !== "unassigned" ? Number(selectedKasa) : null);
    setShowModal(true);
  }

  function openEdit(e: KasaEntry) {
    setEditingEntryId(e.source_id);
    setDirection(e.kasa_direction);
    setAmount(String(e.amount));
    setEntryDate(e.entry_date);
    setDescription(e.description || "");
    setEntryKasaId(e.kasa_id);
    setShowModal(true);
  }

  async function handleDelete(e: KasaEntry) {
    const confirmMsg = e.transfer_pair_kasa_name
      ? `Bu transferi (${e.kasa_name || "?"} ↔ ${e.transfer_pair_kasa_name}) silmek istediğinize emin misiniz?`
      : "Bu kasa hareketini silmek istediğinize emin misiniz?";
    if (!confirm(confirmMsg)) return;
    if (deletingEntryId !== null) return;
    setDeletingEntryId(e.source_id);
    try {
      const res = await fetch(`/api/kasa/entries/${e.source_id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error || "Silinemedi.");
      await refreshAll();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Hata oluştu.");
    } finally {
      setDeletingEntryId(null);
    }
  }

  async function handleSave() {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Geçerli bir tutar girin.");
      return;
    }
    setSaving(true);
    try {
      const url = editingEntryId !== null ? `/api/kasa/entries/${editingEntryId}` : "/api/kasa/entries";
      const res = await fetch(url, {
        method: editingEntryId !== null ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direction,
          amount: amt,
          entry_date: entryDate || null,
          description: description.trim() || null,
          kasa_id: entryKasaId,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Kaydetme başarısız.");
      setShowModal(false);
      await refreshAll();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Hata oluştu.");
    } finally {
      setSaving(false);
    }
  }

  function openManage() {
    setNewKasaName("");
    setNewKasaLinkedType("");
    setNewKasaCurrency("TRY");
    setRenamingKasaId(null);
    setShowManageModal(true);
  }

  // Bir ödeme tipi aynı anda en fazla bir kasaya bağlı olabilir — excludeKasaId
  // (düzenlenen kasanın kendisi) hariç, HALİHAZIRDA başka bir kasaya bağlı
  // tipler seçenek listesinden çıkarılır (asıl garanti sunucudaki unique index,
  // bu sadece kullanıcıya baştan geçersiz bir seçeneği göstermemek için).
  function linkTypeOptions(excludeKasaId: number | null): string[] {
    const taken = new Set(
      kasaList.filter((k) => k.id !== excludeKasaId && k.linked_payment_type).map((k) => k.linked_payment_type)
    );
    return linkableTypes.filter((t) => !taken.has(t));
  }

  async function handleAddKasa() {
    if (!newKasaName.trim()) return;
    setKasaActionSaving(true);
    try {
      const res = await fetch("/api/kasalar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKasaName.trim(), linked_payment_type: newKasaLinkedType || null, currency: newKasaCurrency }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Kaydetme başarısız.");
      setNewKasaName("");
      setNewKasaLinkedType("");
      setNewKasaCurrency("TRY");
      await fetchKasaList();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Hata oluştu.");
    } finally {
      setKasaActionSaving(false);
    }
  }

  async function handleRenameKasa(id: number) {
    if (!renameValue.trim()) return;
    setKasaActionSaving(true);
    try {
      const res = await fetch(`/api/kasalar/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameValue.trim(), linked_payment_type: renameLinkedType || null, currency: renameCurrency }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Kaydetme başarısız.");
      setRenamingKasaId(null);
      // Hareket tablosundaki "Kasa" kolonu (bkz. entries[].kasa_name) önceki
      // fetch'ten geldiği için, yeniden adlandırma sonrası eski adı göstermeye
      // devam etmesin diye entries de yeniden çekilir. Bağlı ödeme tipi
      // değiştiyse geçmiş kayıtlar da sunucuda backfill edildiğinden
      // (applyKasaLinkChange), entries burada da güncel gelir.
      await Promise.all([fetchKasaList(), fetchEntries(selectedKasa, dateFrom, dateTo)]);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Hata oluştu.");
    } finally {
      setKasaActionSaving(false);
    }
  }

  async function handleDeleteKasa(id: number) {
    if (!confirm("Bu kasayı silmek istediğinize emin misiniz?")) return;
    setKasaActionSaving(true);
    try {
      const res = await fetch(`/api/kasalar/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error || "Silinemedi.");
      if (selectedKasa === String(id)) setSelectedKasa("all");
      await fetchKasaList();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Hata oluştu.");
    } finally {
      setKasaActionSaving(false);
    }
  }

  function openTransfer() {
    setTransferFrom(null);
    setTransferTo(null);
    setTransferAmount("");
    setTransferDate(new Date().toISOString().slice(0, 10));
    setTransferDescription("");
    setShowTransferModal(true);
  }

  async function handleTransfer() {
    const amt = Number(transferAmount);
    if (!transferFrom || !transferTo) {
      toast.error("Kaynak ve hedef kasa zorunludur.");
      return;
    }
    if (transferFrom === transferTo) {
      toast.error("Kaynak ve hedef kasa aynı olamaz.");
      return;
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Geçerli bir tutar girin.");
      return;
    }
    setTransferSaving(true);
    try {
      const res = await fetch("/api/kasa/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from_kasa_id: transferFrom,
          to_kasa_id: transferTo,
          amount: amt,
          entry_date: transferDate || null,
          description: transferDescription.trim() || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Kaydetme başarısız.");
      setShowTransferModal(false);
      await refreshAll();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Hata oluştu.");
    } finally {
      setTransferSaving(false);
    }
  }

  if (!allowed) return null;

  const isSpecificKasa = selectedKasa !== "all" && selectedKasa !== "unassigned";
  const selectedKasaObj = isSpecificKasa ? kasaList.find((k) => k.id === Number(selectedKasa)) : undefined;
  // Belirli bir kasa seçiliyken tutar/bakiye o kasanın KENDİ para biriminde
  // (native, bkz. GET /api/kasa: isSpecificKasa) — "Tüm Kasalar"/"Kasa"
  // (atanmamış) her zaman TL'dir (backend zaten TL karşılığına çevirir).
  const balanceCurrency = selectedKasaObj?.currency || "TRY";
  const balanceLabel = selectedKasa === "all"
    ? "Tüm Kasalar Bakiyesi"
    : selectedKasa === "unassigned"
    ? "Kasa Bakiyesi"
    : `${selectedKasaObj?.name || ""} Bakiyesi`;
  // Döviz kasası seçiliyken güncel kurla TL karşılığı — kur girilmemişse
  // null (uyarı gösterilir, hiçbir şey uydurulmaz).
  const tlEquivalent = balanceCurrency !== "TRY" && rates[balanceCurrency] != null
    ? balance * rates[balanceCurrency]
    : null;
  // "Tüm Kasalar" toplamına, kuru hiç girilmemiş bir döviz kasası varsa
  // dahil edilemez (bkz. backend: effective_amount NULL kalır) — kullanıcıya
  // bunun neden/hangi kasa için olduğunu açıkça göstermek için.
  const missingRateKasalar = selectedKasa === "all"
    ? kasaList.filter((k) => k.currency !== "TRY" && rates[k.currency] == null)
    : [];

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Kasa</h1>
        {canManage && (
          <div className="flex flex-wrap gap-2 self-start sm:self-auto">
            <button
              onClick={openManage}
              className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium px-4 py-2 rounded-lg text-sm transition-colors"
            >
              Kasaları Yönet
            </button>
            {kasaList.length >= 2 && (
              <button
                onClick={openTransfer}
                className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium px-4 py-2 rounded-lg text-sm transition-colors"
              >
                Kasalar Arası Transfer
              </button>
            )}
            <button
              onClick={openNew}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors"
            >
              + Para Girişi/Çıkışı Ekle
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-2 mb-4">
        {kasaList.length > 0 && (
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => setSelectedKasa("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${selectedKasa === "all" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
            >
              Tüm Kasalar
            </button>
            {kasaList.map((k) => (
              <button
                key={k.id}
                onClick={() => setSelectedKasa(String(k.id))}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${selectedKasa === String(k.id) ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
              >
                {k.name}
              </button>
            ))}
            {hasUnassigned && (
              <button
                onClick={() => setSelectedKasa("unassigned")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${selectedKasa === "unassigned" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
              >
                Kasa
              </button>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-end gap-2 ml-auto">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Başlangıç</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Bitiş</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {(dateFrom || dateTo) && (
            <button
              onClick={() => { setDateFrom(""); setDateTo(""); }}
              className="text-gray-400 hover:text-gray-600 text-xs font-medium px-2 py-1.5"
            >
              Tüm Zamanlar
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-4 mb-6 min-w-0">
        <p className="text-xs text-gray-500 mb-1">{balanceLabel}</p>
        <p className={`text-xl sm:text-2xl font-bold truncate ${balance >= 0 ? "text-gray-800" : "text-red-500"}`}>
          {formatMoney(balance, balanceCurrency)}
        </p>
        {balanceCurrency !== "TRY" && (
          tlEquivalent != null ? (
            <p className="text-xs text-gray-400 mt-1">≈ {formatCurrency(tlEquivalent)} (kur: {rates[balanceCurrency]})</p>
          ) : (
            <p className="text-xs text-amber-600 mt-1">Kur girilmemiş, TL karşılığı hesaplanamıyor.</p>
          )
        )}
        {missingRateKasalar.length > 0 && (
          <p className="text-xs text-amber-600 mt-1">
            {missingRateKasalar.map((k) => k.name).join(", ")} kuru girilmediği için bu toplama dahil edilmedi.
          </p>
        )}
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-12">Yükleniyor...</div>
      ) : entries.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-400">Kasa hareketi bulunamadı.</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">İşlem Türü</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Tarih</th>
                  {selectedKasa === "all" && (
                    <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Kasa</th>
                  )}
                  <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">İlgili Hesap</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Açıklama</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Tutar</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Bakiye</th>
                  {canManage && <th className="px-4 py-3"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {entries.map((e) => (
                  <tr key={`${e.entry_type}-${e.source_id}`} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                      {e.transfer_pair_kasa_name ? "Kasalar Arası Transfer" : ENTRY_TYPE_LABELS[e.entry_type]}
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDate(e.entry_date)}</td>
                    {selectedKasa === "all" && (
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{e.kasa_name || "-"}</td>
                    )}
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                      {e.transfer_pair_kasa_name
                        ? (e.kasa_direction === -1 ? `→ ${e.transfer_pair_kasa_name}` : `← ${e.transfer_pair_kasa_name}`)
                        : e.entry_type === "SIPARIS" && e.ref_id
                        ? <Link href={`/admin/orders/${e.ref_id}`} className="text-blue-600 hover:text-blue-800">{e.related_account || `#${e.ref_id}`}</Link>
                        : (e.related_account || "-")}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{e.description || "-"}</td>
                    <td className={`px-4 py-3 text-right font-medium whitespace-nowrap ${e.kasa_direction === 1 ? "text-green-600" : "text-red-600"}`}>
                      {e.kasa_direction === 1 ? "+" : "-"}{formatMoney(e.amount, e.kasa_id != null ? (kasaList.find((k) => k.id === e.kasa_id)?.currency || "TRY") : "TRY")}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700 whitespace-nowrap">{formatMoney(e.running_balance, balanceCurrency)}</td>
                    {canManage && (
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {e.entry_type === "MANUEL" && (
                          <div className="flex items-center justify-end gap-2">
                            {!e.transfer_pair_kasa_name && (
                              <button
                                onClick={() => openEdit(e)}
                                disabled={deletingEntryId === e.source_id}
                                className="text-blue-600 hover:text-blue-800 disabled:opacity-40 text-xs font-medium"
                              >
                                Düzenle
                              </button>
                            )}
                            <button
                              onClick={() => handleDelete(e)}
                              disabled={deletingEntryId === e.source_id}
                              className="text-red-500 hover:text-red-700 disabled:opacity-40 text-xs font-medium"
                            >
                              {deletingEntryId === e.source_id ? "Siliniyor..." : "Sil"}
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {entries.length < total && (
            <div className="p-4 text-center border-t border-gray-100">
              <button
                onClick={() => fetchEntries(selectedKasa, dateFrom, dateTo, entries.length)}
                disabled={loadingMore}
                className="text-blue-600 hover:text-blue-800 disabled:opacity-40 text-sm font-medium"
              >
                {loadingMore ? "Yükleniyor..." : `Daha Fazla Yükle (${entries.length} / ${total})`}
              </button>
            </div>
          )}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <h2 className="text-xl font-bold text-gray-800 mb-4">
              {editingEntryId !== null ? "Kasa Hareketini Düzenle" : "Para Girişi/Çıkışı Ekle"}
            </h2>

            <div className="space-y-4 mb-5">
              <div className="flex gap-2">
                <button
                  onClick={() => setDirection(1)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border ${direction === 1 ? "bg-green-600 text-white border-green-600" : "border-gray-300 text-gray-700"}`}
                >
                  Para Girişi
                </button>
                <button
                  onClick={() => setDirection(-1)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border ${direction === -1 ? "bg-red-600 text-white border-red-600" : "border-gray-300 text-gray-700"}`}
                >
                  Para Çıkışı
                </button>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tutar {entryKasaId != null && (kasaList.find((k) => k.id === entryKasaId)?.currency ?? "TRY") !== "TRY" && (
                    <span className="text-gray-400 font-normal">({kasaList.find((k) => k.id === entryKasaId)?.currency})</span>
                  )}
                </label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {kasaList.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Kasa</label>
                  <KasaSelect
                    value={entryKasaId}
                    onChange={setEntryKasaId}
                    kasaOptions={kasaList}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tarih</label>
                <input
                  type="date"
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Açıklama (opsiyonel)</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ör. Yavuz Abiye Gönderildi"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg hover:bg-gray-50"
              >
                İptal
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-2.5 rounded-lg transition-colors"
              >
                {saving ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showManageModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Kasaları Yönet</h2>

            {kasaList.length === 0 ? (
              <p className="text-sm text-gray-400 mb-4">Henüz kasa tanımlanmamış.</p>
            ) : (
              <div className="space-y-2 mb-4">
                {kasaList.map((k) => (
                  <div key={k.id} className="border border-gray-100 rounded-lg px-3 py-2">
                    {renamingKasaId === k.id ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <button
                            onClick={() => handleRenameKasa(k.id)}
                            disabled={kasaActionSaving}
                            className="text-blue-600 hover:text-blue-800 text-xs font-medium shrink-0"
                          >
                            Kaydet
                          </button>
                          <button
                            onClick={() => setRenamingKasaId(null)}
                            className="text-gray-400 hover:text-gray-600 text-xs font-medium shrink-0"
                          >
                            Vazgeç
                          </button>
                        </div>
                        <select
                          value={renameCurrency}
                          onChange={(e) => { setRenameCurrency(e.target.value); if (e.target.value !== "TRY") setRenameLinkedType(""); }}
                          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          {CURRENCY_OPTIONS.map((c) => (
                            <option key={c} value={c}>{c === "TRY" ? "TL (TRY)" : c}</option>
                          ))}
                        </select>
                        {renameCurrency === "TRY" && (
                          <select
                            value={renameLinkedType}
                            onChange={(e) => setRenameLinkedType(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">Bağlı ödeme tipi yok</option>
                            {linkTypeOptions(k.id).map((t) => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="flex-1 text-sm text-gray-800">
                          {k.name}
                          {k.currency !== "TRY" && (
                            <span className="text-gray-400"> · {k.currency}</span>
                          )}
                          {k.linked_payment_type && (
                            <span className="text-gray-400"> · {k.linked_payment_type}</span>
                          )}
                        </span>
                        <button
                          onClick={() => { setRenamingKasaId(k.id); setRenameValue(k.name); setRenameLinkedType(k.linked_payment_type || ""); setRenameCurrency(k.currency || "TRY"); }}
                          className="text-blue-600 hover:text-blue-800 text-xs font-medium shrink-0"
                        >
                          Düzenle
                        </button>
                        <button
                          onClick={() => handleDeleteKasa(k.id)}
                          disabled={kasaActionSaving}
                          className="text-red-500 hover:text-red-700 text-xs font-medium shrink-0"
                        >
                          Sil
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2 mb-5">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newKasaName}
                  onChange={(e) => setNewKasaName(e.target.value)}
                  placeholder="Yeni kasa adı (ör. Nazım Kasa)"
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleAddKasa}
                  disabled={kasaActionSaving || !newKasaName.trim()}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-medium px-4 py-2.5 rounded-lg text-sm transition-colors shrink-0"
                >
                  Ekle
                </button>
              </div>
              <select
                value={newKasaCurrency}
                onChange={(e) => { setNewKasaCurrency(e.target.value); if (e.target.value !== "TRY") setNewKasaLinkedType(""); }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {CURRENCY_OPTIONS.map((c) => (
                  <option key={c} value={c}>{c === "TRY" ? "TL (TRY)" : c}</option>
                ))}
              </select>
              {newKasaCurrency === "TRY" && (
                <select
                  value={newKasaLinkedType}
                  onChange={(e) => setNewKasaLinkedType(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Bağlı ödeme tipi yok (Nakit kasası)</option>
                  {linkTypeOptions(null).map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              )}
            </div>

            {kasaList.some((k) => k.currency !== "TRY") && (
              <div className="border-t border-gray-100 pt-4 mb-5">
                <p className="text-sm font-medium text-gray-700 mb-2">Döviz Kurları</p>
                <div className="space-y-2">
                  {Array.from(new Set(kasaList.filter((k) => k.currency !== "TRY").map((k) => k.currency))).map((c) => (
                    <div key={c} className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-24 shrink-0">1 {c} =</span>
                      <input
                        type="number" step="0.0001"
                        value={rateInputs[c] ?? ""}
                        onChange={(e) => setRateInputs((prev) => ({ ...prev, [c]: e.target.value }))}
                        placeholder="Kur girilmedi"
                        className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-xs text-gray-500 shrink-0">₺</span>
                      <button
                        onClick={() => handleSaveRate(c)}
                        disabled={rateSaving === c}
                        className="text-blue-600 hover:text-blue-800 text-xs font-medium shrink-0"
                      >
                        Kaydet
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={() => setShowManageModal(false)}
              className="w-full border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg hover:bg-gray-50"
            >
              Kapat
            </button>
          </div>
        </div>
      )}

      {showTransferModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Kasalar Arası Transfer</h2>

            <div className="space-y-4 mb-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kaynak Kasa</label>
                <select
                  value={transferFrom ?? ""}
                  onChange={(e) => setTransferFrom(e.target.value ? Number(e.target.value) : null)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Kasa seç...</option>
                  {kasaList
                    .filter((k) => k.id !== transferTo && (transferTo == null || k.currency === kasaList.find((k2) => k2.id === transferTo)?.currency))
                    .map((k) => (
                      <option key={k.id} value={k.id}>{k.name}{k.currency !== "TRY" ? ` (${k.currency})` : ""}</option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Hedef Kasa</label>
                <select
                  value={transferTo ?? ""}
                  onChange={(e) => setTransferTo(e.target.value ? Number(e.target.value) : null)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Kasa seç...</option>
                  {kasaList
                    .filter((k) => k.id !== transferFrom && (transferFrom == null || k.currency === kasaList.find((k2) => k2.id === transferFrom)?.currency))
                    .map((k) => (
                      <option key={k.id} value={k.id}>{k.name}{k.currency !== "TRY" ? ` (${k.currency})` : ""}</option>
                    ))}
                </select>
                {/* Farklı para birimindeki kasalar arası transfer sunucuda da
                    reddedilir (bkz. POST /api/kasa/transfers) — burası sadece
                    geçersiz bir seçeneği baştan göstermemek için. */}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tutar</label>
                <input
                  type="number"
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tarih</label>
                <input
                  type="date"
                  value={transferDate}
                  onChange={(e) => setTransferDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Açıklama (opsiyonel)</label>
                <input
                  type="text"
                  value={transferDescription}
                  onChange={(e) => setTransferDescription(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowTransferModal(false)}
                className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg hover:bg-gray-50"
              >
                İptal
              </button>
              <button
                onClick={handleTransfer}
                disabled={transferSaving}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-2.5 rounded-lg transition-colors"
              >
                {transferSaving ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
