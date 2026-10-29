"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useViewGuard, usePermission } from "../../AuthContext";
import { useToast } from "@/components/ToastProvider";
import { useConfirm } from "@/components/ConfirmProvider";
import { useDialog } from "@/lib/useDialog";
import PlateLink from "@/components/PlateLink";
import { formatCurrency, formatDate } from "@/lib/format";
import { formatPlate, isValidTrPlate, normalizePlate } from "@/lib/plate";
import { BulkSeasonChangeDialog } from "@/components/customer/BulkSeasonChangeDialog";

// Müşteri Detayı — kurumsal müşterinin firma sayfası: firma bilgisi, cari
// bakiye, bu ayın toplamı, filo araçları ve son siparişler (bkz. GET
// /api/customers/[id]). Araçlar elle eklenir; öneri listesi bu müşterinin
// geçmiş siparişlerindeki plakalardır (GET /api/customers/[id]/vehicles).

interface FleetVehicle {
  id: number;
  plate: string;
  order_count: number;
  last_service: string | null;
  total_spend: number | null;
  active_storage: {
    id: number; depo_no: number | null; mevsim: string | null; adet: number | null;
    ebat: string | null; marka: string | null; model_name: string | null;
  } | null;
}
interface CustomerDetail {
  customer: { id: number; name: string; phone: string | null; is_corporate: boolean; tax_no: string | null; contact_name: string | null; balance: number; credit_limit: number | null; discount_rate: number | null };
  month: { order_count: number; total: number } | null;
  vehicles: FleetVehicle[];
  can_view_orders: boolean;
}
interface CustomerOrder {
  id: number; custom_order_no: string | null; plate: string | null; total_amount: number | null; paid_amount: number | null;
  status: "BEKLEMEDE" | "TAMAMLANDI"; payment_type: string | null; created_at: string; driver_name: string | null;
}
interface Suggestion { plate: string; order_count: number; last_order: string; other_owner: string | null }

const ORDERS_PREVIEW = 15;

function day(iso: string): string {
  return formatDate(iso).slice(0, 10);
}

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const allowed = useViewGuard("customers");
  const canEdit = usePermission("customers.edit");
  const canViewOrders = usePermission("orders.view");
  const canEditStorage = usePermission("storage.edit");
  const [showSeason, setShowSeason] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState<CustomerDetail | null>(null);
  const [orders, setOrders] = useState<CustomerOrder[] | null>(null);
  const [showAllOrders, setShowAllOrders] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const addDialog = useDialog(() => setShowAdd(false));
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [manual, setManual] = useState("");
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/customers/${id}`, { cache: "no-store" });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) { setError(body.error || "Müşteri bilgisi yüklenemedi."); return; }
    setData(body);
  }, [id]);

  const loadOrders = useCallback(() => {
    if (!canViewOrders) return;
    fetch(`/api/customers/${id}/orders`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setOrders(Array.isArray(rows) ? rows : []))
      .catch(() => setOrders([]));
  }, [id, canViewOrders]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadOrders(); }, [loadOrders]);

  async function openAdd() {
    setShowAdd(true);
    setManual("");
    setSelected(new Set());
    setSuggestions(null);
    const r = await fetch(`/api/customers/${id}/vehicles`, { cache: "no-store" });
    const body = await r.json().catch(() => ({}));
    setSuggestions(Array.isArray(body.suggestions) ? body.suggestions : []);
  }

  function toggle(plate: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(plate)) next.delete(plate); else next.add(plate);
      return next;
    });
  }

  // Elle yazılan plakalar: satır, virgül ya da noktalı virgülle ayrılır.
  const manualPlates = manual.split(/[\n,;]+/).map((p) => p.trim()).filter(Boolean);
  const manualInvalid = manualPlates.filter((p) => !isValidTrPlate(normalizePlate(p)));
  const toAdd = Array.from(new Set([...selected, ...manualPlates.map(normalizePlate).filter(isValidTrPlate)]));

  async function postPlates(plates: string[], move: boolean) {
    const r = await fetch(`/api/customers/${id}/vehicles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plates, move }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || "Araçlar eklenemedi.");
    return body as { added: number; already: number; conflicts: { plate: string; owner: string | null }[]; invalid: string[] };
  }

  async function submitAdd() {
    if (toAdd.length === 0) { toast.error("Eklenecek geçerli bir plaka yok."); return; }
    setAdding(true);
    try {
      const result = await postPlates(toAdd, false);
      let added = result.added;
      if (result.conflicts.length > 0) {
        const list = result.conflicts.map((c) => `${formatPlate(c.plate)} (${c.owner ?? "başka firma"})`).join(", ");
        const ok = await confirm({
          message: `Şu araçlar başka bir firmaya bağlı: ${list}. Bu firmaya taşınsın mı?`,
          confirmText: "Taşı",
        });
        if (ok) added += (await postPlates(result.conflicts.map((c) => c.plate), true)).added;
      }
      toast.success(added > 0 ? `${added} araç eklendi.` : "Seçilen araçlar zaten bu firmada.");
      setShowAdd(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Hata oluştu.");
    } finally {
      setAdding(false);
    }
  }

  async function removeVehicle(v: FleetVehicle) {
    if (!(await confirm({
      message: `${formatPlate(v.plate)} bu firmadan çıkarılsın mı? Aracın geçmişi silinmez, yalnızca firma bağlantısı kalkar.`,
      confirmText: "Çıkar",
      variant: "danger",
    }))) return;
    setRemovingId(v.id);
    try {
      const r = await fetch(`/api/customers/${id}/vehicles/${v.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Çıkarılamadı.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Hata oluştu.");
    } finally {
      setRemovingId(null);
    }
  }

  if (!allowed) return null;
  if (error) return <div className="rounded-xl border border-v2-line bg-v2-surface p-8 text-center text-v2-fg-muted">{error}</div>;
  if (!data) return <div className="py-12 text-center text-v2-fg-muted">Yükleniyor...</div>;

  const { customer, month, vehicles } = data;
  const storageCount = vehicles.reduce((s, v) => s + (v.active_storage?.adet ?? 0), 0);
  const balance = customer.balance;
  const visibleOrders = orders ? (showAllOrders ? orders : orders.slice(0, ORDERS_PREVIEW)) : [];

  return (
    <div className="max-w-6xl">
      <Link prefetch={false} href="/admin/customers" className="mb-3 inline-block text-sm text-v2-link hover:underline">← Müşteriler</Link>
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-v2-fg [overflow-wrap:anywhere]">{customer.name}</h1>
            {customer.is_corporate && (
              <span className="rounded-md bg-v2-primary-soft px-2 py-0.5 text-xs font-semibold text-v2-info-fg">Kurumsal</span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-v2-fg-muted">
            {customer.contact_name && <span>Yetkili: {customer.contact_name}</span>}
            {customer.phone && <a href={`tel:${customer.phone}`} className="text-v2-link">{customer.phone}</a>}
            {customer.tax_no && <span>Vergi No: {customer.tax_no}</span>}
            {customer.discount_rate != null && <span>Kurumsal indirim: %{customer.discount_rate.toLocaleString("tr-TR")}</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 self-start">
          {canViewOrders && (
            <Link
              prefetch={false}
              href={`/admin/customers/${customer.id}/ekstre`}
              className="inline-flex h-11 items-center rounded-lg border border-v2-line bg-v2-surface px-4 text-sm font-semibold text-v2-fg hover:bg-v2-muted"
            >
              Ekstre
            </Link>
          )}
          {customer.is_corporate && canEditStorage && vehicles.some((v) => v.active_storage) && (
            <button
              type="button"
              onClick={() => setShowSeason(true)}
              className="inline-flex h-11 items-center rounded-lg border border-v2-line bg-v2-surface px-4 text-sm font-semibold text-v2-fg hover:bg-v2-muted"
            >
              Toplu Mevsim Değişimi
            </button>
          )}
          {customer.is_corporate && canEdit && (
            <button
              type="button"
              onClick={openAdd}
              className="inline-flex h-11 items-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
            >
              + Araç Ekle
            </button>
          )}
        </div>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ...(customer.is_corporate ? [{ label: "Araç", value: String(vehicles.length), sub: storageCount > 0 ? `${storageCount} lastik depoda` : "" }] : []),
          ...(month ? [{ label: "Bu Ay", value: formatCurrency(month.total), sub: `${month.order_count} sipariş` }] : []),
          {
            label: "Cari Bakiye",
            value: formatCurrency(Math.abs(balance)),
            sub: balance > 0.009 ? "Borçlu" : balance < -0.009 ? "Alacaklı" : "Borç yok",
            tone: balance > 0.009 ? "text-red-600" : balance < -0.009 ? "text-green-600" : "text-v2-fg",
          },
          ...(customer.credit_limit != null ? [{
            label: "Cari Limiti",
            value: formatCurrency(customer.credit_limit),
            sub: balance > customer.credit_limit + 0.005
              ? `${formatCurrency(balance - customer.credit_limit)} aşıldı`
              : `Kalan ${formatCurrency(customer.credit_limit - Math.max(balance, 0))}`,
            tone: balance > customer.credit_limit + 0.005 ? "text-red-600" : "text-v2-fg",
          }] : []),
        ].map((s) => (
          <div key={s.label} className="flex flex-col gap-1 rounded-xl border border-v2-line bg-v2-surface p-4 shadow-sm">
            <span className="text-[13px] text-v2-fg-muted">{s.label}</span>
            <span className={`text-xl font-bold tabular-nums ${"tone" in s ? s.tone : "text-v2-fg"}`}>{s.value}</span>
            {s.sub && <span className="text-xs text-v2-fg-subtle">{s.sub}</span>}
          </div>
        ))}
      </div>

      {customer.is_corporate ? (
        <section aria-labelledby="filo-araclar" className="mb-6 min-w-0 overflow-clip rounded-xl border border-v2-line bg-v2-surface shadow-sm">
          <div className="border-b border-v2-line px-5 py-4">
            <h2 id="filo-araclar" className="text-[15px] font-semibold text-v2-fg">Araçlar</h2>
            <p className="mt-0.5 text-xs text-v2-fg-subtle">Sipariş sayısı ve harcama, bu firmanın adıyla girilmiş siparişlerden hesaplanır.</p>
          </div>
          {vehicles.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-v2-fg-muted">
              Henüz araç eklenmemiş.{canEdit ? " \"+ Araç Ekle\" ile firmanın araçlarını ekleyin; geçmiş siparişlerdeki plakalar öneri olarak listelenir." : ""}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-v2-line bg-v2-surface-2 text-left text-v2-fg-muted">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Plaka</th>
                    <th className="px-4 py-2.5 font-medium">Son Servis</th>
                    <th className="px-4 py-2.5 text-right font-medium">Sipariş</th>
                    {data.can_view_orders && <th className="px-4 py-2.5 text-right font-medium">Toplam</th>}
                    <th className="px-4 py-2.5 font-medium">Depoda</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-v2-line">
                  {vehicles.map((v) => (
                    <tr key={v.id} className="hover:bg-v2-muted/60">
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <PlateLink plate={formatPlate(v.plate)} canLink={canViewOrders} className="font-v2-mono font-medium text-v2-fg" />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-v2-fg-muted">{v.last_service ? day(v.last_service) : "—"}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{v.order_count}</td>
                      {data.can_view_orders && <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{formatCurrency(v.total_spend ?? 0)}</td>}
                      <td className="whitespace-nowrap px-4 py-2.5 text-v2-fg-muted">
                        {v.active_storage
                          ? `${v.active_storage.adet ?? ""} ${v.active_storage.mevsim ? v.active_storage.mevsim.toLocaleLowerCase("tr-TR") : "lastik"}${v.active_storage.depo_no != null ? ` · Depo ${v.active_storage.depo_no}` : ""}`
                          : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <Link prefetch={false} href={`/?plate=${encodeURIComponent(v.plate)}`} className="text-xs font-semibold text-v2-link hover:underline">Sipariş</Link>
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => removeVehicle(v)}
                              disabled={removingId === v.id}
                              className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-40"
                            >
                              Çıkar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <p className="mb-6 rounded-xl border border-dashed border-v2-line px-5 py-4 text-sm text-v2-fg-muted">
          Bu müşteri kurumsal olarak işaretli değil. Araç listesi için Müşteriler ekranında Düzenle&apos;den &quot;Kurumsal müşteri&quot;yi işaretleyin.
        </p>
      )}

      {canViewOrders && (
        <section aria-labelledby="son-siparisler" className="min-w-0 overflow-clip rounded-xl border border-v2-line bg-v2-surface shadow-sm">
          <h2 id="son-siparisler" className="border-b border-v2-line px-5 py-4 text-[15px] font-semibold text-v2-fg">
            Siparişler{orders ? ` (${orders.length})` : ""}
          </h2>
          {orders === null ? (
            <p className="px-5 py-8 text-center text-sm text-v2-fg-muted">Yükleniyor...</p>
          ) : orders.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-v2-fg-muted">Bu müşteriye ait sipariş yok.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-v2-line bg-v2-surface-2 text-left text-v2-fg-muted">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Sipariş No</th>
                      <th className="px-4 py-2.5 font-medium">Tarih</th>
                      <th className="px-4 py-2.5 font-medium">Plaka</th>
                      <th className="px-4 py-2.5 font-medium">Aracı Getiren</th>
                      <th className="px-4 py-2.5 text-right font-medium">Tutar</th>
                      <th className="px-4 py-2.5 text-center font-medium">Durum</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-v2-line">
                    {visibleOrders.map((o) => (
                      <tr key={o.id} className="hover:bg-v2-muted/60">
                        <td className="whitespace-nowrap px-4 py-2.5">
                          <Link prefetch={false} href={`/admin/orders/${o.id}`} className="font-v2-mono font-semibold text-v2-link hover:underline">{o.custom_order_no || `#${o.id}`}</Link>
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-v2-fg-muted">{day(o.created_at)}</td>
                        <td className="whitespace-nowrap px-4 py-2.5">{o.plate ? <PlateLink plate={o.plate} className="font-v2-mono" /> : "—"}</td>
                        <td className="px-4 py-2.5 text-v2-fg-muted">{o.driver_name || "—"}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{formatCurrency(Number((o.paid_amount ?? o.total_amount) || 0))}</td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${o.status === "TAMAMLANDI" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                            {o.status === "TAMAMLANDI" ? "Tamamlandı" : "Beklemede"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {orders.length > ORDERS_PREVIEW && (
                <button
                  type="button"
                  onClick={() => setShowAllOrders((v) => !v)}
                  className="w-full border-t border-v2-line px-5 py-3 text-sm font-semibold text-v2-link hover:bg-v2-muted/60"
                >
                  {showAllOrders ? "Daha az göster" : `Tümünü göster (${orders.length})`}
                </button>
              )}
            </>
          )}
        </section>
      )}

      {showSeason && (
        <BulkSeasonChangeDialog
          customerId={customer.id}
          customerName={customer.name}
          vehicles={vehicles}
          onClose={() => setShowSeason(false)}
          onDone={() => { load(); loadOrders(); }}
        />
      )}

      {showAdd && (
        <div ref={addDialog} role="dialog" aria-modal="true" aria-label="Araç Ekle" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-1 text-xl font-bold text-gray-800">{customer.name} — Araç Ekle</h2>
            <p className="mb-4 text-sm text-gray-500">Plakaları yazın ya da bu firmanın geçmiş siparişlerinden seçin.</p>

            <label htmlFor="arac-ekle-plakalar" className="mb-1 block text-sm font-medium text-gray-700">Plakalar</label>
            <textarea
              id="arac-ekle-plakalar"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              rows={3}
              placeholder={"34 ABC 123\n34 DEF 456"}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {manualInvalid.length > 0 && (
              <p className="mt-1 text-xs text-red-600">Plaka biçimine uymuyor: {manualInvalid.join(", ")}</p>
            )}

            <div className="mt-4 mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Geçmiş siparişlerdeki plakalar</span>
              {suggestions && suggestions.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelected(selected.size === suggestions.length ? new Set() : new Set(suggestions.map((s) => s.plate)))}
                  className="text-xs font-semibold text-blue-600 hover:underline"
                >
                  {selected.size === suggestions.length ? "Seçimi temizle" : "Tümünü seç"}
                </button>
              )}
            </div>
            <div className="min-h-[80px] flex-1 overflow-y-auto rounded-lg border border-gray-200">
              {suggestions === null ? (
                <p className="px-3 py-6 text-center text-sm text-gray-400">Yükleniyor...</p>
              ) : suggestions.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-gray-400">Öneri yok — bu firmanın siparişlerinde eklenmemiş geçerli plaka bulunamadı.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {suggestions.map((s) => (
                    <li key={s.plate}>
                      <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-gray-50">
                        <input type="checkbox" checked={selected.has(s.plate)} onChange={() => toggle(s.plate)} className="h-4 w-4 rounded border-gray-300" />
                        <span className="w-28 font-mono text-sm font-medium text-gray-800">{formatPlate(s.plate)}</span>
                        <span className="flex-1 text-xs text-gray-500">
                          {s.order_count} sipariş · son {day(s.last_order)}
                          {s.other_owner && <span className="ml-1 text-amber-700">· {s.other_owner} firmasında</span>}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-5 flex gap-3">
              <button type="button" onClick={() => setShowAdd(false)} className="flex-1 rounded-lg border border-gray-300 py-2.5 font-medium text-gray-700 hover:bg-gray-50">
                İptal
              </button>
              <button
                type="button"
                onClick={submitAdd}
                disabled={adding || toAdd.length === 0}
                className="flex-1 rounded-lg bg-blue-600 py-2.5 font-semibold text-white transition-colors hover:bg-blue-700 disabled:bg-blue-300"
              >
                {adding ? "Ekleniyor..." : toAdd.length > 0 ? `${toAdd.length} Araç Ekle` : "Araç Ekle"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
