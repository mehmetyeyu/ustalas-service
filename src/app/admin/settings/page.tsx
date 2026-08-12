"use client";

import { useEffect, useState } from "react";

export default function GeneralSettingsPage() {
  const [businessName, setBusinessName] = useState("");
  const [overdueMonths, setOverdueMonths] = useState("6");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetch("/api/settings", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        setBusinessName(data.business_name ?? "");
        setOverdueMonths(String(data.storage_overdue_months ?? 6));
        setLoading(false);
      });
  }, []);

  async function handleSave() {
    setError("");
    setSuccess(false);

    if (!businessName.trim()) {
      setError("İşletme adı zorunludur.");
      return;
    }
    const months = Number(overdueMonths);
    if (!Number.isInteger(months) || months < 1 || months > 60) {
      setError("Depo bekleme uyarı eşiği 1-60 ay arasında olmalıdır.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business_name: businessName.trim(), storage_overdue_months: months }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Ayarlar kaydedilemedi.");
      setSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Hata oluştu.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="text-center text-gray-400 py-12">Yükleniyor...</div>;
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Genel Ayarlar</h1>

      <div className="bg-white rounded-xl shadow-sm p-6">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
            Ayarlar başarıyla kaydedildi.
          </div>
        )}

        <div className="mb-5">
          <label className="block text-sm font-medium text-gray-700 mb-1">İşletme Adı</label>
          <input
            type="text"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="mb-5">
          <label className="block text-sm font-medium text-gray-700 mb-1">Depoda Bekleme Uyarı Eşiği (ay)</label>
          <input
            type="number"
            min={1}
            max={60}
            value={overdueMonths}
            onChange={(e) => setOverdueMonths(e.target.value)}
            className="w-32 border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-400 mt-1">
            Depolama listesinde bu süreden uzun süredir bekleyen lastikler uyarı olarak vurgulanır.
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-2.5 rounded-lg transition-colors"
        >
          {saving ? "Kaydediliyor..." : "Kaydet"}
        </button>
      </div>
    </div>
  );
}
