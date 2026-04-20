"use client";

import { useEffect, useState } from "react";

interface Service {
  id: number;
  name: string;
  price: number;
}

export default function OrderPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [plate, setPlate] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/services")
      .then((r) => r.json())
      .then(setServices)
      .catch(() => setError("Hizmetler yüklenemedi."));
  }, []);

  const total = services
    .filter((s) => selectedIds.includes(s.id))
    .reduce((sum, s) => sum + Number(s.price), 0);

  function toggleService(id: number) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!plate.trim()) {
      setError("Araç plakası zorunludur.");
      return;
    }
    if (selectedIds.length === 0) {
      setError("En az bir hizmet seçiniz.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plate: plate.trim().toUpperCase(),
          customer_name: customerName.trim() || null,
          customer_phone: customerPhone.trim() || null,
          notes: notes.trim() || null,
          service_ids: selectedIds,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Hata oluştu.");
      }

      setSuccess(true);
      setPlate("");
      setCustomerName("");
      setCustomerPhone("");
      setNotes("");
      setSelectedIds([]);

      setTimeout(() => setSuccess(false), 5000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Hata oluştu.");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/admin/login";
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Lastik Servis</h1>
              <p className="text-gray-500 text-sm mt-1">Yeni Sipariş Oluştur</p>
            </div>
            <button
              onClick={handleLogout}
              className="text-sm text-gray-400 hover:text-gray-700 transition-colors"
            >
              Çıkış
            </button>
          </div>

          {success && (
            <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 text-center font-medium">
              Sipariş başarıyla kaydedildi!
            </div>
          )}

          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-center">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Araç Plakası <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={plate}
                onChange={(e) => setPlate(e.target.value)}
                placeholder="34 ABC 123"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-lg font-mono uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Müşteri Adı
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Ad Soyad"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Telefon
                </label>
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="0555 000 00 00"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Hizmet Seçimi <span className="text-red-500">*</span>
              </label>
              <div className="space-y-2">
                {services.map((svc) => {
                  const selected = selectedIds.includes(svc.id);
                  return (
                    <label
                      key={svc.id}
                      className={`flex items-center justify-between p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                        selected
                          ? "border-blue-500 bg-blue-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleService(svc.id)}
                          className="w-4 h-4 accent-blue-500"
                        />
                        <span className="font-medium text-gray-800">{svc.name}</span>
                      </div>
                      <span className="text-blue-600 font-semibold">
                        {Number(svc.price).toLocaleString("tr-TR")} ₺
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notlar
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ek notlar..."
                rows={3}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            {selectedIds.length > 0 && (
              <div className="bg-gray-50 rounded-lg p-3 flex justify-between items-center">
                <span className="text-gray-600 font-medium">Toplam Tutar:</span>
                <span className="text-xl font-bold text-green-600">
                  {total.toLocaleString("tr-TR")} ₺
                </span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-3 rounded-lg transition-colors text-lg"
            >
              {loading ? "Kaydediliyor..." : "Sipariş Oluştur"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
