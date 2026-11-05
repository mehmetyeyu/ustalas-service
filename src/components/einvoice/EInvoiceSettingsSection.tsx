"use client";

import { useEffect, useState } from "react";
import { Switch } from "@/components/Switch";
import { useToast } from "@/components/ToastProvider";
import { useConfirm } from "@/components/ConfirmProvider";
import { SettingsSection } from "@/components/v2/SettingsLayout";
import { VAT_RATES } from "@/lib/einvoice/vat";

// Ayarlar → e-Fatura (yalnızca admin, e-Fatura ek özelliği açıkken).
// Genel Ayarlar'ın tek "Kaydet"inden bağımsız kendi kaydı var — bağlantı
// dış bir hesaba bağlanma işlemi, diğer ayarlarla aynı anda kaydedilmez.
interface Connection {
  provider: "parasut" | "mock";
  company_name: string | null;
  company_city: string | null;
  company_district: string | null;
  status: "active" | "pending" | "reauth" | "disabled";
  pending_companies: { id: string; name: string; taxNumber: string | null }[] | null;
  invoice_series: string | null;
  default_vat_rate: number;
  record_payments: boolean;
  last_error: string | null;
  connected_at: string;
}

const inputClass = "border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500";

export function EInvoiceSettingsSection() {
  const toast = useToast();
  const confirm = useConfirm();
  const [conn, setConn] = useState<Connection | null>(null);
  const [mockAllowed, setMockAllowed] = useState(false);
  const [parasutConfigured, setParasutConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [series, setSeries] = useState("");
  const [vat, setVat] = useState("20");
  const [recordPayments, setRecordPayments] = useState(true);

  function apply(c: Connection | null) {
    setConn(c);
    setSeries(c?.invoice_series ?? "");
    setVat(String(c?.default_vat_rate ?? 20));
    setRecordPayments(c?.record_payments ?? true);
  }

  useEffect(() => {
    fetch("/api/einvoice/connection", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { connection: null }))
      .then((d) => { apply(d.connection ?? null); setMockAllowed(!!d.mockAllowed); setParasutConfigured(!!d.parasutConfigured); })
      .catch(() => apply(null))
      .finally(() => setLoading(false));
  }, []);

  // Paraşüt girişinden dönüşün sonucu (/api/einvoice/callback → ?einvoice=… ).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ok = params.get("einvoice");
    const err = params.get("einvoice_error");
    if (!ok && !err) return;
    if (ok === "connected") toast.success("Paraşüt hesabınız bağlandı.");
    if (ok === "pending") toast.success("Paraşüt'e giriş yapıldı. Bağlanacak firmayı seçin.");
    if (err) toast.error(err);
    params.delete("einvoice");
    params.delete("einvoice_error");
    const qs = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash);
  }, [toast]);

  function connectParasut() {
    // Tam sayfa yönlendirme: sunucu PKCE/state çerezini yazıp Paraşüt girişine gönderir.
    window.location.href = "/api/einvoice/connect";
  }

  async function chooseCompany(companyId: string) {
    const d = await call("POST", "/api/einvoice/connection/company", { company_id: companyId });
    if (d) { apply(d.connection); toast.success("Paraşüt firması bağlandı."); }
  }

  async function testConnection() {
    const d = await call("GET", "/api/einvoice/connection/test");
    if (d) toast.success(`Bağlantı çalışıyor: ${d.companyName ?? d.companyId}${d.contactCount != null ? ` · ${d.contactCount} müşteri/tedarikçi kaydı` : ""}${d.user ? ` · ${d.user}` : ""}`);
  }

  async function call(method: string, url: string, body?: unknown) {
    setBusy(true);
    try {
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "İşlem başarısız.");
      return d;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "İşlem başarısız.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function connectMock() {
    const d = await call("POST", "/api/einvoice/connection/mock");
    if (d) { apply(d.connection); toast.success("Sahte sağlayıcıyla bağlandı (yalnızca geliştirme)."); }
  }

  async function save() {
    const d = await call("PATCH", "/api/einvoice/connection", { invoice_series: series, default_vat_rate: Number(vat), record_payments: recordPayments });
    if (d) { apply(d.connection); toast.success("e-Fatura ayarları kaydedildi."); }
  }

  async function disconnect() {
    if (!(await confirm({ message: "Bağlantıyı kesmek istediğinize emin misiniz? Kesilmiş faturalar kalır; yeniden bağlanana kadar yeni fatura kesilemez.", variant: "danger" }))) return;
    const d = await call("DELETE", "/api/einvoice/connection");
    if (d) { apply(conn ? { ...conn, status: "disabled" } : null); toast.success("Bağlantı kesildi."); }
  }

  const connected = conn && conn.status !== "disabled";

  return (
    <SettingsSection
      title="e-Fatura / e-Arşiv"
      description="Siparişten resmi fatura kesmek için kendi Paraşüt hesabınızı bağlayın. Fatura sizin Paraşüt hesabınızdan ve kontörünüzden kesilir."
    >
      {loading ? (
        <p className="text-sm text-gray-400">Yükleniyor...</p>
      ) : !connected ? (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">Bağlı bir hesap yok.</p>
          <button type="button" onClick={connectParasut} disabled={!parasutConfigured} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-blue-300" title={parasutConfigured ? undefined : "Paraşüt entegrasyonu yapılandırılmamış"}>
            Paraşüt&apos;e Bağlan
          </button>
          {mockAllowed && (
            <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 p-3">
              <p className="text-xs text-amber-800">Geliştirme ortamı: gerçek fatura kesmeyen sahte sağlayıcıyla akışı deneyebilirsiniz.</p>
              <button type="button" onClick={connectMock} disabled={busy} className="mt-2 rounded-lg border border-amber-400 bg-white px-3 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50">
                Sahte Sağlayıcıya Bağlan
              </button>
            </div>
          )}
        </div>
      ) : conn.status === "pending" ? (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">Paraşüt kullanıcınız birden çok firmaya erişebiliyor. Faturaların kesileceği firmayı seçin:</p>
          <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
            {(conn.pending_companies ?? []).map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div>
                  <div className="text-sm font-medium text-gray-800">{c.name}</div>
                  <div className="text-xs text-gray-500">Paraşüt no: {c.id}{c.taxNumber ? ` · VKN/TCKN: ${c.taxNumber}` : ""}</div>
                </div>
                <button type="button" onClick={() => chooseCompany(c.id)} disabled={busy} className="rounded-lg border border-blue-600 px-3 py-1.5 text-sm font-semibold text-blue-600 hover:bg-blue-50 disabled:opacity-50">
                  Bu Firmayı Bağla
                </button>
              </div>
            ))}
          </div>
          <button type="button" onClick={disconnect} disabled={busy} className="text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-50">Vazgeç</button>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-gray-800">{conn.company_name || "Bağlı hesap"}</div>
              <div className="text-xs text-gray-500">
                {conn.provider === "mock" ? "Sahte sağlayıcı (geliştirme — gerçek fatura kesilmez)" : "Paraşüt"}
                {conn.company_city ? ` · ${conn.company_city}${conn.company_district ? ` / ${conn.company_district}` : ""}` : ""}
              </div>
              {conn.status === "reauth" && <div className="mt-1 text-xs font-medium text-red-600">Bağlantının yenilenmesi gerekiyor. {conn.last_error}</div>}
            </div>
            <div className="flex flex-wrap items-center gap-4">
              {conn.provider === "parasut" && conn.status === "active" && (
                <button type="button" onClick={testConnection} disabled={busy} className="text-sm font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50">Bağlantıyı Test Et</button>
              )}
              {/* Süresi dolmuş bağlantı, ya da dev'de sahte sağlayıcıdan Paraşüt'e geçiş */}
              {parasutConfigured && (conn.status === "reauth" || conn.provider === "mock") && (
                <button type="button" onClick={connectParasut} disabled={busy} className="text-sm font-semibold text-blue-600 hover:text-blue-700 disabled:opacity-50">
                  {conn.status === "reauth" ? "Yeniden Bağlan" : "Paraşüt'e Geç"}
                </button>
              )}
              <button type="button" onClick={disconnect} disabled={busy} className="text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-50">Bağlantıyı Kes</button>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Fatura Serisi</span>
              <input value={series} onChange={(e) => setSeries(e.target.value.toUpperCase())} maxLength={10} placeholder="ELV" className={`w-full ${inputClass}`} />
              <span className="mt-1 block text-xs text-gray-400">Muhasebeciniz Elevire&apos;den kesilen faturaları bununla ayırt eder.</span>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Varsayılan KDV Oranı</span>
              <select value={vat} onChange={(e) => setVat(e.target.value)} className={`w-full bg-white ${inputClass}`}>
                {VAT_RATES.map((r) => <option key={r} value={r}>%{r}</option>)}
              </select>
              <span className="mt-1 block text-xs text-gray-400">Hizmetlerde ayrı oran seçilmemişse bu kullanılır. Tutarlar KDV dahildir.</span>
            </label>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-gray-700">Tahsilatları Paraşüt&apos;e İşle</div>
              <p className="mt-0.5 text-xs text-gray-400">Nakit/POS ödemeleri, kasası eşlenmişse faturaya tahsilat olarak işlenir. Cari kısım açık alacak kalır.</p>
            </div>
            <Switch label="Tahsilatları Paraşüt'e İşle" checked={recordPayments} onClick={() => setRecordPayments((v) => !v)} />
          </div>
          <button type="button" onClick={save} disabled={busy} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-blue-300">
            {busy ? "Kaydediliyor..." : "e-Fatura Ayarlarını Kaydet"}
          </button>
        </div>
      )}
    </SettingsSection>
  );
}
