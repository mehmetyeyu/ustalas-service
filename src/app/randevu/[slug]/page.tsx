"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

interface Service {
  id: number;
  name: string;
  duration_minutes: number | null;
}

type ColumnsTablet = 1 | 2;
type ColumnsDesktop = 1 | 2 | 3;
type Radius = "sharp" | "md" | "lg" | "pill";
type Density = "compact" | "normal" | "comfortable";
type HeadingSize = "sm" | "md" | "lg";

interface WidgetStyle {
  preset: "card" | "seamless" | "outlined";
  accentColor: string;
  columnsTablet: ColumnsTablet;
  columnsDesktop: ColumnsDesktop;
  title: string | null;
  description: string | null;
  showHeadingInEmbed: boolean;
  radius: Radius;
  density: Density;
  headingSize: HeadingSize;
}

interface Meta {
  tenant: { name: string; slug: string };
  services: Service[];
  maxDaysAhead: number;
  style: WidgetStyle;
}

// Firmanın kendi sitesine gömdüğünde form "yabancı bir widget" değil, sitenin
// doğal bir parçası gibi görünsün diye üç hazır görünüm — bkz. Randevu
// Görünümü ayar sayfası. card = bugüne kadarki tek sabit görünüm (varsayılan).
// Köşe yuvarlığı ve iç boşluk artık ayrı token'lar (RADIUS_CARD/DENSITY_*) —
// burada sadece zemin/kenarlık/gölge gibi yapısal fark kalıyor.
const PRESET_CLASSES: Record<WidgetStyle["preset"], string> = {
  card: "bg-white shadow-sm border border-gray-200",
  seamless: "bg-transparent",
  outlined: "bg-white border border-gray-300",
};

// Kart konteyneri ile input/buton/saat-slotu arasında farklı ölçekte
// (kart hep bir tık daha yuvarlak) ama aynı isimli 4 seviye — "lg" varsayılanı
// bugünkü sabit görünümle birebir aynı (kart: rounded-xl, kontrol: rounded-lg).
const RADIUS_CARD: Record<Radius, string> = { sharp: "rounded-none", md: "rounded-lg", lg: "rounded-xl", pill: "rounded-3xl" };
const RADIUS_CONTROL: Record<Radius, string> = { sharp: "rounded-none", md: "rounded-md", lg: "rounded-lg", pill: "rounded-full" };

// Kart iç boşluğu, grid/flex aralığı ve input iç boşluğunu birlikte
// ölçekler — "normal" varsayılanı bugünkü sabit değerlerle (p-5/gap-4/
// px-3 py-2) birebir aynı.
const DENSITY_CARD_PADDING: Record<Density, string> = { compact: "p-3", normal: "p-5", comfortable: "p-7" };
const DENSITY_GAP: Record<Density, string> = { compact: "gap-2", normal: "gap-4", comfortable: "gap-6" };
const DENSITY_INPUT_PADDING: Record<Density, string> = { compact: "px-2.5 py-1.5", normal: "px-3 py-2", comfortable: "px-4 py-3" };

// Başlık+açıklama çifti birlikte büyür/küçülür (ayrı ayrı font-size kontrolü
// değil) — "md" varsayılanı bugünkü sabit değerlerle (text-xl/text-sm) aynı.
const HEADING_SIZE_TITLE: Record<HeadingSize, string> = { sm: "text-lg", md: "text-xl", lg: "text-2xl" };
const HEADING_SIZE_DESC: Record<HeadingSize, string> = { sm: "text-xs", md: "text-sm", lg: "text-base" };

// Hizmet / Tarih / Müsait Saatler üç bağımsız grid öğesi — mobilde (<640px)
// her zaman tek kolon (form zaten en dar cihazda tek sütuna sığacak kadar
// sade, ayarlanamaz), tablette (640-1023px) 1-2, masaüstünde (≥1024px) 1-3
// kolon arasında bağımsız seçilebilir (bkz. Randevu Görünümü ayar sayfası).
// Form bir iframe içinde gömülü olduğundan bu "cihaz" değil, gömüldüğü
// KAPSAYICININ genişliği. Sabit literal haritalar halinde tutuluyor ki
// Tailwind'in build-zamanı tarayıcısı hepsini görebilsin (şablon
// interpolasyonuyla üretilen sınıf adları taranamaz).
const TABLET_COLS: Record<ColumnsTablet, string> = { 1: "sm:grid-cols-1", 2: "sm:grid-cols-2" };
const DESKTOP_COLS: Record<ColumnsDesktop, string> = { 1: "lg:grid-cols-1", 2: "lg:grid-cols-2", 3: "lg:grid-cols-3" };

// Hizmet+Tarih her zaman ilk N hücreyi dolduruyor, Müsait Saatler her zaman
// ÜÇÜNCÜ öğe. 2 kolonda bu, Saatler'in tek başına yeni bir satıra düşüp
// sadece 1. sütunun genişliğini kullanması, 2. sütunun ise boş kalması
// anlamına gelir — bir kullanıcı raporuyla ortaya çıktı. Saatler'in kendi
// satırında YALNIZ kaldığı durumlarda (kolon sayısı 3'ten az) tüm satırı
// kaplaması için col-span veriliyor; 3 kolonda ise Hizmet/Tarih ile aynı
// satırı paylaştığından span verilmiyor (verilirse düzeni bozar).
const TABLET_SLOTS_SPAN: Record<ColumnsTablet, string> = { 1: "sm:col-span-1", 2: "sm:col-span-2" };
const DESKTOP_SLOTS_SPAN: Record<ColumnsDesktop, string> = { 1: "lg:col-span-1", 2: "lg:col-span-2", 3: "lg:col-span-1" };

// Kartın kendisi hep max-w-md (448px) ile sabitse geniş bir kapsayıcıya
// gömülünce (ör. masaüstünde tam genişlik bir bölüm) kart küçük kalıp
// etrafında anlamsız boş alan bırakır — tek kolon seçili olsa bile. Bu
// yüzden kart genişliği kolon sayısına göre kademeli büyüyor.
const TABLET_MAX_W: Record<ColumnsTablet, string> = { 1: "sm:max-w-lg", 2: "sm:max-w-2xl" };
const DESKTOP_MAX_W: Record<ColumnsDesktop, string> = { 1: "lg:max-w-xl", 2: "lg:max-w-3xl", 3: "lg:max-w-4xl" };

// Vurgu rengi (buton, seçili saat, odak halkası) her yerde aynı CSS
// değişkeninden okunuyor — Tailwind'in `[var(--accent)]` keyfi değer sözdizimi
// build zamanında taranabilen sabit bir literal olduğundan, dinamik sınıf
// üretimi sorunu olmadan çalışır. Hover için renk matematiği yapmak yerine
// `hover:brightness-90` kullanılıyor, hangi renk seçilirse seçilsin işler.
const FOCUS_RING = "focus:outline-none focus:ring-2 focus:ring-[var(--accent)]";

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
  // Randevu Görünümü admin sayfasındaki canlı önizleme — henüz kaydedilmemiş
  // taslak stil değerlerini bu iframe'e postMessage ile bildiriyor (bkz.
  // gorunum/page.tsx). Sadece AYNI origin'den (yani kendi admin panelimizden)
  // gelen mesajlar kabul edilir — firmanın kendi sitesine gömülü gerçek bir
  // embed'de parent farklı bir origin olduğundan bu asla tetiklenmez.
  const [previewStyle, setPreviewStyle] = useState<WidgetStyle | null>(null);

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
    // Kök layout'taki <body className="bg-gray-50"> her sayfaya (admin panel
    // dahil) uygulanıyor — bu sayfadaki wrapper'dan gri arka planı kaldırmak
    // tek başına yetmiyor, altındaki body hâlâ gri boyuyor ve iframe yine
    // "ayrı bir kutu" gibi görünüyordu. Sadece gömülü modda body'yi şeffaf
    // yapıyoruz — bu tek public/embed sayfası olduğundan diğer hiçbir
    // sayfayı (admin panel dahil) etkilemez.
    if (!isEmbed) return;
    const previousBackground = document.body.style.background;
    document.body.style.background = "transparent";
    return () => { document.body.style.background = previousBackground; };
  }, [isEmbed]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "ustalas-randevu-preview-style") {
        setPreviewStyle(event.data.style as WidgetStyle);
      }
    }
    window.addEventListener("message", handleMessage);
    // Parent (gorunum/page.tsx) sayfa yüklendiğinde mevcut taslağı hemen
    // gönderebilsin diye — mesaj bu iframe'in listener'ı kurulmadan ÖNCE
    // gönderilmiş olabilir, "hazırım" sinyali bu yarışı önler.
    window.parent.postMessage({ type: "ustalas-randevu-preview-ready" }, "*");
    return () => window.removeEventListener("message", handleMessage);
  }, []);

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
  const style = previewStyle ?? meta.style;
  const showHeading = !isEmbed || style.showHeadingInEmbed;

  return (
    <div
      ref={rootRef}
      // Gömülü modda gri arka plan (bg-gray-50) hep uygulanıyordu — firmanın
      // kendi sitesinin arka planı ne olursa olsun iframe alanı belirgin gri
      // bir dikdörtgen olarak görünüp "ayrı bir kutu" gibi duruyordu (gerçek
      // kullanıcı geri bildirimi). Gömülü modda arka plan tamamen şeffaf —
      // sitenin kendi arka planı görünür, kart zaten kendi görünümünü
      // (PRESET_CLASSES) sağlıyor. Sayfa doğrudan ziyaret edildiğinde
      // (gömülü değilken) hâlâ gri arka plan gerekli (arkasında gösterecek
      // bir "site" yok).
      className={isEmbed ? "py-4 px-4" : "min-h-screen bg-gray-50 py-8 px-4"}
      style={{ "--accent": style.accentColor } as React.CSSProperties}
    >
      <div className={`max-w-md mx-auto transition-[max-width] ${TABLET_MAX_W[style.columnsTablet]} ${DESKTOP_MAX_W[style.columnsDesktop]}`}>
        {showHeading && (
          <>
            <h1 className={`${HEADING_SIZE_TITLE[style.headingSize]} font-bold text-gray-800 mb-1`}>{style.title || meta.tenant.name}</h1>
            <p className={`${HEADING_SIZE_DESC[style.headingSize]} text-gray-500 mb-6`}>{style.description || "Online Randevu"}</p>
          </>
        )}

        {noBookableServices ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 text-sm text-gray-500">
            Şu an online randevu alınamıyor.
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className={`${PRESET_CLASSES[style.preset]} ${RADIUS_CARD[style.radius]} ${DENSITY_CARD_PADDING[style.density]} flex flex-col ${DENSITY_GAP[style.density]}`}
          >
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

            {/* Ad Soyad/Plaka/Telefon da (aşağıda, saat seçilince görünür) bu AYNI
                grid'in içinde — önceden grid'in dışında, sabit tek-kolon olarak
                forma ekleniyordu: admin 2-3 kolon seçse bile bu üç alan onu hiç
                görmüyor, form üstte çok-kolonlu altta tek-kolonlu görünüp görsel
                ritmi bozuyordu (gerçek kullanıcı geri bildirimi). Kısa metin
                girişleri (isim/plaka/telefon) span gerektirmeden tek grid-birimi
                genişliğinde doğal olarak tilelenir. */}
            <div
              className={`grid grid-cols-1 ${DENSITY_GAP[style.density]} ${TABLET_COLS[style.columnsTablet]} ${DESKTOP_COLS[style.columnsDesktop]}`}
            >
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Hizmet <span className="text-red-500">*</span></label>
                <select
                  value={serviceId ?? ""}
                  onChange={(e) => setServiceId(e.target.value ? Number(e.target.value) : null)}
                  required
                  className={`w-full border border-gray-300 ${RADIUS_CONTROL[style.radius]} ${DENSITY_INPUT_PADDING[style.density]} text-sm ${FOCUS_RING}`}
                >
                  <option value="">Seçiniz...</option>
                  {meta.services.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <label className="block text-xs font-medium text-gray-600">Tarih <span className="text-red-500">*</span></label>
                  {date && <span className="text-xs text-gray-400 truncate">{formatDateLabel(date)}</span>}
                </div>
                <input
                  type="date"
                  value={date}
                  min={todayStr()}
                  max={toIstanbulDateStr(new Date(Date.now() + meta.maxDaysAhead * 24 * 60 * 60000))}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  className={`w-full border border-gray-300 ${RADIUS_CONTROL[style.radius]} ${DENSITY_INPUT_PADDING[style.density]} text-sm ${FOCUS_RING}`}
                />
              </div>

              {serviceId && (
                <div className={`${TABLET_SLOTS_SPAN[style.columnsTablet]} ${DESKTOP_SLOTS_SPAN[style.columnsDesktop]}`}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Müsait Saatler <span className="text-red-500">*</span></label>
                  {loadingSlots ? (
                    <p className="text-sm text-gray-400">Müsaitlik kontrol ediliyor...</p>
                  ) : slots.length === 0 ? (
                    <p className="text-sm text-gray-400">Bu tarihte müsait saat yok, başka bir tarih deneyin.</p>
                  ) : (
                    /* 3 kolonda Saatler, tek satırlık Hizmet/Tarih alanlarıyla aynı
                       satırı paylaşıyor — yükseklik sınırı olmadan 5-6 satırlık liste
                       o iki kısa alanın yanında çok orantısız/çirkin duruyordu (gerçek
                       kullanıcı geri bildirimi). max-h-48 bu farkı azaltıyor (tam
                       ortadan kaldırmıyor — 3 kolonda kısa alanlarla aynı satırı
                       paylaşmanın doğal bir sonucu), overflow-y-auto ile taşan
                       saatler kaydırılarak görülebiliyor. */
                    <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto">
                      {slots.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setSelectedSlot(s)}
                          className={`text-center px-2 py-2 ${RADIUS_CONTROL[style.radius]} text-sm border transition-colors ${
                            selectedSlot === s
                              ? "bg-[var(--accent)] border-[var(--accent)] text-white font-medium"
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
                      className={`w-full border border-gray-300 ${RADIUS_CONTROL[style.radius]} ${DENSITY_INPUT_PADDING[style.density]} text-sm ${FOCUS_RING}`}
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
                      className={`w-full border border-gray-300 ${RADIUS_CONTROL[style.radius]} ${DENSITY_INPUT_PADDING[style.density]} text-sm font-mono uppercase ${FOCUS_RING}`}
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
                      className={`w-full border border-gray-300 ${RADIUS_CONTROL[style.radius]} ${DENSITY_INPUT_PADDING[style.density]} text-sm ${FOCUS_RING}`}
                    />
                  </div>
                </>
              )}
            </div>

            {selectedSlot && (
              <>
                {submitError && <p className="text-sm text-red-600">{submitError}</p>}

                <button
                  type="submit"
                  disabled={submitting}
                  className={`bg-[var(--accent)] hover:brightness-90 disabled:opacity-50 text-white font-medium ${RADIUS_CONTROL[style.radius]} px-4 py-2.5 text-sm transition-[filter]`}
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
