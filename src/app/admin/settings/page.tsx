"use client";

import { useEffect, useState } from "react";
import { Tooltip } from "@/components/Tooltip";
import { Switch } from "@/components/Switch";
import { useToast } from "@/components/ToastProvider";
import { PROTECTED_PAYMENT_TYPES } from "@/lib/paymentTypes";

export default function GeneralSettingsPage() {
  const toast = useToast();
  const [businessName, setBusinessName] = useState("");
  const [overdueMonths, setOverdueMonths] = useState("6");
  const [paymentTypes, setPaymentTypes] = useState<string[]>([]);
  const [newPaymentType, setNewPaymentType] = useState("");
  const [bookingCapacity, setBookingCapacity] = useState(1);
  const [workingHours, setWorkingHours] = useState<unknown>(null);
  const [autoApprove, setAutoApprove] = useState(false);
  const [maxDaysAhead, setMaxDaysAhead] = useState(30);
  // Randevu Görünümü sayfasının (booking_widget_*) düzenlediği alanlar — aynı
  // sebeple (aşağıdaki useEffect yorumuna bkz.) burada da olduğu gibi
  // korunması gerekiyor.
  const [widgetPreset, setWidgetPreset] = useState("card");
  const [widgetAccentColor, setWidgetAccentColor] = useState("#2563eb");
  const [widgetColumnsTablet, setWidgetColumnsTablet] = useState(1);
  const [widgetColumnsDesktop, setWidgetColumnsDesktop] = useState(1);
  const [widgetTitle, setWidgetTitle] = useState<string | null>(null);
  const [widgetDescription, setWidgetDescription] = useState<string | null>(null);
  const [widgetShowHeadingEmbed, setWidgetShowHeadingEmbed] = useState(false);
  const [autoRegisterCustomers, setAutoRegisterCustomers] = useState(true);
  // Randevu Ayarları sayfasının düzenlediği WhatsApp alanları — aynı sebeple
  // (yukarıdaki widget yorumuna bkz.) burada da olduğu gibi korunması
  // gerekiyor. Token burada hiç tutulmuyor/gönderilmiyor — boş string PUT'ta
  // mevcut token'ın korunmasını sağlıyor (bkz. /api/settings PUT).
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [whatsappPhoneNumberId, setWhatsappPhoneNumberId] = useState<string | null>(null);
  const [whatsappBusinessAccountId, setWhatsappBusinessAccountId] = useState<string | null>(null);
  const [whatsappTemplateName, setWhatsappTemplateName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        setBusinessName(data.business_name ?? "");
        setOverdueMonths(String(data.storage_overdue_months ?? 6));
        setPaymentTypes(Array.isArray(data.payment_types) ? data.payment_types : []);
        // Randevu Ayarları artık ayrı bir sayfada (/admin/appointments/ayarlar)
        // düzenleniyor, ama aynı app_settings satırını paylaştığı için PUT
        // gönderirken bu değerleri olduğu gibi geri yollamamız gerekiyor —
        // yoksa burada kaydedince Randevu Ayarları sıfırlanırdı.
        setBookingCapacity(data.booking_capacity ?? 1);
        setWorkingHours(data.booking_working_hours ?? null);
        setAutoApprove(!!data.booking_auto_approve);
        setMaxDaysAhead(data.booking_max_days_ahead ?? 30);
        setWidgetPreset(data.booking_widget_preset ?? "card");
        setWidgetAccentColor(data.booking_widget_accent_color ?? "#2563eb");
        setWidgetColumnsTablet(data.booking_widget_columns_tablet ?? 1);
        setWidgetColumnsDesktop(data.booking_widget_columns_desktop ?? 1);
        setWidgetTitle(data.booking_widget_title ?? null);
        setWidgetDescription(data.booking_widget_description ?? null);
        setWidgetShowHeadingEmbed(!!data.booking_widget_show_heading_embed);
        setAutoRegisterCustomers(data.auto_register_customers ?? true);
        setWhatsappEnabled(!!data.whatsapp_enabled);
        setWhatsappPhoneNumberId(data.whatsapp_phone_number_id ?? null);
        setWhatsappBusinessAccountId(data.whatsapp_business_account_id ?? null);
        setWhatsappTemplateName(data.whatsapp_template_name ?? null);
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
    if (!businessName.trim()) {
      toast.error("İşletme adı zorunludur.");
      return;
    }
    const months = Number(overdueMonths);
    if (!Number.isInteger(months) || months < 1 || months > 60) {
      toast.error("Depo bekleme uyarı eşiği 1-60 ay arasında olmalıdır.");
      return;
    }
    if (paymentTypes.length === 0) {
      toast.error("En az bir ödeme şekli tanımlı olmalıdır.");
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
          booking_capacity: bookingCapacity,
          booking_working_hours: workingHours,
          booking_auto_approve: autoApprove,
          booking_max_days_ahead: maxDaysAhead,
          booking_widget_preset: widgetPreset,
          booking_widget_accent_color: widgetAccentColor,
          booking_widget_columns_tablet: widgetColumnsTablet,
          booking_widget_columns_desktop: widgetColumnsDesktop,
          booking_widget_title: widgetTitle,
          booking_widget_description: widgetDescription,
          booking_widget_show_heading_embed: widgetShowHeadingEmbed,
          auto_register_customers: autoRegisterCustomers,
          whatsapp_enabled: whatsappEnabled,
          whatsapp_phone_number_id: whatsappPhoneNumberId,
          whatsapp_business_account_id: whatsappBusinessAccountId,
          whatsapp_template_name: whatsappTemplateName,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Ayarlar kaydedilemedi.");
      toast.success("Ayarlar başarıyla kaydedildi.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Hata oluştu.");
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

      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Müşteriler</h2>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-gray-700">Müşterileri Otomatik Kaydet</div>
            <p className="text-xs text-gray-400 mt-0.5">
              Sipariş oluşturma/düzenleme, Excel içe aktarımı veya randevu onayında girilen müşteri
              adı (varsa telefonuyla) otomatik olarak Müşteriler listesine eklensin. Kapatırsanız
              müşteriler yalnızca Müşteriler sayfasından elle eklenmiş olarak listede görünür.
            </p>
          </div>
          <Switch checked={autoRegisterCustomers} onClick={() => setAutoRegisterCustomers((v) => !v)} />
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
