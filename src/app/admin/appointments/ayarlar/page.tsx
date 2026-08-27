"use client";

import { useEffect, useState } from "react";
import { PushNotificationToggle } from "../../PushNotificationToggle";
import { useToast } from "@/components/ToastProvider";
import { Switch } from "@/components/Switch";

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
  const toast = useToast();
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
  const [regenerating, setRegenerating] = useState(false);

  // Randevu Görünümü sayfasının (booking_widget_*) düzenlediği alanlar —
  // burada hiç gösterilmiyor ama aynı app_settings satırını paylaştığımız
  // için kaydederken olduğu gibi geri gönderilmeleri gerekiyor, yoksa bu
  // sayfadan kaydedince Görünüm ayarları sıfırlanırdı (bkz. Genel Ayarlar'daki
  // aynı desen).
  const [widgetPreset, setWidgetPreset] = useState("card");
  const [widgetAccentColor, setWidgetAccentColor] = useState("#2563eb");
  const [widgetColumnsTablet, setWidgetColumnsTablet] = useState(1);
  const [widgetColumnsDesktop, setWidgetColumnsDesktop] = useState(1);
  const [widgetTitle, setWidgetTitle] = useState<string | null>(null);
  const [widgetDescription, setWidgetDescription] = useState<string | null>(null);
  const [widgetShowHeadingEmbed, setWidgetShowHeadingEmbed] = useState(false);
  const [autoRegisterCustomers, setAutoRegisterCustomers] = useState(true);

  // WhatsApp bildirimi — her firma kendi Meta WhatsApp Business hesabını
  // (kendi telefon numarası, kendi onaylı şablonu) buraya bağlar, bkz.
  // src/lib/whatsapp.ts. whatsappAccessToken input'u KASITLI olarak boş
  // başlar — GET /api/settings ham token'ı hiç döndürmüyor (bkz. o route'un
  // yorumu), sadece whatsappAccessTokenSet ile "kayıtlı mı" bilgisi gelir.
  // Boş bırakılıp kaydedilirse mevcut token DB'de korunur.
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [whatsappAccessToken, setWhatsappAccessToken] = useState("");
  const [whatsappAccessTokenSet, setWhatsappAccessTokenSet] = useState(false);
  const [whatsappPhoneNumberId, setWhatsappPhoneNumberId] = useState("");
  const [whatsappBusinessAccountId, setWhatsappBusinessAccountId] = useState("");
  const [whatsappTemplateName, setWhatsappTemplateName] = useState("");

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
        setWidgetPreset(data.booking_widget_preset ?? "card");
        setWidgetAccentColor(data.booking_widget_accent_color ?? "#2563eb");
        setWidgetColumnsTablet(data.booking_widget_columns_tablet ?? 1);
        setWidgetColumnsDesktop(data.booking_widget_columns_desktop ?? 1);
        setWidgetTitle(data.booking_widget_title ?? null);
        setWidgetDescription(data.booking_widget_description ?? null);
        setWidgetShowHeadingEmbed(!!data.booking_widget_show_heading_embed);
        setAutoRegisterCustomers(data.auto_register_customers ?? true);
        setWhatsappEnabled(!!data.whatsapp_enabled);
        setWhatsappAccessTokenSet(!!data.whatsapp_access_token_set);
        setWhatsappPhoneNumberId(data.whatsapp_phone_number_id ?? "");
        setWhatsappBusinessAccountId(data.whatsapp_business_account_id ?? "");
        setWhatsappTemplateName(data.whatsapp_template_name ?? "");
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
    const daysAhead = Number(maxDaysAhead);
    if (!Number.isInteger(daysAhead) || daysAhead < 1 || daysAhead > 365) {
      toast.error("İleri randevu süresi 1-365 gün arasında olmalıdır.");
      return;
    }
    const capacity = Number(bookingCapacity);
    if (!Number.isInteger(capacity) || capacity < 1) {
      toast.error("Kapasite en az 1 olmalıdır.");
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
          booking_widget_preset: widgetPreset,
          booking_widget_accent_color: widgetAccentColor,
          booking_widget_columns_tablet: widgetColumnsTablet,
          booking_widget_columns_desktop: widgetColumnsDesktop,
          booking_widget_title: widgetTitle,
          booking_widget_description: widgetDescription,
          booking_widget_show_heading_embed: widgetShowHeadingEmbed,
          auto_register_customers: autoRegisterCustomers,
          whatsapp_enabled: whatsappEnabled,
          whatsapp_access_token: whatsappAccessToken,
          whatsapp_phone_number_id: whatsappPhoneNumberId,
          whatsapp_business_account_id: whatsappBusinessAccountId,
          whatsapp_template_name: whatsappTemplateName,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Ayarlar kaydedilemedi.");
      // Token kaydedildiyse input'u boşalt (bir daha ham haliyle geri gelmiyor,
      // sadece "kayıtlı" göstergesi güncellenir) — bir daha kaydedince yanlışlıkla
      // boş string gönderilip mevcut token silinmesin diye zaten CASE korunuyordu,
      // ama input'ta eski değeri tutmak yanıltıcı olurdu.
      if (whatsappAccessToken) {
        setWhatsappAccessTokenSet(true);
        setWhatsappAccessToken("");
      }
      toast.success("Ayarlar başarıyla kaydedildi.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Hata oluştu.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRegenerateSlug() {
    if (
      !confirm(
        "Yeni bir bağlantı oluşturulacak. Web sitenize daha önce eklediğiniz " +
          "eski script/iframe kodu ÇALIŞMAZ HALE GELİR — yeni kodu alıp sitenizde " +
          "güncellemeniz gerekir. Devam edilsin mi?"
      )
    ) {
      return;
    }
    setRegenerating(true);
    try {
      const res = await fetch("/api/settings/regenerate-slug", { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error || "Yeni bağlantı oluşturulamadı.");
      const data = await res.json();
      setSlug(data.slug);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Hata oluştu.");
    } finally {
      setRegenerating(false);
    }
  }

  if (loading) {
    return <div className="text-center text-gray-400 py-12">Yükleniyor...</div>;
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Randevu Ayarları</h1>

      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
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

        <div className="mt-6 pt-5 border-t border-gray-100">
          <PushNotificationToggle />
        </div>

        <div className="mt-6 pt-5 border-t border-gray-100">
          <div className="flex items-center justify-between mb-1">
            <div className="text-sm font-medium text-gray-700">WhatsApp Bildirimi</div>
            <Switch checked={whatsappEnabled} onClick={() => setWhatsappEnabled((v) => !v)} />
          </div>
          <p className="text-xs text-gray-400 mb-4">
            Randevu onaylandığında müşterinin telefonuna WhatsApp üzerinden bilgilendirme mesajı
            gönderilsin. Kendi Meta WhatsApp Business hesabınızı kurup aşağıdaki bilgileri
            girmeniz gerekiyor — hiçbiri girilmemişse bildirim gönderilmez.
          </p>

          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-600 mb-1">Erişim Token&apos;ı</label>
            <input
              type="password"
              value={whatsappAccessToken}
              onChange={(e) => setWhatsappAccessToken(e.target.value)}
              placeholder={whatsappAccessTokenSet ? "•••••••••••••••• (kayıtlı — değiştirmek için yeni bir tane girin)" : "Meta'dan aldığınız kalıcı erişim token'ı"}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-600 mb-1">Telefon Numarası ID&apos;si (Phone Number ID)</label>
            <input
              type="text"
              value={whatsappPhoneNumberId}
              onChange={(e) => setWhatsappPhoneNumberId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-600 mb-1">WhatsApp Business Hesap ID&apos;si (WABA ID)</label>
            <input
              type="text"
              value={whatsappBusinessAccountId}
              onChange={(e) => setWhatsappBusinessAccountId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Onaylı Şablon Adı</label>
            <input
              type="text"
              value={whatsappTemplateName}
              onChange={(e) => setWhatsappTemplateName(e.target.value)}
              placeholder="ör. randevu_onay"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400 mt-1">
              Meta WhatsApp Manager&apos;da UTILITY kategorisinde onaylattığınız, sırasıyla ad-soyad/
              plaka/tarih/saat/hizmet değişkenli şablonun adı.
            </p>
          </div>
        </div>

        {slug && origin && (
          <div className="mt-6 pt-5 border-t border-gray-100">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-semibold text-gray-700">Web Sitenize Ekleyin</h3>
              <button
                type="button"
                onClick={handleRegenerateSlug}
                disabled={regenerating}
                className="text-xs font-medium text-gray-400 hover:text-red-600 disabled:opacity-50"
              >
                {regenerating ? "Oluşturuluyor..." : "Bağlantıyı Yenile"}
              </button>
            </div>
            <p className="text-xs text-gray-400 mb-3">
              Randevu formunu kendi web sitenize, Google Haritalar gibi gömebilirsiniz —
              aşağıdaki kodlardan birini sitenize yapıştırmanız yeterli.
              &quot;Bağlantıyı Yenile&quot;, tahmin edilmesi zor rastgele yeni bir bağlantı üretir
              (eski bağlantı/kod artık çalışmaz — sitenizdeki kodu yenilemeniz gerekir).
            </p>
            <CopyBox label="Doğrudan link" value={`${origin}/randevu/${slug}`} />
            <CopyBox
              label="Script ile göm (önerilen — sayfanıza doğrudan eklenir, iframe/kutu görünmez)"
              value={`<script src="${origin}/embed.js" data-slug="${slug}"></script>`}
            />
            <p className="text-xs text-gray-400 -mt-2 mb-3">
              Sitenizin genel CSS&apos;i forma yanlışlıkla karışmaz; kendi CSS&apos;inizden
              sadece işaretli noktaları (ör. <code>::part(submit)</code>) hedefleyebilirsiniz.
              Tam izole bir kutu (iframe) isterseniz aşağıdaki seçeneği kullanın.
            </p>
            <CopyBox
              label="veya iframe ile göm (tam izole kutu)"
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
