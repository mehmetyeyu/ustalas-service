"use client";

import { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/format";
import { useViewGuard, usePermission } from "../AuthContext";
import { useToast } from "@/components/ToastProvider";

interface Service {
  id: number;
  name: string;
  price: number | null;
  is_active: number;
  bookable: boolean;
  duration_minutes: number | null;
}

export default function ServicesPage() {
  const toast = useToast();
  const allowed = useViewGuard("services");
  const canCreate = usePermission("services.create");
  const canEdit = usePermission("services.edit");
  const canDelete = usePermission("services.delete");
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editSvc, setEditSvc] = useState<Service | null>(null);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [bookable, setBookable] = useState(false);
  const [duration, setDuration] = useState("");
  const [saving, setSaving] = useState(false);

  async function fetchServices() {
    // GET /api/services tarayıcı önbelleğine izin verir (Cache-Control) — bu
    // yönetim ekranı bir ekleme/düzenleme/silmeden hemen sonra her zaman güncel
    // veriyi göstermeli, o yüzden önbellek burada devre dışı bırakılır.
    const res = await fetch("/api/services", { cache: "no-store" });
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
    setBookable(false);
    setDuration("");
    setShowForm(true);
  }

  function openEdit(svc: Service) {
    setEditSvc(svc);
    setName(svc.name);
    setPrice(svc.price != null ? String(svc.price) : "");
    setBookable(svc.bookable);
    setDuration(svc.duration_minutes != null ? String(svc.duration_minutes) : "");
    setShowForm(true);
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Hizmet adı zorunludur.");
      return;
    }
    const priceValue = price.trim() ? parseFloat(price) : null;
    const durationValue = duration.trim() ? parseInt(duration, 10) : null;
    setSaving(true);
    try {
      if (editSvc) {
        const res = await fetch(`/api/services/${editSvc.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), price: priceValue, is_active: editSvc.is_active, bookable, duration_minutes: durationValue }),
        });
        if (!res.ok) throw new Error("Güncelleme başarısız.");
      } else {
        const res = await fetch("/api/services", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), price: priceValue, bookable, duration_minutes: durationValue }),
        });
        if (!res.ok) throw new Error("Ekleme başarısız.");
      }
      setShowForm(false);
      await fetchServices();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Hata oluştu.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Bu hizmeti devre dışı bırakmak istediğinize emin misiniz?")) return;
    await fetch(`/api/services/${id}`, { method: "DELETE" });
    await fetchServices();
  }

  if (!allowed) return null;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Hizmet Yönetimi</h1>
        {canCreate && (
          <button
            onClick={openNew}
            className="self-start sm:self-auto bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors"
          >
            + Yeni Hizmet
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-12">Yükleniyor...</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Hizmet Adı</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Fiyat</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Randevu</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {services.map((svc) => (
                  <tr key={svc.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{svc.name}</td>
                    <td className="px-4 py-3 text-right text-gray-700 whitespace-nowrap">
                      {svc.price != null ? formatCurrency(svc.price) : <span className="text-gray-400">Fiyat girilmemiş</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {svc.bookable ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                          Açık{svc.duration_minutes ? ` · ${svc.duration_minutes} dk` : ""}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">Kapalı</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-0.5 sm:gap-3 whitespace-nowrap">
                        {canEdit && (
                          <button
                            onClick={() => openEdit(svc)}
                            title="Düzenle"
                            aria-label="Düzenle"
                            className="flex items-center gap-1 p-1 sm:p-0 rounded text-blue-600 hover:bg-blue-50 sm:hover:bg-transparent hover:text-blue-800 text-xs font-medium"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.5 19.5H4.5" />
                            </svg>
                            <span className="hidden sm:inline">Düzenle</span>
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => handleDelete(svc.id)}
                            title="Sil"
                            aria-label="Sil"
                            className="flex items-center gap-1 p-1 sm:p-0 rounded text-red-500 hover:bg-red-50 sm:hover:bg-transparent hover:text-red-700 text-xs font-medium"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>
                            <span className="hidden sm:inline">Sil</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <h2 className="text-xl font-bold text-gray-800 mb-4">
              {editSvc ? "Hizmet Düzenle" : "Yeni Hizmet Ekle"}
            </h2>

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
                <label className="block text-sm font-medium text-gray-700 mb-1">Fiyat (₺) <span className="text-gray-400 font-normal">(opsiyonel)</span></label>
                <input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="Boş bırakılırsa siparişte elle girilir"
                  min="0"
                  step="0.01"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="border-t border-gray-100 pt-4">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bookable}
                    onChange={(e) => setBookable(e.target.checked)}
                    className="w-4 h-4 accent-blue-600"
                  />
                  Online Randevuya Aç
                </label>
                {bookable && (
                  <div className="mt-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Süre (dakika)</label>
                    <input
                      type="number"
                      value={duration}
                      onChange={(e) => setDuration(e.target.value)}
                      placeholder="30"
                      min="1"
                      step="1"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}
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
