"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/ToastProvider";
import { isInvoiceInfoComplete, type InvoiceInfo } from "@/lib/billing";

// Fatura bilgileri — hem /admin/billing (ödemeden önce tamamlanması
// zorunlu, bkz. src/lib/billing.ts isInvoiceInfoComplete notu) hem
// /admin/profile'da (isteyen dilediği zaman güncelleyebilsin diye) AYNI
// bileşen kullanılıyor — ikisi de aynı /api/billing/invoice-info uç
// noktasına okuyup yazdığından, biri kaydedince diğeri otomatik güncel
// gösterir (ayrı bir senkronizasyon mekanizmasına gerek yok).
export default function InvoiceInfoForm({
  description = "Fatura kesimi için kullanılan bilgiler.",
  onStatusChange,
}: {
  description?: string;
  onStatusChange?: (complete: boolean) => void;
}) {
  const toast = useToast();
  const [invoiceInfo, setInvoiceInfo] = useState<(InvoiceInfo & { complete: boolean }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [entityType, setEntityType] = useState<"individual" | "company" | "">("");
  const [taxId, setTaxId] = useState("");
  const [taxOffice, setTaxOffice] = useState("");
  const [invoiceTitle, setInvoiceTitle] = useState("");
  const [billingCity, setBillingCity] = useState("");
  const [billingDistrict, setBillingDistrict] = useState("");
  const [billingAddress, setBillingAddress] = useState("");

  useEffect(() => {
    fetch("/api/billing/invoice-info")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: (InvoiceInfo & { complete: boolean }) | null) => {
        if (!data) return;
        setInvoiceInfo(data);
        setEntityType((data.billing_entity_type as "individual" | "company") || "");
        setTaxId(data.billing_tax_id || "");
        setTaxOffice(data.billing_tax_office || "");
        setInvoiceTitle(data.billing_invoice_title || "");
        setBillingCity(data.billing_city || "");
        setBillingDistrict(data.billing_district || "");
        setBillingAddress(data.billing_address || "");
        onStatusChange?.(data.complete);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveInvoiceInfo() {
    setSaving(true);
    try {
      const res = await fetch("/api/billing/invoice-info", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          billing_entity_type: entityType || null,
          billing_tax_id: taxId,
          billing_tax_office: taxOffice,
          billing_invoice_title: invoiceTitle,
          billing_city: billingCity,
          billing_district: billingDistrict,
          billing_address: billingAddress,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kaydedilemedi.");
      setInvoiceInfo(data);
      onStatusChange?.(data.complete);
      toast.success("Fatura bilgileri kaydedildi.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Hata oluştu.");
    } finally {
      setSaving(false);
    }
  }

  // Kaydedilmemiş form alanlarını CANLI doğrular — "Kaydet"e basmadan önce
  // bile eksik alanları görebilsin diye. Asıl kapı (çağıran sayfadaki buton
  // gizleme) invoiceInfo.complete (sunucudan gelen, kaydedilmiş durum) —
  // bu ikisi kasıtlı olarak ayrı: formu doldurup KAYDETMEDEN devam edilemez.
  const invoiceFormComplete = isInvoiceInfoComplete({
    billing_entity_type: entityType || null,
    billing_tax_id: taxId,
    billing_tax_office: taxOffice,
    billing_invoice_title: invoiceTitle,
    billing_city: billingCity,
    billing_district: billingDistrict,
    billing_address: billingAddress,
  });

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <h2 className="text-sm font-bold text-gray-800 mb-1">Fatura Bilgileri</h2>
      <p className="text-xs text-gray-400 mb-4">{description}</p>
      {loading ? (
        <div className="text-center text-gray-400 py-6 text-sm">Yükleniyor...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Fatura Tipi</label>
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-1.5">
                  <input type="radio" checked={entityType === "individual"} onChange={() => setEntityType("individual")} />
                  Şahıs (bireysel/esnaf)
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="radio" checked={entityType === "company"} onChange={() => setEntityType("company")} />
                  Şirket
                </label>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {entityType === "company" ? "VKN (10 hane)" : "TCKN (11 hane)"}
              </label>
              <input
                type="text"
                value={taxId}
                onChange={(e) => setTaxId(e.target.value.replace(/\D/g, ""))}
                maxLength={entityType === "company" ? 10 : 11}
                disabled={!entityType}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
              />
            </div>
            {entityType === "company" && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Vergi Dairesi</label>
                <input
                  type="text"
                  value={taxOffice}
                  onChange={(e) => setTaxOffice(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
            <div className={entityType === "company" ? "" : "sm:col-span-2"}>
              <label className="block text-xs font-medium text-gray-600 mb-1">Fatura Unvanı / Ad Soyad</label>
              <input
                type="text"
                value={invoiceTitle}
                onChange={(e) => setInvoiceTitle(e.target.value)}
                placeholder="Faturada görünecek resmi isim"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">İl</label>
              <input
                type="text"
                value={billingCity}
                onChange={(e) => setBillingCity(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">İlçe</label>
              <input
                type="text"
                value={billingDistrict}
                onChange={(e) => setBillingDistrict(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Açık Adres</label>
              <textarea
                value={billingAddress}
                onChange={(e) => setBillingAddress(e.target.value)}
                rows={2}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <button
            onClick={saveInvoiceInfo}
            disabled={saving || !invoiceFormComplete}
            className="bg-gray-800 hover:bg-gray-900 disabled:bg-gray-300 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {saving ? "Kaydediliyor..." : "Fatura Bilgilerini Kaydet"}
          </button>
          {!invoiceInfo?.complete && (
            <p className="text-xs text-amber-600 mt-2">Fatura bilgileriniz henüz eksik/kaydedilmemiş.</p>
          )}
        </>
      )}
    </div>
  );
}
