"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDate, formatCurrency } from "@/lib/format";

interface Customer {
  id: number;
  name: string;
  phone: string | null;
  order_count: number;
}

interface CustomerOrder {
  id: number;
  plate: string;
  total_amount: number | null;
  paid_amount: number | null;
  status: "BEKLEMEDE" | "TAMAMLANDI";
  payment_type: string | null;
  created_at: string;
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Customer | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [ordersModalCustomer, setOrdersModalCustomer] = useState<Customer | null>(null);
  const [customerOrders, setCustomerOrders] = useState<CustomerOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  async function fetchCustomers() {
    // GET /api/customers tarayıcı önbelleğine izin verir (Cache-Control) — bu
    // yönetim ekranı bir ekleme/düzenleme/silmeden hemen sonra her zaman güncel
    // veriyi göstermeli, o yüzden önbellek burada devre dışı bırakılır.
    const res = await fetch("/api/customers", { cache: "no-store" });
    const data = await res.json();
    setCustomers(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => {
    fetchCustomers();
  }, []);

  async function openOrders(c: Customer) {
    setOrdersModalCustomer(c);
    setCustomerOrders([]);
    setOrdersLoading(true);
    try {
      const res = await fetch(`/api/customers/${c.id}/orders`);
      const data = await res.json();
      setCustomerOrders(Array.isArray(data) ? data : []);
    } finally {
      setOrdersLoading(false);
    }
  }

  function openNew() {
    setEditItem(null);
    setName("");
    setPhone("");
    setError("");
    setShowForm(true);
  }

  function openEdit(c: Customer) {
    setEditItem(c);
    setName(c.name);
    setPhone(c.phone || "");
    setError("");
    setShowForm(true);
  }

  async function handleSave() {
    setError("");
    if (!name.trim()) {
      setError("Müşteri adı zorunludur.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(editItem ? `/api/customers/${editItem.id}` : "/api/customers", {
        method: editItem ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim() || null }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Kaydetme başarısız.");
      setShowForm(false);
      await fetchCustomers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Hata oluştu.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Bu müşteriyi silmek istediğinize emin misiniz?")) return;
    const res = await fetch(`/api/customers/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "Müşteri silinemedi.");
      return;
    }
    await fetchCustomers();
  }

  const filtered = search
    ? customers.filter((c) => c.name.toLocaleLowerCase("tr-TR").includes(search.toLocaleLowerCase("tr-TR")))
    : customers;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Müşteriler</h1>
        <button
          onClick={openNew}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors"
        >
          + Yeni Müşteri
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Müşteri adı ara..."
          className="w-full sm:w-72 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-12">Yükleniyor...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-400">Müşteri bulunamadı.</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Müşteri Adı</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Telefon</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{c.name}</td>
                  <td className="px-4 py-3 text-gray-600">{c.phone || "-"}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      {c.order_count > 0 && (
                        <button
                          onClick={() => openOrders(c)}
                          className="text-gray-600 hover:text-gray-900 text-xs font-medium"
                        >
                          Siparişler
                        </button>
                      )}
                      <button
                        onClick={() => openEdit(c)}
                        className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                      >
                        Düzenle
                      </button>
                      <button
                        onClick={() => handleDelete(c.id)}
                        className="text-red-500 hover:text-red-700 text-xs font-medium"
                      >
                        Sil
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <h2 className="text-xl font-bold text-gray-800 mb-4">
              {editItem ? "Müşteri Düzenle" : "Yeni Müşteri Ekle"}
            </h2>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                {error}
              </div>
            )}

            <div className="space-y-4 mb-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Müşteri Adı</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ad Soyad"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Telefon</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0555 000 00 00"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowForm(false)}
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

      {/* Siparişler Modal */}
      {ordersModalCustomer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-5">
              <div>
                <h2 className="text-xl font-bold text-gray-800">{ordersModalCustomer.name} — Siparişler</h2>
                {ordersModalCustomer.phone && <p className="text-xs text-gray-400 mt-0.5">{ordersModalCustomer.phone}</p>}
              </div>
              <button onClick={() => setOrdersModalCustomer(null)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {ordersLoading ? (
              <div className="py-8 text-center text-gray-400 text-sm">Yükleniyor...</div>
            ) : customerOrders.length === 0 ? (
              <div className="py-8 text-center text-gray-400 text-sm">Bu müşteriye ait sipariş bulunamadı.</div>
            ) : (
              <div className="overflow-x-auto border border-gray-100 rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-gray-600 whitespace-nowrap">Sipariş No</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600 whitespace-nowrap">Tarih</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600 whitespace-nowrap">Plaka</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600 whitespace-nowrap">Tutar</th>
                      <th className="text-center px-3 py-2 font-medium text-gray-600 whitespace-nowrap">Durum</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {customerOrders.map((o) => (
                      <tr key={o.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-mono font-semibold text-gray-800 whitespace-nowrap">#{o.id}</td>
                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{formatDate(o.created_at)}</td>
                        <td className="px-3 py-2 font-mono text-gray-700 whitespace-nowrap">{o.plate}</td>
                        <td className="px-3 py-2 text-right text-gray-700 whitespace-nowrap">
                          {formatCurrency(Number((o.paid_amount ?? o.total_amount) || 0))}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${o.status === "TAMAMLANDI" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                            {o.status === "TAMAMLANDI" ? "Tamamlandı" : "Beklemede"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <Link href={`/admin/orders/${o.id}`} className="text-blue-600 hover:text-blue-800 text-xs font-medium">
                            Detay →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <button onClick={() => setOrdersModalCustomer(null)}
              className="w-full mt-5 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg hover:bg-gray-50">
              Kapat
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
