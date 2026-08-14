"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { formatCurrency } from "@/lib/format";

interface DailyDatum {
  date: string;
  ciro: number;
  maliyet: number;
}
interface ServiceStat {
  name: string;
  count: number;
  ciro: number;
  maliyet: number;
}
interface Summary {
  total_orders: number;
  total_revenue: number;
  completed: number;
  pending: number;
}
interface PaymentBreakdown {
  payment_type: string;
  total: number;
}

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];

const now = new Date();

type PeriodView = "day" | "week" | "month";

function formatDayLabel(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function formatMonthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString("tr-TR", { month: "long", year: "numeric" });
}

// Pazartesi başlangıçlı hafta aralığı (YYYY-MM-DD, yerel/takvim tabanlı — saat
// dilimi kayması riski olmasın diye tarih string'i T00:00:00 ile ayrıştırılır).
function weekRange(dateStr: string): { start: string; end: string } {
  const d = new Date(`${dateStr}T00:00:00`);
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const toStr = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  return { start: toStr(monday), end: toStr(sunday) };
}

// "Dönemsel Ciro / Maliyet / Kâr" widget'ı, üstteki Ay/Yıl seçiciyle gelen veriye
// (data.dailyData, zaten o aya sabitli) göre çalışır — seçili ayda veri olan EN
// GÜNCEL günü referans alır. Günlük sadece o referans günü gösterir (dünkü bir
// sipariş Günlük'te görünmez); Haftalık o günü içeren haftanın (seçili ay içindeki
// kısmının) toplamını, Aylık ise seçili ayın tamamının toplamını gösterir.
function computePeriodRow(
  dailyData: DailyDatum[], view: PeriodView, year: number, month: number
): { label: string; ciro: number; maliyet: number } {
  if (dailyData.length === 0) {
    const lastDay = new Date(year, month, 0).getDate();
    const refDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    if (view === "day") return { label: formatDayLabel(refDate), ciro: 0, maliyet: 0 };
    if (view === "week") {
      const { start, end } = weekRange(refDate);
      return { label: `${formatDayLabel(start)} – ${formatDayLabel(end)}`, ciro: 0, maliyet: 0 };
    }
    return { label: formatMonthLabel(year, month), ciro: 0, maliyet: 0 };
  }

  const refDate = [...dailyData].sort((a, b) => b.date.localeCompare(a.date))[0].date;

  if (view === "day") {
    const d = dailyData.find((x) => x.date === refDate)!;
    return { label: formatDayLabel(refDate), ciro: Number(d.ciro), maliyet: Number(d.maliyet) };
  }
  if (view === "week") {
    const { start, end } = weekRange(refDate);
    const inWeek = dailyData.filter((x) => x.date >= start && x.date <= end);
    return {
      label: `${formatDayLabel(start)} – ${formatDayLabel(end)}`,
      ciro: inWeek.reduce((s, x) => s + Number(x.ciro), 0),
      maliyet: inWeek.reduce((s, x) => s + Number(x.maliyet), 0),
    };
  }
  return {
    label: formatMonthLabel(year, month),
    ciro: dailyData.reduce((s, x) => s + Number(x.ciro), 0),
    maliyet: dailyData.reduce((s, x) => s + Number(x.maliyet), 0),
  };
}

// Recharts prop'ları (interval, fontSize, height) CSS breakpoint'leriyle değil
// JS ile ayarlanır — mobilde günlük grafikte 31 gün etiketinin üst üste
// binmemesi için bu bilgiye ihtiyaç var.
function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isMobile;
}

export default function ReportsPage() {
  const isMobile = useIsMobile();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [periodView, setPeriodView] = useState<PeriodView>("day");
  const [mailOrderOpen, setMailOrderOpen] = useState(false);
  const [data, setData] = useState<{
    dailyData: DailyDatum[];
    serviceStats: ServiceStat[];
    summary: Summary | null;
    paymentBreakdown: PaymentBreakdown[];
  }>({ dailyData: [], serviceStats: [], summary: null, paymentBreakdown: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/reports?year=${year}&month=${month}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [year, month]);

  const months = [
    "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
    "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
  ];

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  const s = data.summary;

  const daysInMonth = new Date(year, month, 0).getDate();
  const dailyChartData = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const found = data.dailyData.find((d) => d.date === dateStr);
    const ciro = found ? Number(found.ciro) : 0;
    const maliyet = found ? Number(found.maliyet) : 0;
    return { day, ciro, maliyet, kar: ciro - maliyet };
  });

  const activePeriodRow = computePeriodRow(data.dailyData, periodView, year, month);

  // "<Tedarikçi> Mail Order" etiketleri tek bir "Mail Order" kutusunda toplanır;
  // tıklanınca tedarikçi bazlı dökümü açılır.
  const mailOrderItems = data.paymentBreakdown.filter((p) => p.payment_type.endsWith(" Mail Order"));
  const otherPayments = data.paymentBreakdown.filter((p) => !p.payment_type.endsWith(" Mail Order"));
  const mailOrderTotal = mailOrderItems.reduce((sum, p) => sum + Number(p.total || 0), 0);

  const serviceCountTotal = data.serviceStats.reduce((sum, s) => sum + s.count, 0);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Raporlar & İstatistikler</h1>
        <div className="flex gap-2">
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {months.map((m, i) => (
              <option key={i} value={i + 1}>{m}</option>
            ))}
          </select>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-20">Yükleniyor...</div>
      ) : (
        <>
          {/* Özet Kartlar */}
          {s && (
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-white rounded-xl shadow-sm p-4 min-w-0">
                <p className="text-xs text-gray-500 mb-1">Toplam Sipariş</p>
                <p className="text-xl sm:text-2xl font-bold text-gray-800 truncate">{s.total_orders}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {s.completed} tamamlandı, {s.pending} bekliyor
                </p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-4 min-w-0">
                <p className="text-xs text-gray-500 mb-1">Toplam Gelir</p>
                <p className="text-xl sm:text-2xl font-bold text-green-600 truncate">
                  {formatCurrency(Number(s.total_revenue || 0))}
                </p>
              </div>
            </div>
          )}

          {/* Ödeme Tipi Kırılımı */}
          {data.paymentBreakdown.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm p-5 mb-6">
              <h2 className="font-semibold text-gray-700 mb-4">Ödeme Tipine Göre Gelir</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {otherPayments.map((p) => (
                  <div key={p.payment_type} className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 mb-1 truncate">{p.payment_type}</p>
                    <p className="text-sm font-bold text-gray-800">{formatCurrency(Number(p.total || 0))}</p>
                  </div>
                ))}
                {mailOrderItems.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setMailOrderOpen((v) => !v)}
                    className="bg-gray-50 hover:bg-gray-100 transition-colors rounded-lg p-3 text-left"
                  >
                    <p className="text-xs text-gray-500 mb-1 flex items-center gap-1 truncate">
                      Mail Order
                      <svg
                        className={`w-3 h-3 shrink-0 transition-transform ${mailOrderOpen ? "rotate-180" : ""}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </p>
                    <p className="text-sm font-bold text-gray-800">{formatCurrency(mailOrderTotal)}</p>
                  </button>
                )}
              </div>
              {mailOrderOpen && mailOrderItems.length > 0 && (
                <div className="mt-3 border border-gray-200 rounded-lg divide-y divide-gray-100">
                  {mailOrderItems.map((p) => (
                    <div key={p.payment_type} className="flex justify-between px-3 py-2 text-sm">
                      <span className="text-gray-600">{p.payment_type.replace(" Mail Order", "")}</span>
                      <span className="font-medium text-gray-800">{formatCurrency(Number(p.total || 0))}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Günlük Gelir Grafiği */}
          <div className="bg-white rounded-xl shadow-sm p-5 mb-6">
            <h2 className="font-semibold text-gray-700 mb-4">Günlük Ciro / Maliyet / Kâr (₺)</h2>
            {dailyChartData.every((d) => d.ciro === 0 && d.maliyet === 0) ? (
              <div className="h-40 flex items-center justify-center text-gray-400">
                Bu ay için veri yok.
              </div>
            ) : (
              <ResponsiveContainer key={isMobile ? "mobile" : "desktop"} width="100%" height={isMobile ? 240 : 280}>
                <BarChart data={dailyChartData} margin={{ left: 0, right: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: isMobile ? 9 : 12 }}
                    interval={isMobile ? Math.ceil(dailyChartData.length / 8) - 1 : 0}
                  />
                  <YAxis tick={{ fontSize: isMobile ? 10 : 12 }} width={isMobile ? 42 : 60} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload || payload.length === 0) return null;
                      const row = payload[0].payload as DailyDatum & { kar: number };
                      return (
                        <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs space-y-0.5">
                          <p className="font-medium text-gray-700 mb-1">{label}. Gün</p>
                          <p className="text-gray-800 font-semibold">Ciro: {formatCurrency(row.ciro)}</p>
                          <p style={{ color: "#f59e0b" }}>Maliyet: {formatCurrency(row.maliyet)}</p>
                          <p style={{ color: "#10b981" }}>Kâr: {formatCurrency(row.kar)}</p>
                        </div>
                      );
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: isMobile ? 11 : 13 }} />
                  {/* Maliyet + Kâr üst üste yığılır — toplam yükseklik Ciro'ya eşittir,
                      böylece tek (daha kalın) bar üzerinde maliyet/kâr oranı görülür.
                      isAnimationActive=false: bu recharts sürümünde stacked bar'ların
                      büyüme animasyonu tamamlanmıyor ve barlar hiç çizilmeden kalıyor. */}
                  <Bar dataKey="maliyet" name="Maliyet" stackId="ciro" fill="#f59e0b" radius={[0, 0, 4, 4]} isAnimationActive={false} />
                  <Bar dataKey="kar" name="Kâr" stackId="ciro" fill="#10b981" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Dönemsel Ciro / Maliyet / Kâr Tablosu */}
          <div className="bg-white rounded-xl shadow-sm p-5 mb-6">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h2 className="font-semibold text-gray-700">Dönemsel Ciro / Maliyet / Kâr</h2>
              <div className="flex gap-1">
                {([
                  { v: "day", label: "Günlük" },
                  { v: "week", label: "Haftalık" },
                  { v: "month", label: "Aylık" },
                ] as { v: PeriodView; label: string }[]).map(({ v, label }) => (
                  <button
                    key={v}
                    onClick={() => setPeriodView(v)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      periodView === v ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs sm:text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-2 sm:px-3 py-2 font-medium text-gray-600">Dönem</th>
                    <th className="text-right px-2 sm:px-3 py-2 font-medium text-gray-600">Ciro</th>
                    <th className="text-right px-2 sm:px-3 py-2 font-medium text-gray-600">Maliyet</th>
                    <th className="text-right px-2 sm:px-3 py-2 font-medium text-gray-600">Kâr</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <tr>
                    <td className="px-2 sm:px-3 py-2 text-gray-700">{activePeriodRow.label}</td>
                    <td className="px-2 sm:px-3 py-2 text-right text-gray-800 font-medium whitespace-nowrap">
                      {formatCurrency(activePeriodRow.ciro)}
                    </td>
                    <td className="px-2 sm:px-3 py-2 text-right text-gray-500 whitespace-nowrap">
                      {formatCurrency(activePeriodRow.maliyet)}
                    </td>
                    <td className={`px-2 sm:px-3 py-2 text-right font-semibold whitespace-nowrap ${activePeriodRow.ciro - activePeriodRow.maliyet >= 0 ? "text-green-600" : "text-red-500"}`}>
                      {formatCurrency(activePeriodRow.ciro - activePeriodRow.maliyet)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Hizmet Dağılımı */}
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h2 className="font-semibold text-gray-700 mb-4">Hizmet Dağılımı</h2>
            {data.serviceStats.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-gray-400">
                Bu ay için veri yok.
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                {/* Çok sayıda küçük yüzdeli hizmet olunca pasta grafiğin dilim
                    etiketleri üst üste binip okunmaz hale geliyordu — bunun
                    yerine tek, orantılı bir çubuk kullanılır; adları ve tam
                    sayıları zaten hemen altındaki tabloda okunuyor. */}
                <div className="w-full h-6 rounded-lg overflow-hidden flex bg-gray-100">
                  {data.serviceStats.map((s, i) => {
                    const pct = serviceCountTotal > 0 ? (s.count / serviceCountTotal) * 100 : 0;
                    if (pct <= 0) return null;
                    return (
                      <div
                        key={s.name}
                        title={`${s.name}: %${pct.toFixed(0)} (${s.count} adet)`}
                        style={{ width: `${pct}%`, background: COLORS[i % COLORS.length] }}
                        className="h-full"
                      />
                    );
                  })}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs sm:text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Hizmet</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-600">Adet</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-600">Ciro</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-600">Maliyet</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-600">Kâr</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {data.serviceStats.map((s, i) => {
                        const kar = s.ciro - s.maliyet;
                        return (
                          <tr key={s.name}>
                            <td className="px-3 py-2 text-gray-700">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                                <span className="truncate">{s.name}</span>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right text-gray-600 whitespace-nowrap">{s.count}</td>
                            <td className="px-3 py-2 text-right text-gray-800 font-medium whitespace-nowrap">{formatCurrency(s.ciro)}</td>
                            <td className="px-3 py-2 text-right text-gray-500 whitespace-nowrap">{formatCurrency(s.maliyet)}</td>
                            <td className={`px-3 py-2 text-right font-semibold whitespace-nowrap ${kar >= 0 ? "text-green-600" : "text-red-500"}`}>
                              {formatCurrency(kar)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
