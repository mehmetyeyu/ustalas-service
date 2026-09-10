"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDate, formatCurrency } from "@/lib/format";
import { useViewGuard, usePermission } from "../AuthContext";
import { useToast } from "@/components/ToastProvider";

interface KasaEntry {
  entry_type: "SIPARIS" | "CARI_TAHSILAT" | "MASRAF" | "MANUEL";
  source_id: number;
  ref_id: number | null;
  kasa_direction: 1 | -1;
  amount: number;
  entry_date: string;
  related_account: string | null;
  description: string;
  running_balance: number;
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
  const [loading, setLoading] = useState(true);
  const [deletingEntryId, setDeletingEntryId] = useState<number | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<number | null>(null);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [amount, setAmount] = useState("");
  const [entryDate, setEntryDate] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function fetchEntries() {
    setLoading(true);
    try {
      const res = await fetch("/api/kasa", { cache: "no-store" });
      const data = await res.json();
      setEntries(Array.isArray(data.entries) ? data.entries : []);
      setBalance(Number(data.balance) || 0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchEntries();
  }, []);

  function openNew() {
    setEditingEntryId(null);
    setDirection(1);
    setAmount("");
    setEntryDate(new Date().toISOString().slice(0, 10));
    setDescription("");
    setShowModal(true);
  }

  function openEdit(e: KasaEntry) {
    setEditingEntryId(e.source_id);
    setDirection(e.kasa_direction);
    setAmount(String(e.amount));
    setEntryDate(e.entry_date);
    setDescription(e.description || "");
    setShowModal(true);
  }

  async function handleDelete(entryId: number) {
    if (!confirm("Bu kasa hareketini silmek istediğinize emin misiniz?")) return;
    if (deletingEntryId !== null) return;
    setDeletingEntryId(entryId);
    try {
      const res = await fetch(`/api/kasa/entries/${entryId}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error || "Silinemedi.");
      await fetchEntries();
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
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Kaydetme başarısız.");
      setShowModal(false);
      await fetchEntries();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Hata oluştu.");
    } finally {
      setSaving(false);
    }
  }

  if (!allowed) return null;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Kasa</h1>
        {canManage && (
          <button
            onClick={openNew}
            className="self-start sm:self-auto bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors"
          >
            + Para Girişi/Çıkışı Ekle
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm p-4 mb-6 min-w-0">
        <p className="text-xs text-gray-500 mb-1">Güncel Kasa Bakiyesi</p>
        <p className={`text-xl sm:text-2xl font-bold truncate ${balance >= 0 ? "text-gray-800" : "text-red-500"}`}>
          {formatCurrency(balance)}
        </p>
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
                  <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">İlgili Hesap</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Açıklama</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Tutar</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Bakiye</th>
                  {canManage && <th className="px-4 py-3"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[...entries].reverse().map((e) => (
                  <tr key={`${e.entry_type}-${e.source_id}`} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{ENTRY_TYPE_LABELS[e.entry_type]}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDate(e.entry_date)}</td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                      {e.entry_type === "SIPARIS" && e.ref_id
                        ? <Link href={`/admin/orders/${e.ref_id}`} className="text-blue-600 hover:text-blue-800">{e.related_account || `#${e.ref_id}`}</Link>
                        : (e.related_account || "-")}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{e.description || "-"}</td>
                    <td className={`px-4 py-3 text-right font-medium whitespace-nowrap ${e.kasa_direction === 1 ? "text-green-600" : "text-red-600"}`}>
                      {e.kasa_direction === 1 ? "+" : "-"}{formatCurrency(e.amount)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700 whitespace-nowrap">{formatCurrency(e.running_balance)}</td>
                    {canManage && (
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {e.entry_type === "MANUEL" && (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => openEdit(e)}
                              disabled={deletingEntryId === e.source_id}
                              className="text-blue-600 hover:text-blue-800 disabled:opacity-40 text-xs font-medium"
                            >
                              Düzenle
                            </button>
                            <button
                              onClick={() => handleDelete(e.source_id)}
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Tutar</label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
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
    </div>
  );
}
