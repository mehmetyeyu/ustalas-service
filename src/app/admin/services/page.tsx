"use client";

import { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/format";

interface Service {
  id: number;
  name: string;
  price: number;
  is_active: number;
}

export default function ServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editSvc, setEditSvc] = useState<Service | null>(null);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function fetchServices() {
    const res = await fetch("/api/services");
    const data = await res.json();
    setServices(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => {
    fetchServices();
  }, []);

  function openNew() {
    setEditSvc(null);
    setName("");
    setPrice("");
    setError("");
    setShowForm(true);
  }

  function openEdit(svc: Service) {
    setEditSvc(svc);
    setName(svc.name);
    setPrice(String(svc.price));
    setError("");
    setShowForm(true);
  }

  async function handleSave() {
    setError("");
    if (!name.trim() || !price) {
      setError("Ad ve fiyat zorunludur.");
      return;
    }
    setSaving(true);
    try {
      if (editSvc) {
        const res = await fetch(`/api/services/${editSvc.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), price: parseFloat(price), is_active: editSvc.is_active }),
        });
        if (!res.ok) throw new Error("Güncelleme başarısız.");
      } else {
        const res = await fetch("/api/services", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), price: parseFloat(price) }),
        });
        if (!res.ok) throw new Error("Ekleme başarısız.");
      }
      setShowForm(false);
      await fetchServices();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Hata oluştu.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Bu hizmeti devre dışı bırakmak istediğinize emin misiniz?")) return;
    await fetch(`/api/services/${id}`, { method: "DELETE" });
    await fetchServices();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Hizmet Yönetimi</h1>
        <button
          onClick={openNew}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors"
        >
          + Yeni Hizmet
        </button>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-12">Yükleniyor...</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Hizmet Adı</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Fiyat</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {services.map((svc) => (
                <tr key={svc.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{svc.name}</td>
                  <td className="px-4 py-3 text-right text-gray-700">
                    {formatCurrency(svc.price)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => openEdit(svc)}
                        className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                      >
                        Düzenle
                      </button>
                      <button
                        onClick={() => handleDelete(svc.id)}
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

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <h2 className="text-xl font-bold text-gray-800 mb-4">
              {editSvc ? "Hizmet Düzenle" : "Yeni Hizmet Ekle"}
            </h2>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                {error}
              </div>
            )}

            <div className="space-y-4 mb-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Hizmet Adı</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Rot Ayarı"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fiyat (₺)</label>
                <input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="500"
                  min="0"
                  step="0.01"
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
    </div>
  );
}
