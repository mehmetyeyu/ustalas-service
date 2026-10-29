"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useViewGuard, usePermission } from "../../AuthContext";
import { formatCurrency, formatDate } from "@/lib/format";
import { formatPlate } from "@/lib/plate";
import { formatISODate } from "@/lib/quotes";
import { weekYearLabel } from "@/lib/weekYear";

// Araç kartı — bir plakanın vehicle_id ile bağlı siparişleri, depodaki
// lastikleri ve randevuları tek ekranda (bkz. GET /api/vehicles/[plate]).
// Araç kaydı özellik açıldıktan sonra girilen kayıtlarla dolar; eski
// siparişler plaka metniyle bilerek eşleştirilmez (uydurma plakalar).

interface VehicleOrder {
  id: number; custom_order_no: string | null; created_at: string; status: string; total_amount: number;
  customer_name: string | null; customer_phone: string | null; payment_type: string | null; summary: string | null; products: string | null;
  driver_name: string | null;
}
interface VehicleStorage {
  id: number; depo_no: number | null; customer_name: string | null; ebat: string | null; marka: string | null; model_name: string | null;
  adet: number | null; mevsim: string | null; dis_derinligi: string | null; production_week: number | null; production_year: number | null;
  islem_tarihi: string | null; teslim_edildi: boolean; teslim_tarihi: string | null;
}
interface VehicleAppointment { id: number; requested_at: string; status: string; customer_name: string | null; service_name: string | null; order_id: number | null }
interface VehicleCard {
  // fleet: aracın bağlı olduğu kurumsal müşteri (bkz. vehicles.customer_id).
  vehicle: { id: number; plate: string; created_at: string; fleet: { id: number; name: string } | null };
  orders: VehicleOrder[];
  storage: VehicleStorage[];
  appointments: VehicleAppointment[];
  can_view_storage: boolean;
  can_view_appointments: boolean;
}

type TimelineItem = { key: string; at: string; kind: "SİPARİŞ" | "DEPO" | "RANDEVU"; title: string; detail: string; amount: number | null; href: string | null };

const KIND_STYLE: Record<TimelineItem["kind"], string> = {
  "SİPARİŞ": "bg-v2-primary-soft text-v2-info-fg",
  DEPO: "bg-v2-success-bg text-v2-success-fg",
  RANDEVU: "bg-v2-warning-bg text-v2-warning-fg",
};

const APPOINTMENT_LABELS: Record<string, string> = {
  BEKLEMEDE: "Onay bekliyor", ONAYLANDI: "Onaylandı", REDDEDILDI: "Reddedildi", TAMAMLANDI: "Siparişe dönüştü", IPTAL: "İptal", GELMEDI: "Gelmedi",
};

function day(iso: string): string {
  return formatDate(iso).slice(0, 10);
}

function buildTimeline(card: VehicleCard): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const o of card.orders) {
    items.push({
      key: `o${o.id}`, at: o.created_at, kind: "SİPARİŞ",
      title: `Sipariş ${o.custom_order_no || `#${o.id}`}${o.summary ? ` · ${o.summary}` : ""}`,
      detail: [o.status === "TAMAMLANDI" ? "Tamamlandı" : "Beklemede", o.payment_type, o.customer_name, o.driver_name ? `Getiren: ${o.driver_name}` : null, o.products].filter(Boolean).join(" · "),
      amount: o.total_amount, href: `/admin/orders/${o.id}`,
    });
  }
  for (const s of card.storage) {
    const tire = [s.adet ? `${s.adet} ×` : null, s.marka, s.model_name, s.ebat, s.mevsim].filter(Boolean).join(" ");
    if (s.islem_tarihi) {
      items.push({ key: `s${s.id}`, at: s.islem_tarihi, kind: "DEPO", title: `Depoya alındı${s.depo_no != null ? ` · Depo No ${s.depo_no}` : ""}`, detail: tire, amount: null, href: null });
    }
    if (s.teslim_edildi && s.teslim_tarihi) {
      items.push({ key: `t${s.id}`, at: s.teslim_tarihi, kind: "DEPO", title: "Depodan teslim edildi", detail: tire, amount: null, href: null });
    }
  }
  for (const a of card.appointments) {
    items.push({
      key: `a${a.id}`, at: a.requested_at, kind: "RANDEVU",
      title: `${a.service_name || "Randevu"} · ${new Date(a.requested_at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" })}`,
      detail: [APPOINTMENT_LABELS[a.status] ?? a.status, a.customer_name].filter(Boolean).join(" · "),
      amount: null, href: a.order_id ? `/admin/orders/${a.order_id}` : null,
    });
  }
  // Depo tarihleri "YYYY-MM-DD" (gün), diğerleri zaman damgası — gün
  // karşılaştırması için ikisi de Date'e çevrilir.
  return items.sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime());
}

export default function VehicleCardPage() {
  const { plate } = useParams<{ plate: string }>();
  const allowed = useViewGuard("orders");
  const canViewCustomers = usePermission("customers.view");
  const [card, setCard] = useState<VehicleCard | null>(null);
  const [missing, setMissing] = useState<{ plate: string; valid: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/vehicles/${encodeURIComponent(plate)}`, { cache: "no-store" })
      .then(async (r) => {
        const data = await r.json();
        if (r.status === 404 && "valid" in data) { setMissing({ plate: data.plate, valid: data.valid }); return; }
        if (!r.ok) throw new Error(data.error || "Araç bilgisi yüklenemedi.");
        setCard(data);
      })
      .catch((e: Error) => setError(e.message));
  }, [plate]);

  if (!allowed) return null;
  if (error) return <div className="rounded-xl border border-v2-line bg-v2-surface p-8 text-center text-v2-fg-muted">{error}</div>;
  if (missing) {
    return (
      <div className="max-w-2xl rounded-xl border border-v2-line bg-v2-surface p-8 shadow-sm">
        <h1 className="mb-2 text-xl font-semibold text-v2-fg">{missing.valid ? formatPlate(missing.plate) : "Geçersiz plaka"}</h1>
        <p className="text-sm text-v2-fg-muted">
          {missing.valid
            ? "Bu plakayla bağlı bir kayıt henüz yok. Araç kartı, bu özellik açıldıktan sonra girilen sipariş, depolama ve randevularla dolar; daha eski kayıtlar karta eklenmez."
            : "Bu değer Türk plaka biçimine uymuyor, bu yüzden araç olarak takip edilmiyor."}
        </p>
      </div>
    );
  }
  if (!card) return <div className="text-center text-v2-fg-muted py-12">Yükleniyor...</div>;

  const timeline = buildTimeline(card);
  const lastOrder = card.orders[0] ?? null;
  const totalSpend = card.orders.reduce((s, o) => s + Number(o.total_amount || 0), 0);
  const activeStorage = card.storage.filter((s) => !s.teslim_edildi);
  const now = Date.now();
  const upcoming = card.appointments
    .filter((a) => new Date(a.requested_at).getTime() >= now && (a.status === "BEKLEMEDE" || a.status === "ONAYLANDI"))
    .sort((a, b) => new Date(a.requested_at).getTime() - new Date(b.requested_at).getTime())[0] ?? null;
  const lastTire = card.orders.find((o) => o.products) ?? null;
  const customers = Array.from(new Set(card.orders.map((o) => o.customer_name).filter(Boolean)));

  return (
    <div className="max-w-6xl">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex overflow-hidden rounded-md border-2 border-v2-fg bg-v2-surface">
            <span className="flex items-end bg-[#1E4E9C] px-1.5 py-2 text-[11px] font-bold text-white">TR</span>
            <h1 className="px-3.5 py-1 font-v2-mono text-[26px] font-semibold tracking-wider text-v2-fg">{formatPlate(card.vehicle.plate)}</h1>
          </div>
          <div className="flex flex-col gap-0.5 text-sm text-v2-fg-muted">
            {card.vehicle.fleet && (
              <span className="self-start rounded-md bg-v2-primary-soft px-2 py-0.5 text-xs font-semibold text-v2-info-fg">
                Filo aracı ·{" "}
                {canViewCustomers ? (
                  <Link prefetch={false} href={`/admin/customers/${card.vehicle.fleet.id}`} className="underline-offset-2 hover:underline">{card.vehicle.fleet.name}</Link>
                ) : card.vehicle.fleet.name}
              </span>
            )}
            {lastOrder?.customer_name && <span className="text-base font-semibold text-v2-fg">{lastOrder.customer_name}</span>}
            {lastOrder?.customer_phone && <a href={`tel:${lastOrder.customer_phone}`} className="text-v2-link">{lastOrder.customer_phone}</a>}
            {customers.length > 1 && <span className="text-v2-warning-fg">Bu araçta {customers.length} farklı müşteri adı geçiyor</span>}
          </div>
        </div>
        <Link
          prefetch={false}
          href={`/?plate=${encodeURIComponent(card.vehicle.plate)}`}
          className="inline-flex h-11 items-center self-start rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 sm:self-auto"
        >
          + Bu Araç İçin Sipariş
        </Link>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Toplam Harcama", value: formatCurrency(totalSpend), sub: `${card.orders.length} sipariş` },
          { label: "Son Ziyaret", value: lastOrder ? day(lastOrder.created_at) : "—", sub: lastOrder ? `${Math.max(0, Math.round((now - new Date(lastOrder.created_at).getTime()) / 864e5))} gün önce` : "" },
          { label: "Depoda", value: activeStorage.length > 0 ? `${activeStorage.reduce((s, x) => s + (x.adet ?? 0), 0)} lastik` : "Yok", sub: activeStorage.map((s) => (s.depo_no != null ? `Depo ${s.depo_no}` : "")).filter(Boolean).join(", ") },
          { label: "Araç kaydı", value: day(card.vehicle.created_at), sub: "ilk bağlanan kayıt" },
        ].map((s) => (
          <div key={s.label} className="flex flex-col gap-1 rounded-xl border border-v2-line bg-v2-surface p-4 shadow-sm">
            <span className="text-[13px] text-v2-fg-muted">{s.label}</span>
            <span className="text-xl font-bold tabular-nums text-v2-fg">{s.value}</span>
            {s.sub && <span className="text-xs text-v2-fg-subtle">{s.sub}</span>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <section aria-labelledby="arac-gecmis" className="min-w-0 overflow-clip rounded-xl border border-v2-line bg-v2-surface shadow-sm">
          <h2 id="arac-gecmis" className="border-b border-v2-line px-5 py-4 text-[15px] font-semibold text-v2-fg">Araç Geçmişi</h2>
          {timeline.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-v2-fg-muted">Henüz kayıt yok.</p>
          ) : (
            <ul className="divide-y divide-v2-line">
              {timeline.map((t) => {
                const body = (
                  <>
                    <span className="w-24 shrink-0 pt-0.5 text-[13px] text-v2-fg-subtle">{day(t.at)}</span>
                    <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold tracking-wide ${KIND_STYLE[t.kind]}`}>{t.kind}</span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-sm font-semibold text-v2-fg">{t.title}</span>
                      {t.detail && <span className="text-[13px] text-v2-fg-muted">{t.detail}</span>}
                    </span>
                    {t.amount != null && <span className="shrink-0 text-sm font-semibold tabular-nums text-v2-fg">{formatCurrency(t.amount)}</span>}
                  </>
                );
                return (
                  <li key={t.key}>
                    {t.href ? (
                      <Link prefetch={false} href={t.href} className="flex items-start gap-3 px-5 py-3.5 hover:bg-v2-muted/60">{body}</Link>
                    ) : (
                      <div className="flex items-start gap-3 px-5 py-3.5">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside className="flex flex-col gap-6">
          {card.can_view_storage && (
            <section aria-labelledby="arac-depo" className="rounded-xl border border-v2-line bg-v2-surface p-5 shadow-sm">
              <h2 id="arac-depo" className="mb-3 text-[15px] font-semibold text-v2-fg">Depodaki Lastikler</h2>
              {activeStorage.length === 0 ? (
                <p className="text-sm text-v2-fg-muted">Depoda lastiği yok.</p>
              ) : activeStorage.map((s) => (
                <dl key={s.id} className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                  <div><dt className="text-xs text-v2-fg-subtle">Depo No</dt><dd className="font-semibold">{s.depo_no ?? "—"}</dd></div>
                  <div><dt className="text-xs text-v2-fg-subtle">Giriş</dt><dd className="font-semibold">{s.islem_tarihi ? formatISODate(s.islem_tarihi) : "—"}</dd></div>
                  <div className="col-span-2"><dt className="text-xs text-v2-fg-subtle">Lastik</dt><dd className="font-semibold">{[s.adet ? `${s.adet} ×` : null, s.marka, s.model_name, s.ebat, s.mevsim].filter(Boolean).join(" ") || "—"}</dd></div>
                  <div><dt className="text-xs text-v2-fg-subtle">DOT</dt><dd className="font-semibold">{weekYearLabel(s.production_week, s.production_year)}</dd></div>
                  <div><dt className="text-xs text-v2-fg-subtle">Diş derinliği</dt><dd className="font-semibold">{s.dis_derinligi || "—"}</dd></div>
                </dl>
              ))}
            </section>
          )}
          {card.can_view_appointments && (
            <section aria-labelledby="arac-randevu" className="rounded-xl border border-v2-line bg-v2-surface p-5 shadow-sm">
              <h2 id="arac-randevu" className="mb-2 text-[15px] font-semibold text-v2-fg">Yaklaşan Randevu</h2>
              {upcoming ? (
                <div className="flex flex-col gap-0.5 text-sm">
                  <strong>{formatDate(upcoming.requested_at)}</strong>
                  <span className="text-v2-fg-muted">{upcoming.service_name || "Randevu"} · {APPOINTMENT_LABELS[upcoming.status]}</span>
                </div>
              ) : (
                <p className="text-sm text-v2-fg-muted">Yaklaşan randevu yok.</p>
              )}
            </section>
          )}
          <section aria-labelledby="arac-lastik" className="rounded-xl border border-v2-line bg-v2-surface p-5 shadow-sm">
            <h2 id="arac-lastik" className="mb-2 text-[15px] font-semibold text-v2-fg">Son Satılan Lastik</h2>
            {lastTire ? (
              <div className="flex flex-col gap-0.5 text-sm">
                <strong>{lastTire.products}</strong>
                <span className="text-v2-fg-muted">{day(lastTire.created_at)} · Sipariş {lastTire.custom_order_no || `#${lastTire.id}`}</span>
              </div>
            ) : (
              <p className="text-sm text-v2-fg-muted">Bu araca stoktan lastik satışı kaydı yok.</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
