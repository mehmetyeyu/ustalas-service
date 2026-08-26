"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDate } from "@/lib/format";
import { useViewGuard, usePermission, useAuth } from "../AuthContext";
import { useToast } from "@/components/ToastProvider";

interface Appointment {
  id: number;
  plate: string;
  customer_name: string | null;
  customer_phone: string | null;
  requested_at: string;
  status: string;
  order_id: number | null;
  notes: string | null;
  service_name: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  BEKLEMEDE: "Beklemede",
  ONAYLANDI: "Onaylandı",
  REDDEDILDI: "Reddedildi",
  TAMAMLANDI: "Tamamlandı",
  IPTAL: "İptal",
  GELMEDI: "Gelmedi",
};

const STATUS_BADGE: Record<string, string> = {
  BEKLEMEDE: "bg-yellow-100 text-yellow-700",
  ONAYLANDI: "bg-blue-100 text-blue-700",
  REDDEDILDI: "bg-gray-100 text-gray-500",
  TAMAMLANDI: "bg-green-100 text-green-700",
  IPTAL: "bg-gray-100 text-gray-500",
  GELMEDI: "bg-red-100 text-red-700",
};

const FILTERS = [
  { value: "", label: "Tümü" },
  { value: "BEKLEMEDE", label: "Beklemede" },
  { value: "ONAYLANDI", label: "Onaylandı" },
  { value: "TAMAMLANDI", label: "Tamamlandı" },
];

export default function AppointmentsPage() {
  const toast = useToast();
  const allowed = useViewGuard("appointments");
  const canApprove = usePermission("appointments.approve");
  const canDelete = usePermission("appointments.delete");
  const { user } = useAuth();

  const [items, setItems] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  async function fetchItems() {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter) params.set("status", filter);
    const res = await fetch(`/api/appointments?${params}`, { cache: "no-store" });
    const data = await res.json();
    setItems(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => {
    fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function setStatus(id: number, status: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/appointments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Güncelleme başarısız.");
      await fetchItems();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Hata oluştu.");
    } finally {
      setBusyId(null);
    }
  }

  async function convertToOrder(id: number) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/appointments/${id}/convert`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error || "Dönüştürme başarısız.");
      await fetchItems();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Hata oluştu.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Bu randevuyu silmek istediğinize emin misiniz?")) return;
    setBusyId(id);
    await fetch(`/api/appointments/${id}`, { method: "DELETE" });
    await fetchItems();
    setBusyId(null);
  }

  if (!allowed) return null;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Randevular</h1>
        {user?.role === "admin" && (
          <div className="flex items-center gap-4">
            <Link
              href="/admin/appointments/gorunum"
              className="text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              Görünüm
            </Link>
            <Link
              href="/admin/appointments/ayarlar"
              className="text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              Randevu Ayarları
            </Link>
          </div>
        )}
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f.value ? "bg-blue-600 text-white" : "bg-white border border-gray-300 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-12">Yükleniyor...</div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-400">Randevu bulunamadı.</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Tarih / Saat</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Plaka</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Müşteri</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Hizmet</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Statü</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((a) => {
                  const busy = busyId === a.id;
                  return (
                    <tr key={a.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{formatDate(a.requested_at)}</td>
                      <td className="px-4 py-3 font-mono font-semibold text-gray-800 whitespace-nowrap">{a.plate}</td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                        {a.customer_name || "—"}
                        {a.customer_phone && <span className="text-gray-400 text-xs"> · {a.customer_phone}</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{a.service_name || "—"}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[a.status]}`}>
                          {STATUS_LABELS[a.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2 flex-wrap">
                          {canApprove && a.status === "BEKLEMEDE" && (
                            <>
                              <button
                                disabled={busy}
                                onClick={() => setStatus(a.id, "ONAYLANDI")}
                                className="text-green-600 hover:text-green-800 text-xs font-medium disabled:opacity-40"
                              >
                                Onayla
                              </button>
                              <button
                                disabled={busy}
                                onClick={() => setStatus(a.id, "REDDEDILDI")}
                                className="text-red-500 hover:text-red-700 text-xs font-medium disabled:opacity-40"
                              >
                                Reddet
                              </button>
                            </>
                          )}
                          {canApprove && a.status === "ONAYLANDI" && (
                            <>
                              <button
                                disabled={busy}
                                onClick={() => convertToOrder(a.id)}
                                className="text-blue-600 hover:text-blue-800 text-xs font-medium disabled:opacity-40"
                              >
                                Siparişe Dönüştür
                              </button>
                              <button
                                disabled={busy}
                                onClick={() => setStatus(a.id, "GELMEDI")}
                                className="text-gray-500 hover:text-gray-700 text-xs font-medium disabled:opacity-40"
                              >
                                Gelmedi
                              </button>
                            </>
                          )}
                          {a.status === "TAMAMLANDI" && a.order_id && (
                            <a href={`/admin/orders/${a.order_id}`} className="text-blue-600 hover:text-blue-800 text-xs font-medium">
                              Siparişi Gör →
                            </a>
                          )}
                          {canDelete && (
                            <button
                              disabled={busy}
                              onClick={() => handleDelete(a.id)}
                              className="text-gray-400 hover:text-red-600 text-xs font-medium disabled:opacity-40"
                            >
                              Sil
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
