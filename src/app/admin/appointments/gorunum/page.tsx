"use client";

import { useEffect, useRef, useState } from "react";

type Preset = "card" | "seamless" | "outlined";
type PreviewWidth = "mobile" | "tablet" | "desktop";

const PRESETS: { value: Preset; label: string; description: string }[] = [
  { value: "card", label: "Kart", description: "Beyaz kart, gölge ve kenarlık — varsayılan." },
  { value: "seamless", label: "Sade", description: "Arka plan/kenarlık yok, sitenize gömülü gibi görünür." },
  { value: "outlined", label: "Çerçeveli", description: "İnce kenarlık, düz köşeler — daha sade bir görünüm." },
];

// Form bir iframe içinde gömülü olduğundan bu seviyeler ziyaretçinin GERÇEK
// cihazını değil, formun gömüldüğü kapsayıcının genişliğini temsil ediyor —
// bkz. randevu/[slug]/page.tsx'teki TABLET_COLS/DESKTOP_COLS (Tailwind'in
// sm=640px / lg=1024px kırılım noktalarıyla birebir eşleşir). Mobil her
// zaman tek kolon (form zaten en dar cihazda tek sütuna sığacak kadar sade,
// ayarlanamaz) — bu yüzden burada sadece Tablet (1-2) ve Masaüstü (1-3) var.
const COLUMN_TIERS: { key: "columnsTablet" | "columnsDesktop"; label: string; hint: string; previewWidth: PreviewWidth; options: number[] }[] = [
  { key: "columnsTablet", label: "Tablet", hint: "640–1023px", previewWidth: "tablet", options: [1, 2] },
  { key: "columnsDesktop", label: "Masaüstü", hint: "≥ 1024px", previewWidth: "desktop", options: [1, 2, 3] },
];

const PREVIEW_WIDTHS: { value: PreviewWidth; label: string; width: number }[] = [
  { value: "mobile", label: "Mobil", width: 375 },
  { value: "tablet", label: "Tablet", width: 768 },
  { value: "desktop", label: "Masaüstü", width: 1200 },
];

export default function AppointmentAppearancePage() {
  // Genel ayarlarla (business_name, payment_types vb.) aynı app_settings
  // satırını paylaştığımız için — bkz. Randevu Ayarları sayfasındaki aynı
  // desen — GET ile önce tüm ayarlar çekilip sadece görünüm alanları
  // değiştirilip PUT'a geri gönderiliyor.
  const [businessName, setBusinessName] = useState("");
  const [overdueMonths, setOverdueMonths] = useState(6);
  const [paymentTypes, setPaymentTypes] = useState<string[]>([]);
  const [bookingCapacity, setBookingCapacity] = useState(1);
  const [workingHours, setWorkingHours] = useState<unknown>(null);
  const [autoApprove, setAutoApprove] = useState(false);
  const [maxDaysAhead, setMaxDaysAhead] = useState(30);

  const [preset, setPreset] = useState<Preset>("card");
  const [accentColor, setAccentColor] = useState("#2563eb");
  const [columnsTablet, setColumnsTablet] = useState(1);
  const [columnsDesktop, setColumnsDesktop] = useState(1);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [showHeadingEmbed, setShowHeadingEmbed] = useState(false);

  const [slug, setSlug] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [previewWidth, setPreviewWidth] = useState<PreviewWidth>("mobile");
  // Tablet/Masaüstü genişliği çoğu zaman sağdaki panelden daha geniş olduğu
  // için iframe'i olduğu gibi koymak onu panelden taşırıp kırpar (kaydırma
  // çubuğu belli olmadığından kullanıcı hiçbir değişiklik göremez — bu
  // gerçek bir kullanıcı raporuyla ortaya çıktı). Bunun yerine tarayıcıların
  // cihaz araç çubuğu gibi, iframe'i gerçek genişliğinde render edip
  // panele SIĞACAK şekilde CSS transform: scale() ile küçültüyoruz —
  // hiçbir şey kırpılmaz, her şey her zaman görünür.
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [previewScale, setPreviewScale] = useState(1);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const previewReadyRef = useRef(false);

  const columnValues: Record<"columnsTablet" | "columnsDesktop", number> = { columnsTablet, columnsDesktop };
  const columnSetters: Record<"columnsTablet" | "columnsDesktop", (v: number) => void> = {
    columnsTablet: setColumnsTablet, columnsDesktop: setColumnsDesktop,
  };

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetch("/api/settings", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        setBusinessName(data.business_name ?? "");
        setOverdueMonths(data.storage_overdue_months ?? 6);
        setPaymentTypes(Array.isArray(data.payment_types) ? data.payment_types : []);
        setBookingCapacity(data.booking_capacity ?? 1);
        setWorkingHours(data.booking_working_hours ?? null);
        setAutoApprove(!!data.booking_auto_approve);
        setMaxDaysAhead(data.booking_max_days_ahead ?? 30);
        setPreset(data.booking_widget_preset ?? "card");
        setAccentColor(data.booking_widget_accent_color ?? "#2563eb");
        setColumnsTablet(data.booking_widget_columns_tablet ?? 1);
        setColumnsDesktop(data.booking_widget_columns_desktop ?? 1);
        setTitle(data.booking_widget_title ?? "");
        setDescription(data.booking_widget_description ?? "");
        setShowHeadingEmbed(!!data.booking_widget_show_heading_embed);
        setSlug(data.slug ?? "");
        setTenantName(data.business_name ?? "");
        setLoading(false);
      });
  }, []);

  // Sağdaki önizleme iframe'i /randevu/[slug]?embed=1 sayfasının KENDİSİ —
  // henüz kaydedilmemiş taslak değerleri bu sayfaya postMessage ile
  // gönderiyoruz, o da kaydetmeden anlık olarak uyguluyor (bkz. o sayfadaki
  // "ustalas-randevu-preview-style" dinleyicisi, sadece aynı origin'den gelen
  // mesajları kabul ediyor). İframe kendi sayfası yüklenip listener'ını
  // kurunca bize "ustalas-randevu-preview-ready" ile haber veriyor — mesajı
  // ondan önce göndermek kaybolurdu.
  function sendPreview() {
    if (!previewReadyRef.current || !iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage(
      {
        type: "ustalas-randevu-preview-style",
        style: {
          preset,
          accentColor,
          columnsTablet,
          columnsDesktop,
          title: title || null,
          description: description || null,
          showHeadingInEmbed: showHeadingEmbed,
        },
      },
      window.location.origin
    );
  }

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "ustalas-randevu-preview-ready") {
        previewReadyRef.current = true;
        sendPreview();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  useEffect(() => {
    sendPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, accentColor, columnsTablet, columnsDesktop, title, description, showHeadingEmbed]);

  // Görünür panel, simüle edilen genişlikten (ör. 1200px masaüstü) dar
  // olduğunda iframe'i panele sığacak şekilde küçültür — panel yeniden
  // boyutlanınca (pencere genişliği değişince, lg: kırılım noktası
  // devreye girince) da yeniden hesaplanır.
  useEffect(() => {
    const el = previewContainerRef.current;
    if (!el) return;
    const targetWidth = PREVIEW_WIDTHS.find((w) => w.value === previewWidth)!.width;
    function recompute() {
      const available = el!.clientWidth;
      setPreviewScale(available > 0 ? Math.min(1, available / targetWidth) : 1);
    }
    recompute();
    const observer = new ResizeObserver(recompute);
    observer.observe(el);
    return () => observer.disconnect();
  }, [previewWidth]);

  async function handleSave() {
    setError("");
    setSuccess(false);

    if (!/^#[0-9a-fA-F]{6}$/.test(accentColor)) {
      setError("Geçerli bir renk kodu seçin.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_name: businessName,
          storage_overdue_months: overdueMonths,
          payment_types: paymentTypes,
          booking_capacity: bookingCapacity,
          booking_working_hours: workingHours,
          booking_auto_approve: autoApprove,
          booking_max_days_ahead: maxDaysAhead,
          booking_widget_preset: preset,
          booking_widget_accent_color: accentColor,
          booking_widget_columns_tablet: columnsTablet,
          booking_widget_columns_desktop: columnsDesktop,
          booking_widget_title: title.trim() || null,
          booking_widget_description: description.trim() || null,
          booking_widget_show_heading_embed: showHeadingEmbed,
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
    <div className="max-w-[1700px]">
      <h1 className="text-2xl font-bold text-gray-800 mb-1">Randevu Görünümü</h1>
      <p className="text-sm text-gray-400 mb-6">
        Randevu formunun (/randevu/{slug || "..."}) kendi web sitenize gömüldüğünde nasıl göründüğünü ayarlayın.
      </p>

      {/* Önizleme paneli sabit yarı-sayfa genişliğinde kalırsa Tablet/Masaüstü
          simülasyonu her zaman küçültülüp göstermek zorunda kalır — burada
          ayarlar sabit dar bir sütun, önizleme ise kalan TÜM genişliği alıyor
          ki 768/1200px'lik simülasyon gerçek boyuta yakın/aynı görünsün. */}
      <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-6 items-start">
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
            <label className="block text-sm font-medium text-gray-700 mb-2">Görünüm Stili</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPreset(p.value)}
                  className={`text-left p-3 rounded-lg border transition-colors ${
                    preset === p.value ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <div className="text-sm font-medium text-gray-800">{p.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{p.description}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="mb-5">
            <label className="block text-sm font-medium text-gray-700 mb-1">Vurgu Rengi</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                className="w-10 h-10 rounded border border-gray-300 cursor-pointer"
              />
              <input
                type="text"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                className="w-28 border border-gray-300 rounded-lg px-2 py-1.5 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">Buton, seçili saat ve odak halkalarında kullanılır.</p>
          </div>

          <div className="mb-5">
            <label className="block text-sm font-medium text-gray-700 mb-1">Kolon Sayısı</label>
            <p className="text-xs text-gray-400 mb-2">
              Mobil her zaman tek kolon (form zaten en dar cihaza göre sade). Tablet ve masaüstü için
              ayrı ayrı seçin — bir katmana dokununca sağdaki önizleme de o genişliğe geçer, değişikliği
              hemen görürsünüz.
            </p>
            <div className="mb-2">
              <div className="text-xs font-medium text-gray-500 mb-1">Mobil <span className="text-gray-400">(&lt; 640px)</span></div>
              <div className="px-2 py-1.5 rounded-lg border border-gray-100 bg-gray-50 text-xs font-medium text-gray-400 w-fit">
                Tek Kolon (sabit)
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {COLUMN_TIERS.map((tier) => (
                <div key={tier.key}>
                  <div className="text-xs font-medium text-gray-500 mb-1">{tier.label} <span className="text-gray-400">({tier.hint})</span></div>
                  <div className="flex gap-1">
                    {tier.options.map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => { columnSetters[tier.key](v); setPreviewWidth(tier.previewWidth); }}
                        className={`flex-1 px-2 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                          columnValues[tier.key] === v ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        {v} Kolon
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mb-5">
            <label className="block text-sm font-medium text-gray-700 mb-1">Başlık</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={tenantName || "Firma adı"}
              maxLength={120}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="mb-5">
            <label className="block text-sm font-medium text-gray-700 mb-1">Açıklama</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Online Randevu"
              maxLength={300}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400 mt-1">Boş bırakılırsa firma adı ve &quot;Online Randevu&quot; kullanılır.</p>
          </div>

          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={showHeadingEmbed}
              onChange={(e) => setShowHeadingEmbed(e.target.checked)}
              className="w-4 h-4 accent-blue-600"
            />
            Sitenize gömülüyken de başlık/açıklamayı göster
          </label>
          <p className="text-xs text-gray-400 mt-1 ml-6">
            Kapalıysa (önerilen) siteye gömülü halde başlık gösterilmez — sitenizin kendi bağlamı zaten yeterli kabul edilir.
          </p>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full mt-6 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-2.5 rounded-lg transition-colors"
          >
            {saving ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </div>

        {/* min-w-0: grid-cols-[420px_1fr]'deki 1fr, Tailwind'in hazır
            grid-cols-N sınıflarının aksine (o repeat(N, minmax(0,1fr))
            üretir) minimum genişliği "auto" bırakıyor — içindeki 1200px'lik
            önizleme (overflow-hidden nested bir div'in İÇİNDE olsa bile) bu
            sütunun küçülmesini engelleyip tüm sayfayı sağa doğru taşırıyordu. */}
        <div className="bg-white rounded-xl shadow-sm p-6 min-w-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">Önizleme</h2>
            <div className="flex gap-1">
              {PREVIEW_WIDTHS.map((w) => (
                <button
                  key={w.value}
                  type="button"
                  onClick={() => setPreviewWidth(w.value)}
                  className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors ${
                    previewWidth === w.value ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </div>
          {slug ? (
            <>
              <div ref={previewContainerRef} className="border border-gray-200 rounded-lg bg-gray-100 p-3 overflow-hidden">
                {/* transform: scale() elemanın kendi layout kutusunu küçültmez, sadece
                    görsel olarak küçültür — bu sarmalayıcıya ölçeklenmiş GERÇEK
                    boyutu (width+height) vermezsek boş bir alan (bugün ~orijinal
                    genişlikte) kalır, içerik sanki sola yaslanmış gibi görünür.
                    ml-auto ile bu doğru-boyutlu kutu panelin SAĞINA yaslanıyor. */}
                <div
                  className="ml-auto"
                  style={{
                    width: PREVIEW_WIDTHS.find((w) => w.value === previewWidth)!.width * previewScale,
                    height: 640 * previewScale,
                  }}
                >
                  <iframe
                    ref={iframeRef}
                    onLoad={() => sendPreview()}
                    src={`/randevu/${slug}?embed=1`}
                    style={{
                      height: 640,
                      width: PREVIEW_WIDTHS.find((w) => w.value === previewWidth)!.width,
                      border: "none",
                      background: "#fff",
                      transform: `scale(${previewScale})`,
                      transformOrigin: "top left",
                    }}
                    title="Önizleme"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Önizleme değişiklikleri anında yansıtır — kalıcı olması için &quot;Kaydet&quot;e basmanız gerekir.
                Yukarıdaki genişlik düğmeleri gerçek cihazı değil, formun sitenizde ne kadar geniş bir alana
                gömülü olduğunu simüle eder; panele sığmayan genişlikler otomatik küçültülerek gösterilir.
              </p>
            </>
          ) : (
            <p className="text-sm text-gray-400">Önizleme için önce sayfa yüklenmeli.</p>
          )}
        </div>
      </div>
    </div>
  );
}
