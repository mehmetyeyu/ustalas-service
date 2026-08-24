"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

interface Service {
  id: number;
  name: string;
  duration_minutes: number | null;
}

interface Meta {
  tenant: { name: string; slug: string };
  services: Service[];
  maxDaysAhead: number;
}

// Türkiye sabit UTC+3 — sunucunun/tarayıcının kendi saat dilimine bakmadan
// bir Date'i Istanbul takvim gününe (YYYY-MM-DD) çevirir.
function toIstanbulDateStr(date: Date): string {
  return new Date(date.getTime() + 3 * 60 * 60000).toISOString().slice(0, 10);
}

function todayStr(): string {
  return toIstanbulDateStr(new Date());
}

function formatSlotTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
}

function formatDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 9, 0, 0)).toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long", timeZone: "Europe/Istanbul" });
}

export default function RandevuPage() {
  const { slug } = useParams<{ slug: string }>();
  // src/lib/embed.js bu sayfayı ?embed=1 ile açıyor — bkz. /admin/settings
  // "Embed Kodu" bölümü. Gömülü modda tam-viyport arkaplan/başlık kaldırılır
  // (firmanın kendi sitesinin içine oturması gerekiyor) ve içerik boyu
  // parent pencereye postMessage ile bildirilir (otomatik yükseklik).
  const isEmbed = useSearchParams().get("embed") === "1";
  const rootRef = useRef<HTMLDivElement>(null);

  const [meta, setMeta] = useState<Meta | null>(null);
  const [metaError, setMetaError] = useState("");
  const [loadingMeta, setLoadingMeta] = useState(true);

  const [serviceId, setServiceId] = useState<number | null>(null);
  const [date, setDate] = useState(todayStr());
  const [slots, setSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  const [plate, setPlate] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [website, setWebsite] = useState(""); // honeypot — gerçek kullanıcı görmez/doldurmaz
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [result, setResult] = useState<{ status: string } | null>(null);

  useEffect(() => {
    if (!isEmbed || !rootRef.current) return;
    const el = rootRef.current;
    const report = () => window.parent.postMessage({ type: "ustalas-randevu-resize", height: el.scrollHeight }, "*");
    const observer = new ResizeObserver(report);
    observer.observe(el);
    report();
    return () => observer.disconnect();
  }, [isEmbed]);

  useEffect(() => {
    fetch(`/api/public/randevu/${slug}/meta`)
      .then(async (res) => {
        if (!res.ok) throw new Error("not-found");
        return res.json();
      })
      .then((data: Meta) => {
        setMeta(data);
        document.title = `${data.tenant.name} — Online Randevu`;
        if (data.services.length === 1) setServiceId(data.services[0].id);
      })
      .catch(() => setMetaError("Sayfa bulunamadı."))
      .finally(() => setLoadingMeta(false));
  }, [slug]);

  useEffect(() => {
    if (!serviceId || !date) { setSlots([]); return; }
    setLoadingSlots(true);
    setSelectedSlot(null);
    fetch(`/api/public/randevu/${slug}/slots?date=${date}&service_id=${serviceId}`)
      .then((res) => res.json())
      .then((data) => setSlots(Array.isArray(data.slots) ? data.slots : []))
      .finally(() => setLoadingSlots(false));
  }, [slug, serviceId, date]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSlot) return;
    setSubmitError("");
    setSubmitting(true);
    try {
      const res = await fetch(`/api/public/randevu/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plate: plate.replace(/\s+/g, "").toUpperCase(),
          customer_name: customerName.trim() || null,
          customer_phone: customerPhone.trim(),
          service_id: serviceId,
          requested_at: selectedSlot,
          website,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Talep gönderilemedi.");
      setResult({ status: data.status });
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "Bir hata oluştu.");
    } finally {
      setSubmitting(false);
    }
  }

  const heightClass = isEmbed ? "" : "min-h-screen";

  if (loadingMeta) {
    return <div ref={rootRef} className={`${heightClass} flex items-center justify-center text-gray-400 text-sm py-10`}>Yükleniyor...</div>;
  }
  if (metaError || !meta) {
    return <div ref={rootRef} className={`${heightClass} flex items-center justify-center text-gray-500 text-sm py-10`}>Sayfa bulunamadı.</div>;
  }

  if (result) {
    return (
      <div ref={rootRef} className={`${heightClass} flex items-center justify-center p-6`}>
        <div className="max-w-sm w-full bg-white rounded-xl shadow-sm border border-gray-200 p-6 text-center">
          <div className="text-4xl mb-3">{result.status === "ONAYLANDI" ? "✅" : "🕐"}</div>
          <h1 className="text-lg font-bold text-gray-800 mb-2">
            {result.status === "ONAYLANDI" ? "Randevunuz onaylandı" : "Talebiniz alındı"}
          </h1>
          <p className="text-sm text-gray-500">
            {result.status === "ONAYLANDI"
              ? `${meta.tenant.name} sizi bekliyor.`
              : `${meta.tenant.name} talebinizi onayladığında bilgilendirileceksiniz.`}
          </p>
        </div>
      </div>
    );
  }

  const noBookableServices = meta.services.length === 0;

  return (
    <div ref={rootRef} className={isEmbed ? "bg-gray-50 py-4 px-4" : "min-h-screen bg-gray-50 py-8 px-4"}>
      <div className="max-w-md mx-auto">
        {!isEmbed && (
          <>
            <h1 className="text-xl font-bold text-gray-800 mb-1">{meta.tenant.name}</h1>
            <p className="text-sm text-gray-500 mb-6">Online Randevu</p>
          </>
        )}

        {noBookableServices ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 text-sm text-gray-500">
            Şu an online randevu alınamıyor.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex flex-col gap-4">
            {/* Honeypot — CSS ile gizli, ekran okuyucular için de erişilemez alanda; bot'lar genelde doldurur */}
            <input
              type="text"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
              className="hidden"
              aria-hidden="true"
            />

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Hizmet <span className="text-red-500">*</span></label>
              <select
                value={serviceId ?? ""}
                onChange={(e) => setServiceId(e.target.value ? Number(e.target.value) : null)}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Seçiniz...</option>
                {meta.services.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tarih <span className="text-red-500">*</span></label>
              <input
                type="date"
                value={date}
                min={todayStr()}
                max={toIstanbulDateStr(new Date(Date.now() + meta.maxDaysAhead * 24 * 60 * 60000))}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {date && <p className="mt-1 text-xs text-gray-400">{formatDateLabel(date)}</p>}
            </div>

            {serviceId && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Müsait Saatler <span className="text-red-500">*</span></label>
                {loadingSlots ? (
                  <p className="text-sm text-gray-400">Müsaitlik kontrol ediliyor...</p>
                ) : slots.length === 0 ? (
                  <p className="text-sm text-gray-400">Bu tarihte müsait saat yok, başka bir tarih deneyin.</p>
                ) : (
                  <div className="grid grid-cols-4 gap-2 max-h-64 overflow-y-auto">
                    {slots.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSelectedSlot(s)}
                        className={`text-center px-2 py-2 rounded-lg text-sm border transition-colors ${
                          selectedSlot === s
                            ? "bg-blue-600 border-blue-600 text-white font-medium"
                            : "border-gray-300 text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        {formatSlotTime(s)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {selectedSlot && (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Ad Soyad <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    required
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Araç Plakası <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={plate}
                    onChange={(e) => setPlate(e.target.value.replace(/\s+/g, ""))}
                    required
                    placeholder="34 ABC 123"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Telefon <span className="text-red-500">*</span></label>
                  <input
                    type="tel"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    required
                    placeholder="05XX XXX XX XX"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {submitError && <p className="text-sm text-red-600">{submitError}</p>}

                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-lg px-4 py-2.5 text-sm"
                >
                  {submitting ? "Gönderiliyor..." : "Randevu Talebi Gönder"}
                </button>
                <p className="text-xs text-gray-400 text-center">
                  Bu formu göndererek kişisel verilerinizin randevu talebinizin işlenmesi
                  amacıyla kullanılmasını kabul edersiniz. <a href="#" className="underline">Aydınlatma Metni</a>
                </p>
              </>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
