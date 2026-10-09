"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import Link from "next/link";
import { formatCurrency } from "@/lib/format";
import { useViewGuard, usePermission, useAuth } from "../AuthContext";
import { useToast } from "@/components/ToastProvider";
import { TRNumberInput } from "@/components/TRNumberInput";

interface DailyDatum {
  date: string;
  ciro: number;
  maliyet: number;
  masraf: number;
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
  total_expenses: number;
  completed: number;
  pending: number;
}
interface PaymentBreakdown {
  payment_type: string;
  total: number;
}
interface UnaddedRecurring {
  id: number;
  category: string;
}
interface CashRegister {
  income: number;
  expense: number;
  balance: number;
}
interface PeriodSummary {
  ciro: number;
  maliyet: number;
  masraf: number;
}
// Dönemsel ve Hizmet Dağılımı widget'larının HER İKİSİ de bağımsız kendi tarih
// aralığını (Tarih + Günlük/Haftalık/Aylık kısayolları) seçebilir — üstteki
// Ay/Yıl seçiciden tamamen ayrı. "to" dahildir (inclusive); backend'e
// gönderilirken exclusive üst sınıra çevrilir (bkz. /api/reports).
interface DateRange {
  from: string;
  to: string;
}

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];

const now = new Date();

type PeriodView = "day" | "week" | "month";

function formatDayLabel(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function dateRangeLabel(range: DateRange): string {
  return range.from === range.to
    ? formatDayLabel(range.from)
    : `${formatDayLabel(range.from)} – ${formatDayLabel(range.to)}`;
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function todayStr(): string {
  return toDateStr(new Date());
}

// Pazartesi başlangıçlı hafta aralığı (YYYY-MM-DD, yerel/takvim tabanlı — saat
// dilimi kayması riski olmasın diye tarih string'i T00:00:00 ile ayrıştırılır).
function weekRange(dateStr: string): { start: string; end: string } {
  const d = new Date(`${dateStr}T00:00:00`);
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: toDateStr(monday), end: toDateStr(sunday) };
}

function monthRange(dateStr: string): { start: string; end: string } {
  const d = new Date(`${dateStr}T00:00:00`);
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { start: toDateStr(first), end: toDateStr(last) };
}

// Dönemsel ve Hizmet Dağılımı widget'larının Günlük/Haftalık/Aylık kısayol
// butonları — ikisi de kendi bağımsız DateRange state'ini bugüne göre
// (üstteki Ay/Yıl seçiciden bağımsız) doldurur.
function presetRange(view: PeriodView): DateRange {
  const today = todayStr();
  if (view === "day") return { from: today, to: today };
  if (view === "week") { const { start, end } = weekRange(today); return { from: start, to: end }; }
  const { start, end } = monthRange(today);
  return { from: start, to: end };
}

// Kısayol butonlarından biri az önce tıklanmışsa (ya da elle girilen aralık
// tesadüfen tam eşleşiyorsa) o buton mavi vurgulanır — aksi halde hiçbiri
// (kullanıcı serbest bir aralık seçmiş demektir).
function matchesPreset(range: DateRange, view: PeriodView): boolean {
  const preset = presetRange(view);
  return range.from === preset.from && range.to === preset.to;
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

// Dönemsel ve Hizmet Dağılımı'nın İKİSİNDE de kullanılan ortak kontrol satırı
// (Tarih aralığı + Günlük/Haftalık/Aylık kısayolları) — kopya-yapıştır sürüklenmesin
// diye tek bileşende toplanır, her widget kendi DateRange state'ini geçirir.
function DateRangeControls({ range, onChange }: { range: DateRange; onChange: (r: DateRange) => void }) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-500">Tarih:</label>
        <input
          type="date"
          value={range.from}
          max={range.to}
          onChange={(e) => onChange({ ...range, from: e.target.value })}
          className="border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <span className="text-xs text-gray-400">–</span>
        <input
          type="date"
          value={range.to}
          min={range.from}
          onChange={(e) => onChange({ ...range, to: e.target.value })}
          className="border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div className="flex gap-1">
        {([
          { v: "day", label: "Günlük" },
          { v: "week", label: "Haftalık" },
          { v: "month", label: "Aylık" },
        ] as { v: PeriodView; label: string }[]).map(({ v, label }) => (
          <button
            key={v}
            onClick={() => onChange(presetRange(v))}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              matchesPreset(range, v) ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

interface MonthlyFinancialRow {
  month: number;
  ciro: number;
  maliyet: number;
  income: number;
  expense: number;
  kar: number;
  isSaved: boolean;
}

const MONTH_NAMES_SHORT = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

// Müşteri isteği: Raporlar'daki Ciro/Maliyet/Masraf'tan ayrı, admin'in elle
// onaylayıp "resmi" hâle getirdiği bir Ay/Gelir/Gider/Kâr özeti — bkz.
// database/schema.sql monthly_financials yorumu ve GET/PUT
// /api/reports/monthly-financials. Bir ay hiç kaydedilmemişse Gelir/Gider
// sistemden önerilir (sarı "öneri" rozetiyle işaretlenir) ama admin
// "Kaydet"e basana kadar hiçbir şey yazılmaz. Gelir = Ciro - Maliyet,
// Gider = Masraf (müşteri isteğiyle netleştirildi, bkz. route.ts yorumu).
function YillikOzetTab() {
  const toast = useToast();
  const { user } = useAuth();
  const canEdit = user?.role === "admin";
  const isMobile = useIsMobile();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [months, setMonths] = useState<MonthlyFinancialRow[]>([]);
  const [totals, setTotals] = useState({ ciro: 0, maliyet: 0, income: 0, expense: 0, kar: 0 });
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<number, { income: string; expense: string }>>({});
  const [savingMonth, setSavingMonth] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/reports/monthly-financials?year=${year}`)
      .then((r) => r.json())
      .then((d: { months: MonthlyFinancialRow[]; totals: typeof totals }) => {
        setMonths(d.months);
        setTotals(d.totals);
        setDrafts(Object.fromEntries(d.months.map((m) => [m.month, { income: String(m.income), expense: String(m.expense) }])));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [year]);

  async function handleSave(month: number) {
    const draft = drafts[month];
    if (!draft) return;
    setSavingMonth(month);
    try {
      const res = await fetch("/api/reports/monthly-financials", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, month, income: draft.income, expense: draft.expense }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Kaydedilemedi.");
        return;
      }
      setMonths((prev) => {
        // PUT yanıtı ciro/maliyet döndürmez (bkz. route.ts yorumu, bunlar
        // hiç saklanmaz) — önceki satırdaki canlı değerler korunur.
        const next = prev.map((m) => (m.month === month ? { ...m, ...(data as Partial<MonthlyFinancialRow>) } : m));
        setTotals(next.reduce((acc, m) => ({ ciro: acc.ciro + m.ciro, maliyet: acc.maliyet + m.maliyet, income: acc.income + m.income, expense: acc.expense + m.expense, kar: acc.kar + m.kar }), { ciro: 0, maliyet: 0, income: 0, expense: 0, kar: 0 }));
        return next;
      });
      toast.success(`${MONTH_NAMES_SHORT[month - 1]} kaydedildi.`);
    } finally {
      setSavingMonth(null);
    }
  }

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-700">Yıllık Özet</h2>
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

      {loading ? (
        <div className="text-center text-gray-400 py-20">Yükleniyor...</div>
      ) : (
        <>
        <div className="bg-white rounded-xl shadow-sm p-5 mb-6">
          <ResponsiveContainer key={isMobile ? "mobile" : "desktop"} width="100%" height={isMobile ? 240 : 300}>
            <ComposedChart data={months.map((m) => ({ name: MONTH_NAMES_SHORT[m.month - 1].slice(0, 3), gelir: m.income, gider: m.expense, kar: m.kar }))} margin={{ left: 0, right: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: isMobile ? 9 : 12 }} />
              <YAxis tick={{ fontSize: isMobile ? 10 : 12 }} width={isMobile ? 42 : 60} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const row = payload[0].payload as { gelir: number; gider: number; kar: number };
                  return (
                    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs space-y-0.5">
                      <p className="font-medium text-gray-700 mb-1">{label}</p>
                      <p style={{ color: "#3b82f6" }}>Gelir: {formatCurrency(row.gelir)}</p>
                      <p style={{ color: "#ef4444" }}>Gider: {formatCurrency(row.gider)}</p>
                      <p style={{ color: "#10b981" }}>Kâr/Zarar: {formatCurrency(row.kar)}</p>
                    </div>
                  );
                }}
              />
              <Legend wrapperStyle={{ fontSize: isMobile ? 11 : 13 }} />
              {/* Ciro/Maliyet kırılımı bilinçli olarak burada değil, tabloda
                  gösteriliyor — chart tek hikayeye (aylık kârlılık) odaklanır,
                  kesin rakam karşılaştırması tabloya bırakılır. */}
              <Bar dataKey="gelir" name="Gelir" fill="#3b82f6" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              <Bar dataKey="gider" name="Gider" fill="#ef4444" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              <Line type="monotone" dataKey="kar" name="Kâr/Zarar" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Ay</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Ciro (₺)</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Maliyet (₺)</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Gelir (₺)</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Gider (₺)</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Kâr / Zarar</th>
                  {canEdit && <th className="px-4 py-3"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {months.map((m) => {
                  const draft = drafts[m.month] ?? { income: "0", expense: "0" };
                  const draftKar = (Number(draft.income) || 0) - (Number(draft.expense) || 0);
                  const dirty = Number(draft.income) !== m.income || Number(draft.expense) !== m.expense;
                  return (
                    <tr key={m.month} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">
                        {MONTH_NAMES_SHORT[m.month - 1]}
                        {!m.isSaved && (
                          <span className="ml-2 inline-block px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700 align-middle">
                            öneri
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500 whitespace-nowrap">{formatCurrency(m.ciro)}</td>
                      <td className="px-4 py-3 text-right text-gray-500 whitespace-nowrap">{formatCurrency(m.maliyet)}</td>
                      <td className="px-4 py-3 text-right">
                        {canEdit ? (
                          <TRNumberInput
                            value={draft.income}
                            onChange={(raw) => setDrafts((prev) => ({ ...prev, [m.month]: { ...prev[m.month], income: raw } }))}
                            className="w-32 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        ) : (
                          <span className="text-gray-700 whitespace-nowrap">{formatCurrency(m.income)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canEdit ? (
                          <TRNumberInput
                            value={draft.expense}
                            onChange={(raw) => setDrafts((prev) => ({ ...prev, [m.month]: { ...prev[m.month], expense: raw } }))}
                            className="w-32 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        ) : (
                          <span className="text-gray-700 whitespace-nowrap">{formatCurrency(m.expense)}</span>
                        )}
                      </td>
                      <td className={`px-4 py-3 text-right font-semibold whitespace-nowrap ${(canEdit ? draftKar : m.kar) >= 0 ? "text-green-600" : "text-red-500"}`}>
                        {formatCurrency(canEdit ? draftKar : m.kar)}
                      </td>
                      {canEdit && (
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleSave(m.month)}
                            disabled={!dirty || savingMonth === m.month}
                            className="text-blue-600 hover:text-blue-800 text-xs font-medium disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            {savingMonth === m.month ? "..." : "Kaydet"}
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                <tr>
                  <td className="px-4 py-3 font-bold text-gray-800 whitespace-nowrap">Yıl Toplamı</td>
                  <td className="px-4 py-3 text-right font-bold text-gray-800 whitespace-nowrap">{formatCurrency(totals.ciro)}</td>
                  <td className="px-4 py-3 text-right font-bold text-gray-800 whitespace-nowrap">{formatCurrency(totals.maliyet)}</td>
                  <td className="px-4 py-3 text-right font-bold text-gray-800 whitespace-nowrap">{formatCurrency(totals.income)}</td>
                  <td className="px-4 py-3 text-right font-bold text-gray-800 whitespace-nowrap">{formatCurrency(totals.expense)}</td>
                  <td className={`px-4 py-3 text-right font-bold whitespace-nowrap ${totals.kar >= 0 ? "text-green-600" : "text-red-500"}`}>
                    {formatCurrency(totals.kar)}
                  </td>
                  {canEdit && <td className="px-4 py-3"></td>}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
        </>
      )}
    </div>
  );
}

export default function ReportsPage() {
  const allowed = useViewGuard("reports");
  const canViewKasa = usePermission("kasa.view");
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState<"genel" | "yillik">("genel");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  // Dönemsel ve Hizmet Dağılımı, üstteki Ay/Yıl'dan TAMAMEN BAĞIMSIZ kendi
  // tarih aralıklarını yönetir (kullanıcı isteği) — ikisi de varsayılan
  // olarak bugünle başlar, Tarih alanlarından elle veya Günlük/Haftalık/Aylık
  // kısayollarıyla değiştirilebilir.
  const [periodRange, setPeriodRange] = useState<DateRange>(() => presetRange("day"));
  const [serviceRange, setServiceRange] = useState<DateRange>(() => presetRange("day"));
  const [mailOrderOpen, setMailOrderOpen] = useState(false);
  const [data, setData] = useState<{
    dailyData: DailyDatum[];
    serviceStats: ServiceStat[];
    summary: Summary | null;
    paymentBreakdown: PaymentBreakdown[];
    unaddedRecurring: UnaddedRecurring[];
    periodSummary: PeriodSummary | null;
  }>({ dailyData: [], serviceStats: [], summary: null, paymentBreakdown: [], unaddedRecurring: [], periodSummary: null });
  const [loading, setLoading] = useState(true);
  // Kasa (Nakit) Özeti, Ay/Yıl/Dönemsel/Hizmet Dağılımı filtrelerinden
  // TAMAMEN bağımsız (kuruluştan bugüne tüm zamanların toplamı) — bu yüzden
  // yukarıdaki filtre-bağımlı fetch'ten AYRI, sadece mount'ta bir kez
  // çekilir; aksi halde kullanıcı sadece ay değiştirse bile sunucu sınırsız
  // bir UNION'ı yeniden hesaplardı (bkz. /api/reports/cash-summary yorumu).
  const [cashRegister, setCashRegister] = useState<CashRegister | null>(null);

  useEffect(() => {
    fetch("/api/reports/cash-summary")
      .then((r) => r.json())
      .then((d) => setCashRegister(d))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({
      year: String(year), month: String(month),
      periodFrom: periodRange.from, periodTo: periodRange.to,
      serviceFrom: serviceRange.from, serviceTo: serviceRange.to,
    });
    fetch(`/api/reports?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [year, month, periodRange.from, periodRange.to, serviceRange.from, serviceRange.to]);

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
    const masraf = found ? Number(found.masraf) : 0;
    return { day, ciro, maliyet, masraf, kar: ciro - maliyet - masraf };
  });

  const periodSummary = data.periodSummary ?? { ciro: 0, maliyet: 0, masraf: 0 };

  // "<Tedarikçi> Mail Order" etiketleri tek bir "Mail Order" kutusunda toplanır;
  // tıklanınca tedarikçi bazlı dökümü açılır.
  const mailOrderItems = data.paymentBreakdown.filter((p) => p.payment_type.endsWith(" Mail Order"));
  const otherPayments = data.paymentBreakdown.filter((p) => !p.payment_type.endsWith(" Mail Order"));
  const mailOrderTotal = mailOrderItems.reduce((sum, p) => sum + Number(p.total || 0), 0);

  const serviceCountTotal = data.serviceStats.reduce((sum, s) => sum + s.count, 0);

  if (!allowed) return null;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Raporlar & İstatistikler</h1>
        {activeTab === "genel" && (
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
        )}
      </div>

      {/* Genel Bakış: mevcut Ciro/Maliyet/Masraf tabanlı raporlar — Yıllık Özet:
          admin'in elle onayladığı, "resmi" Gelir/Gider/Kâr kaydı (bkz.
          YillikOzetTab yorumu). İkisi kasıtlı olarak ayrı: biri ham/canlı
          veri, diğeri dondurulmuş/onaylı kayıt. */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        <button
          onClick={() => setActiveTab("genel")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${activeTab === "genel" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
        >
          Genel Bakış
        </button>
        <button
          onClick={() => setActiveTab("yillik")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${activeTab === "yillik" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
        >
          Yıllık Özet
        </button>
      </div>

      {activeTab === "yillik" ? (
        <YillikOzetTab />
      ) : loading ? (
        <div className="text-center text-gray-400 py-20">Yükleniyor...</div>
      ) : (
        <>
          {/* Kasa (Nakit) — ay seçiciden BAĞIMSIZ, kuruluştan bugüne tüm zamanların
              toplamı. Fiziksel kasadaki nakit ay sınırında sıfırlanmadığından
              aşağıdaki ay bazlı kartlardan ayrı, kendi başlığıyla gösterilir. */}
          {cashRegister && (
            <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3 gap-0.5">
                <p className="text-sm font-semibold text-gray-700">Kasa (Nakit) — Tüm Zamanlar</p>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-gray-400">Seçili aydan bağımsız, kuruluştan bugüne</span>
                  {canViewKasa && (
                    <Link href="/admin/kasa" className="text-xs text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap">
                      Detaylı Görüntüle →
                    </Link>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 mb-1">Nakit Gelir</p>
                  <p className="text-lg sm:text-xl font-bold text-green-600 truncate">
                    {formatCurrency(cashRegister.income)}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 mb-1">Nakit Masraf</p>
                  <p className="text-lg sm:text-xl font-bold text-red-500 truncate">
                    {formatCurrency(cashRegister.expense)}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 mb-1">Kasada Kalan</p>
                  <p className={`text-lg sm:text-xl font-bold truncate ${cashRegister.balance >= 0 ? "text-gray-800" : "text-red-500"}`}>
                    {formatCurrency(cashRegister.balance)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Özet Kartlar */}
          {s && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
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
              <div className="bg-white rounded-xl shadow-sm p-4 min-w-0 col-span-2 sm:col-span-1">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-xs text-gray-500">Toplam Masraf</p>
                  {/* Bu ay için henüz "Sabit Giderleri Ekle" ile masrafa
                      dönüştürülmemiş aktif sabit gider varsa (ör. unutulmuş
                      kira) rozet olarak uyarır — bu tutar henüz Kâr hesabında
                      yer almıyor, o yüzden ay olduğundan kârlı görünüyor olabilir. */}
                  {data.unaddedRecurring.length > 0 && (
                    <Link
                      href="/admin/expenses"
                      title={`Eklenmemiş sabit giderler: ${data.unaddedRecurring.map((r) => r.category).join(", ")}`}
                      className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors whitespace-nowrap"
                    >
                      +{data.unaddedRecurring.length} eklenmedi
                    </Link>
                  )}
                </div>
                <p className="text-xl sm:text-2xl font-bold text-red-500 truncate">
                  {formatCurrency(Number(s.total_expenses || 0))}
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
            <h2 className="font-semibold text-gray-700 mb-4">Günlük Ciro / Maliyet / Masraf / Kâr (₺)</h2>
            {dailyChartData.every((d) => d.ciro === 0 && d.maliyet === 0 && d.masraf === 0) ? (
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
                          <p style={{ color: "#ef4444" }}>Masraf: {formatCurrency(row.masraf)}</p>
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
                  <Bar dataKey="masraf" name="Masraf" stackId="ciro" fill="#ef4444" isAnimationActive={false} />
                  <Bar dataKey="kar" name="Kâr" stackId="ciro" fill="#10b981" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Dönemsel Ciro / Maliyet / Kâr Tablosu */}
          <div className="bg-white rounded-xl shadow-sm p-5 mb-6">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h2 className="font-semibold text-gray-700">Dönemsel Ciro / Maliyet / Masraf / Kâr</h2>
              <DateRangeControls range={periodRange} onChange={setPeriodRange} />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs sm:text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-2 sm:px-3 py-2 font-medium text-gray-600">Dönem</th>
                    <th className="text-right px-2 sm:px-3 py-2 font-medium text-gray-600">Ciro</th>
                    <th className="text-right px-2 sm:px-3 py-2 font-medium text-gray-600">Maliyet</th>
                    <th className="text-right px-2 sm:px-3 py-2 font-medium text-gray-600">Masraf</th>
                    <th className="text-right px-2 sm:px-3 py-2 font-medium text-gray-600">Kâr</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <tr>
                    <td className="px-2 sm:px-3 py-2 text-gray-700">{dateRangeLabel(periodRange)}</td>
                    <td className="px-2 sm:px-3 py-2 text-right text-gray-800 font-medium whitespace-nowrap">
                      {formatCurrency(periodSummary.ciro)}
                    </td>
                    <td className="px-2 sm:px-3 py-2 text-right text-gray-500 whitespace-nowrap">
                      {formatCurrency(periodSummary.maliyet)}
                    </td>
                    <td className="px-2 sm:px-3 py-2 text-right text-red-500 whitespace-nowrap">
                      {formatCurrency(periodSummary.masraf)}
                    </td>
                    <td className={`px-2 sm:px-3 py-2 text-right font-semibold whitespace-nowrap ${periodSummary.ciro - periodSummary.maliyet - periodSummary.masraf >= 0 ? "text-green-600" : "text-red-500"}`}>
                      {formatCurrency(periodSummary.ciro - periodSummary.maliyet - periodSummary.masraf)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Hizmet Dağılımı */}
          <div className="bg-white rounded-xl shadow-sm p-5">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h2 className="font-semibold text-gray-700">Hizmet Dağılımı</h2>
              <DateRangeControls range={serviceRange} onChange={setServiceRange} />
            </div>
            {data.serviceStats.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-gray-400">
                Bu dönem için veri yok.
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
