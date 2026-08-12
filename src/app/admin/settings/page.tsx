"use client";

import { useEffect, useState } from "react";
import { Tooltip } from "@/components/Tooltip";
import { PROTECTED_PAYMENT_TYPES } from "@/lib/paymentTypes";

export default function GeneralSettingsPage() {
  const [businessName, setBusinessName] = useState("");
  const [overdueMonths, setOverdueMonths] = useState("6");
  const [paymentTypes, setPaymentTypes] = useState<string[]>([]);
  const [newPaymentType, setNewPaymentType] = useState("");
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
        setPaymentTypes(Array.isArray(data.payment_types) ? data.payment_types : []);
        setLoading(false);
      });
  }, []);

  function addPaymentType() {
    const v = newPaymentType.trim();
    if (!v || paymentTypes.includes(v)) { setNewPaymentType(""); return; }
    setPaymentTypes([...paymentTypes, v]);
    setNewPaymentType("");
  }

  function removePaymentType(v: string) {
    if (PROTECTED_PAYMENT_TYPES.includes(v)) return;
    setPaymentTypes(paymentTypes.filter((t) => t !== v));
  }

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
    if (paymentTypes.length === 0) {
      setError("En az bir ödeme şekli tanımlı olmalıdır.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_name: businessName.trim(),
          storage_overdue_months: months,
          payment_types: paymentTypes,
        }),
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

      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
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

        <div>
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
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Ödeme Şekilleri</h2>

        <div className="mb-4 p-3 bg-amber-50 border border-amber-300 rounded-lg text-amber-800 text-xs leading-relaxed">
          Bu listeyi değiştirirseniz şunlar etkilenir: sipariş kapatma/düzenleme ekranındaki ödeme
          seçenekleri, ve Excel&apos;den sipariş içe aktarımında listede olmayan bir değerin otomatik
          olarak &quot;… Mail Order&quot; sayılması. Geçmiş sipariş kayıtları etkilenmez — orada
          zaten girilmiş olan ödeme şekli metni olduğu gibi kalır.
        </div>

        <div className="flex flex-wrap gap-2 mb-3">
          {paymentTypes.map((t) => {
            const protectedType = PROTECTED_PAYMENT_TYPES.includes(t);
            return (
              <span
                key={t}
                className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-700 bg-gray-50"
              >
                {t}
                {protectedType ? (
                  <Tooltip text="Genel bir ödeme tipi olduğu için kaldırılamaz.">
                    <span className="text-gray-300 leading-none cursor-help">🔒</span>
                  </Tooltip>
                ) : (
                  <button
                    type="button"
                    onClick={() => removePaymentType(t)}
                    className="text-gray-400 hover:text-red-600 leading-none"
                    title={`${t}'yi kaldır`}
                  >
                    ×
                  </button>
                )}
              </span>
            );
          })}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={newPaymentType}
            onChange={(e) => setNewPaymentType(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPaymentType(); } }}
            placeholder="Yeni ödeme şekli..."
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={addPaymentType}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Ekle
          </button>
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-2.5 rounded-lg transition-colors"
      >
        {saving ? "Kaydediliyor..." : "Kaydet"}
      </button>
    </div>
  );
}
