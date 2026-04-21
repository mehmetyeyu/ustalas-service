"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDate, formatCurrency } from "@/lib/format";

interface Order {
  id: number;
  plate: string;
  customer_name: string | null;
  services: string;
  total_amount: number;
  status: "BEKLEMEDE" | "TAMAMLANDI";
  payment_type: string | null;
  created_at: string;
}

function toLocalDate(d: Date): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(d);
}

const TODAY = toLocalDate(new Date());

function getDateRange(filter: string): { dateFrom: string; dateTo: string } {
  const now = new Date();
  if (filter === "bugun") return { dateFrom: TODAY, dateTo: TODAY };
  if (filter === "bu_hafta") {
    const day = now.getDay() || 7;
    const mon = new Date(now);
    mon.setDate(now.getDate() - day + 1);
    return { dateFrom: toLocalDate(mon), dateTo: TODAY };
  }
  if (filter === "bu_ay") {
    const localNow = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Istanbul" }));
    return {
      dateFrom: `${localNow.getFullYear()}-${String(localNow.getMonth() + 1).padStart(2, "0")}-01`,
      dateTo: TODAY,
    };
  }
  return { dateFrom: "", dateTo: "" };
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("bugun");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [plateSearch, setPlateSearch] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  async function deleteOrder(id: number) {
    if (!confirm(`#${id} numaralı siparişi silmek istediğinize emin misiniz?`)) return;
    setDeletingId(id);
    try {
      await fetch(`/api/orders/${id}`, { method: "DELETE" });
      setOrders((prev) => prev.filter((o) => o.id !== id));
    } finally {
      setDeletingId(null);
    }
  }

  async function fetchOrders() {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (plateSearch) params.set("plate", plateSearch);

    if (dateFilter === "ozel") {
      if (customFrom) params.set("dateFrom", customFrom);
      if (customTo) params.set("dateTo", customTo);
    } else if (dateFilter) {
      const { dateFrom, dateTo } = getDateRange(dateFilter);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
    }

    const res = await fetch(`/api/orders?${params}`);
    const data = await res.json();
    setOrders(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => {
    fetchOrders();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, dateFilter, customFrom, customTo, plateSearch]);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Sipariş Listesi</h1>
      </div>

      {/* Filtreler */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-6 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Tarih</label>
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Tümü</option>
            <option value="bugun">Bugün</option>
            <option value="bu_hafta">Bu Hafta</option>
            <option value="bu_ay">Bu Ay</option>
            <option value="ozel">Özel Aralık</option>
          </select>
        </div>

        {dateFilter === "ozel" && (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Başlangıç</label>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Bitiş</label>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Statü</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Tümü</option>
            <option value="BEKLEMEDE">Beklemede</option>
            <option value="TAMAMLANDI">Tamamlandı</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Plaka Ara</label>
          <input
            type="text"
            value={plateSearch}
            onChange={(e) => setPlateSearch(e.target.value.toUpperCase())}
            placeholder="34 ABC..."
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Tablo */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400">Yükleniyor...</div>
        ) : orders.length === 0 ? (
          <div className="p-12 text-center text-gray-400">Sipariş bulunamadı.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">#</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Plaka</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Hizmetler</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Tarih</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Tutar</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Statü</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-400">{order.id}</td>
                    <td className="px-4 py-3">
                      <span className="font-mono font-semibold text-gray-800">{order.plate}</span>
                      {order.customer_name && (
                        <div className="text-xs text-gray-400">{order.customer_name}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{order.services}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {formatDate(order.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-800">
                      {formatCurrency(order.total_amount)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                          order.status === "TAMAMLANDI"
                            ? "bg-green-100 text-green-700"
                            : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {order.status === "TAMAMLANDI" ? "Tamamlandı" : "Beklemede"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Link
                          href={`/admin/orders/${order.id}`}
                          className="text-blue-600 hover:text-blue-800 font-medium text-xs"
                        >
                          Detay →
                        </Link>
                        <button
                          onClick={() => deleteOrder(order.id)}
                          disabled={deletingId === order.id}
                          className="text-red-500 hover:text-red-700 text-xs font-medium disabled:opacity-40"
                        >
                          {deletingId === order.id ? "Siliniyor..." : "Sil"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
