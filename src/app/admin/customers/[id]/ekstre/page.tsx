"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useViewGuard, usePermission } from "../../../AuthContext";
import { useToast } from "@/components/ToastProvider";
import { useCompanyInfo } from "@/lib/queries";
import { formatCurrency } from "@/lib/format";
import { formatISODate } from "@/lib/quotes";
import type { CompanyDoc } from "@/lib/quoteDocument";
import { buildWhatsAppUrl } from "@/lib/quoteDocument";
import {
  buildStatementPrintHtml, buildStatementWhatsAppText, entryDescription, parseStatementMonth, shiftMonth, type Statement,
} from "@/lib/statement";

// Aylık cari ekstre ekranı — GET /api/customers/[id]/statement. Yazdır
// (PDF'e kaydet), Excel ve WhatsApp özeti. ?month=YYYY-MM; yoksa bu ay.

function currentMonth(): string {
  const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", timeZone: "Europe/Istanbul" }).formatToParts(new Date());
  return `${parts.find((p) => p.type === "year")!.value}-${parts.find((p) => p.type === "month")!.value}`;
}

function balanceText(b: number): string {
  if (b > 0.009) return `${formatCurrency(b)} borç`;
  if (b < -0.009) return `${formatCurrency(-b)} alacak`;
  return formatCurrency(0);
}

// useSearchParams Suspense sınırı ister (bkz. src/app/page.tsx OrderPage).
export default function StatementPage() {
  return (
    <Suspense fallback={null}>
      <StatementPageInner />
    </Suspense>
  );
}

function StatementPageInner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const allowed = useViewGuard("customers");
  const canViewOrders = usePermission("orders.view");
  const toast = useToast();
  const company = useCompanyInfo<CompanyDoc>().data ?? null;
  const thisMonth = currentMonth();
  const requested = searchParams.get("month");
  const month = parseStatementMonth(requested) ? requested! : thisMonth;
  const period = parseStatementMonth(month)!;
  const [data, setData] = useState<Statement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setError(null);
    fetch(`/api/customers/${id}/statement?month=${month}`, { cache: "no-store" })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error || "Ekstre yüklenemedi.");
        setData(body);
      })
      .catch((e: Error) => setError(e.message));
  }, [id, month]);

  function goto(m: string) {
    router.replace(`/admin/customers/${id}/ekstre?month=${m}`);
  }

  function print() {
    if (!data) return;
    const win = window.open("", "_blank");
    if (!win) { toast.error("Yazdırma penceresi açılamadı — tarayıcının açılır pencere engelini kontrol edin."); return; }
    win.document.write(buildStatementPrintHtml(data, company));
    win.document.close();
  }

  function whatsapp() {
    if (!data) return;
    window.open(buildWhatsAppUrl(data.customer.phone, buildStatementWhatsAppText(data, company?.name ?? null)), "_blank", "noopener");
  }

  if (!allowed) return null;
  if (!canViewOrders) {
    return <div className="rounded-xl border border-v2-line bg-v2-surface p-8 text-center text-v2-fg-muted">Ekstre için Siparişler görüntüleme izni gerekir.</div>;
  }

  return (
    <div className="max-w-6xl">
      <Link prefetch={false} href={`/admin/customers/${id}`} className="mb-3 inline-block text-sm text-v2-link hover:underline">← {data?.customer.name ?? "Müşteri"}</Link>
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-v2-fg">Cari Ekstre</h1>
          {data && <p className="mt-0.5 text-sm text-v2-fg-muted">{data.customer.name}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-lg border border-v2-line bg-v2-surface">
            <button type="button" aria-label="Önceki ay" onClick={() => goto(shiftMonth(month, -1))} className="px-3 py-2 text-v2-fg-muted hover:text-v2-fg">‹</button>
            <span className="min-w-[110px] text-center text-sm font-semibold text-v2-fg">{period.label}</span>
            <button
              type="button"
              aria-label="Sonraki ay"
              onClick={() => goto(shiftMonth(month, 1))}
              disabled={month >= thisMonth}
              className="px-3 py-2 text-v2-fg-muted hover:text-v2-fg disabled:opacity-30"
            >
              ›
            </button>
          </div>
          <button type="button" onClick={print} disabled={!data} className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">Yazdır / PDF</button>
          <a
            href={`/api/customers/${id}/statement?month=${month}&format=xlsx`}
            className="inline-flex h-10 items-center rounded-lg border border-v2-line bg-v2-surface px-4 text-sm font-semibold text-v2-fg hover:bg-v2-muted"
          >
            Excel
          </a>
          <button type="button" onClick={whatsapp} disabled={!data} className="h-10 rounded-lg border border-v2-line bg-v2-surface px-4 text-sm font-semibold text-v2-fg hover:bg-v2-muted disabled:opacity-50">WhatsApp</button>
        </div>
      </header>

      {error ? (
        <div className="rounded-xl border border-v2-line bg-v2-surface p-8 text-center text-v2-fg-muted">{error}</div>
      ) : !data ? (
        <div className="py-12 text-center text-v2-fg-muted">Yükleniyor...</div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: "Devreden Bakiye", value: balanceText(data.opening_balance) },
              { label: "Bu Ay Borç", value: formatCurrency(data.total_debt) },
              { label: "Bu Ay Tahsilat", value: formatCurrency(data.total_credit) },
              { label: "Ay Sonu Bakiye", value: balanceText(data.closing_balance), strong: true },
            ].map((s) => (
              <div key={s.label} className="flex flex-col gap-1 rounded-xl border border-v2-line bg-v2-surface p-4 shadow-sm">
                <span className="text-[13px] text-v2-fg-muted">{s.label}</span>
                <span className={`text-lg font-bold tabular-nums ${s.strong && data.closing_balance > 0.009 ? "text-red-600" : "text-v2-fg"}`}>{s.value}</span>
              </div>
            ))}
          </div>

          <section aria-labelledby="ekstre-hareketler" className="mb-6 min-w-0 overflow-clip rounded-xl border border-v2-line bg-v2-surface shadow-sm">
            <h2 id="ekstre-hareketler" className="border-b border-v2-line px-5 py-4 text-[15px] font-semibold text-v2-fg">Cari Hareketler</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-v2-line bg-v2-surface-2 text-left text-v2-fg-muted">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Tarih</th>
                    <th className="px-4 py-2.5 font-medium">Açıklama</th>
                    <th className="px-4 py-2.5 font-medium">Plaka</th>
                    <th className="px-4 py-2.5 text-right font-medium">Borç</th>
                    <th className="px-4 py-2.5 text-right font-medium">Alacak</th>
                    <th className="px-4 py-2.5 text-right font-medium">Bakiye</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-v2-line">
                  <tr className="bg-v2-muted/40 font-semibold">
                    <td className="whitespace-nowrap px-4 py-2.5">{formatISODate(period.start)}</td>
                    <td className="px-4 py-2.5" colSpan={4}>Devreden bakiye</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{formatCurrency(data.opening_balance)}</td>
                  </tr>
                  {data.entries.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-6 text-center text-v2-fg-muted">Bu ay cari hareket yok.</td></tr>
                  )}
                  {data.entries.map((e) => (
                    <tr key={e.id}>
                      <td className="whitespace-nowrap px-4 py-2.5 text-v2-fg-muted">{formatISODate(e.entry_date)}</td>
                      <td className="px-4 py-2.5">
                        {e.order_id ? (
                          <Link prefetch={false} href={`/admin/orders/${e.order_id}`} className="text-v2-link hover:underline">{entryDescription(e)}</Link>
                        ) : entryDescription(e)}
                        {e.driver_name && <div className="text-xs text-v2-fg-subtle">Getiren: {e.driver_name}</div>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 font-v2-mono">{e.plate || "—"}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-red-600">{e.direction === 1 ? formatCurrency(e.amount) : ""}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-green-600">{e.direction === -1 ? formatCurrency(e.amount) : ""}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{formatCurrency(e.running_balance)}</td>
                    </tr>
                  ))}
                  <tr className="bg-v2-muted/40 font-semibold">
                    <td className="px-4 py-2.5"></td>
                    <td className="px-4 py-2.5" colSpan={2}>Ay sonu bakiye</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{formatCurrency(data.total_debt)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{formatCurrency(data.total_credit)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{formatCurrency(data.closing_balance)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="ekstre-araclar" className="min-w-0 overflow-clip rounded-xl border border-v2-line bg-v2-surface shadow-sm">
            <div className="border-b border-v2-line px-5 py-4">
              <h2 id="ekstre-araclar" className="text-[15px] font-semibold text-v2-fg">Araç Bazında Tamamlanan İşlemler</h2>
              <p className="mt-0.5 text-xs text-v2-fg-subtle">Bu ay tamamlanan bütün siparişler, ödeme şeklinden bağımsız.</p>
            </div>
            {data.vehicles.length === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-v2-fg-muted">Bu ay tamamlanan sipariş yok.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-v2-line bg-v2-surface-2 text-left text-v2-fg-muted">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Plaka</th>
                    <th className="px-4 py-2.5 text-right font-medium">Sipariş</th>
                    <th className="px-4 py-2.5 text-right font-medium">Tutar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-v2-line">
                  {data.vehicles.map((v) => (
                    <tr key={v.plate}>
                      <td className="px-4 py-2.5 font-v2-mono">{v.plate}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{v.order_count}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{formatCurrency(v.total)}</td>
                    </tr>
                  ))}
                  <tr className="bg-v2-muted/40 font-semibold">
                    <td className="px-4 py-2.5">Toplam</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{data.order_count}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{formatCurrency(data.orders_total)}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  );
}
