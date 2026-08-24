"use client";

import { useEffect, useState } from "react";

interface DayWindow { open: string; close: string; }
type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
type WorkingHours = Partial<Record<DayKey, DayWindow | null>>;

const DAYS: { key: DayKey; label: string }[] = [
  { key: "mon", label: "Pazartesi" },
  { key: "tue", label: "Salı" },
  { key: "wed", label: "Çarşamba" },
  { key: "thu", label: "Perşembe" },
  { key: "fri", label: "Cuma" },
  { key: "sat", label: "Cumartesi" },
  { key: "sun", label: "Pazar" },
];

function CopyBox({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* pano izni yoksa sessizce yoksay — kutudan elle seçip kopyalanabilir */ }
  }
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-gray-600">{label}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="text-xs font-medium text-blue-600 hover:text-blue-800"
        >
          {copied ? "Kopyalandı ✓" : "Kopyala"}
        </button>
      </div>
      <textarea
        readOnly
        value={value}
        onFocus={(e) => e.target.select()}
        rows={2}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono bg-gray-50 text-gray-700 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}

// Genel Ayarlar'dan ayrı bir sayfa — bu bölüm büyüdükçe (kapasite, çalışma
// saatleri, embed kodu) tek sayfada kalabalık oluyordu. Diğer ayarlarla
// (business_name, payment_types) aynı app_settings satırını paylaştığı için
// kaydederken GET ile önce tüm ayarlar çekilip, sadece booking_* alanları
// değiştirilip PUT'a geri gönderiliyor — böylece bu sayfa Genel Ayarlar'daki
// alanları etkilemiyor.
export default function AppointmentSettingsPage() {
  const [businessName, setBusinessName] = useState("");
  const [overdueMonths, setOverdueMonths] = useState("6");
  const [paymentTypes, setPaymentTypes] = useState<string[]>([]);
  const [bookingCapacity, setBookingCapacity] = useState("1");
  const [workingHours, setWorkingHours] = useState<WorkingHours>({});
  const [autoApprove, setAutoApprove] = useState(false);
  const [maxDaysAhead, setMaxDaysAhead] = useState("30");
  const [slug, setSlug] = useState("");
  const [origin, setOrigin] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
    fetch("/api/settings", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        setBusinessName(data.business_name ?? "");
        setOverdueMonths(String(data.storage_overdue_months ?? 6));
        setPaymentTypes(Array.isArray(data.payment_types) ? data.payment_types : []);
        setBookingCapacity(String(data.booking_capacity ?? 1));
        setWorkingHours(data.booking_working_hours ?? {});
        setAutoApprove(!!data.booking_auto_approve);
        setMaxDaysAhead(String(data.booking_max_days_ahead ?? 30));
        setSlug(data.slug ?? "");
        setLoading(false);
      });
  }, []);

  function toggleDay(key: DayKey) {
    setWorkingHours((prev) => ({
      ...prev,
      [key]: prev[key] ? null : { open: "09:00", close: "18:00" },
    }));
  }

  function updateDayTime(key: DayKey, field: "open" | "close", value: string) {
    setWorkingHours((prev) => {
      const current = prev[key];
      if (!current) return prev;
      return { ...prev, [key]: { ...current, [field]: value } };
    });
  }

  async function handleSave() {
    setError("");
    setSuccess(false);

    const daysAhead = Number(maxDaysAhead);
    if (!Number.isInteger(daysAhead) || daysAhead < 1 || daysAhead > 365) {
      setError("İleri randevu süresi 1-365 gün arasında olmalıdır.");
      return;
    }
    const capacity = Number(bookingCapacity);
    if (!Number.isInteger(capacity) || capacity < 1) {
      setError("Kapasite en az 1 olmalıdır.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_name: businessName,
          storage_overdue_months: Number(overdueMonths),
          payment_types: paymentTypes,
          booking_capacity: capacity,
          booking_working_hours: workingHours,
          booking_auto_approve: autoApprove,
          booking_max_days_ahead: daysAhead,
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
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Randevu Ayarları</h1>

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

        <p className="text-xs text-gray-400 mb-5">
          /randevu sayfasından gelen online randevu taleplerini etkiler. Hangi hizmetlerin
          randevuya açık olduğunu Hizmetler sayfasından ayarlayabilirsiniz.
        </p>

        <div className="mb-5">
          <label className="block text-sm font-medium text-gray-700 mb-1">Kapasite</label>
          <input
            type="number"
            min={1}
            value={bookingCapacity}
            onChange={(e) => setBookingCapacity(e.target.value)}
            className="w-32 border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-400 mt-1">Aynı anda kabul edilecek randevu sayısı.</p>
        </div>

        <div className="mb-5">
          <label className="block text-sm font-medium text-gray-700 mb-1">İleri Randevu Süresi (gün)</label>
          <input
            type="number"
            min={1}
            max={365}
            value={maxDaysAhead}
            onChange={(e) => setMaxDaysAhead(e.target.value)}
            className="w-32 border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-400 mt-1">
            Müşteriler en fazla bu kadar gün ileriye randevu alabilir. Düşük tutmak
            (30 gün gibi) kötüye kullanımı da sınırlar.
          </p>
        </div>

        <div className="mb-5">
          <label className="block text-sm font-medium text-gray-700 mb-2">Çalışma Saatleri</label>
          <div className="flex flex-col gap-2">
            {DAYS.map((d) => {
              const window = workingHours[d.key];
              return (
                <div key={d.key} className="flex items-center gap-3">
                  <label className="flex items-center gap-2 w-32 shrink-0 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!window}
                      onChange={() => toggleDay(d.key)}
                      className="w-4 h-4 accent-blue-600"
                    />
                    {d.label}
                  </label>
                  {window ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        value={window.open}
                        onChange={(e) => updateDayTime(d.key, "open", e.target.value)}
                        className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-gray-400 text-sm">–</span>
                      <input
                        type="time"
                        value={window.close}
                        onChange={(e) => updateDayTime(d.key, "close", e.target.value)}
                        className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  ) : (
                    <span className="text-sm text-gray-400">Kapalı</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={autoApprove}
            onChange={(e) => setAutoApprove(e.target.checked)}
            className="w-4 h-4 accent-blue-600"
          />
          Randevuları otomatik onayla
        </label>
        <p className="text-xs text-gray-400 mt-1 ml-6">
          Kapalıysa (önerilen) gelen talepler Randevular sayfasında onayınızı bekler.
        </p>

        {slug && origin && (
          <div className="mt-6 pt-5 border-t border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700 mb-1">Web Sitenize Ekleyin</h3>
            <p className="text-xs text-gray-400 mb-3">
              Randevu formunu kendi web sitenize, Google Haritalar gibi gömebilirsiniz —
              aşağıdaki kodlardan birini sitenize yapıştırmanız yeterli.
            </p>
            <CopyBox label="Doğrudan link" value={`${origin}/randevu/${slug}`} />
            <CopyBox
              label="Script ile göm (önerilen — otomatik boy ayarlar)"
              value={`<script src="${origin}/embed.js" data-slug="${slug}"></script>`}
            />
            <CopyBox
              label="veya iframe ile göm"
              value={`<iframe src="${origin}/randevu/${slug}?embed=1" style="width:100%;max-width:480px;height:700px;border:none" title="Online Randevu"></iframe>`}
            />
          </div>
        )}
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
