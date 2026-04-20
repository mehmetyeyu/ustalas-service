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
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { formatCurrency } from "@/lib/format";

interface DayRevenue {
  day: number;
  revenue: number;
}
interface ServiceStat {
  name: string;
  count: number;
}
interface Summary {
  total_orders: number;
  total_revenue: number;
  nakit: number;
  kredi_karti: number;
  havale: number;
  completed: number;
  pending: number;
}

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];

const now = new Date();

export default function ReportsPage() {
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<{
    dailyRevenue: DayRevenue[];
    serviceStats: ServiceStat[];
    summary: Summary | null;
  }>({ dailyRevenue: [], serviceStats: [], summary: null });
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
    const found = data.dailyRevenue.find((d) => d.day === day);
    return { day, revenue: found ? Number(found.revenue) : 0 };
  });

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
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <div className="bg-white rounded-xl shadow-sm p-4">
                <p className="text-xs text-gray-500 mb-1">Toplam Sipariş</p>
                <p className="text-2xl font-bold text-gray-800">{s.total_orders}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {s.completed} tamamlandı, {s.pending} bekliyor
                </p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-4">
                <p className="text-xs text-gray-500 mb-1">Toplam Gelir</p>
                <p className="text-2xl font-bold text-green-600">
                  {formatCurrency(Number(s.total_revenue || 0))}
                </p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-4">
                <p className="text-xs text-gray-500 mb-1">Nakit</p>
                <p className="text-xl font-bold text-gray-800">{formatCurrency(Number(s.nakit || 0))}</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-4">
                <p className="text-xs text-gray-500 mb-1">K.Kartı / Havale</p>
                <p className="text-xl font-bold text-gray-800">
                  {formatCurrency(Number(s.kredi_karti || 0) + Number(s.havale || 0))}
                </p>
              </div>
            </div>
          )}

          {/* Günlük Gelir Grafiği */}
          <div className="bg-white rounded-xl shadow-sm p-5 mb-6">
            <h2 className="font-semibold text-gray-700 mb-4">Günlük Gelir (₺)</h2>
            {dailyChartData.every((d) => d.revenue === 0) ? (
              <div className="h-40 flex items-center justify-center text-gray-400">
                Bu ay için veri yok.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={dailyChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(value: number) => [formatCurrency(value), "Gelir"]}
                  />
                  <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
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
                <div className="w-full shrink-0">
                  <ResponsiveContainer width="100%" height={350}>
                    <PieChart>
                      <Pie
                        data={data.serviceStats}
                        dataKey="count"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                      >
                        {data.serviceStats.map((_, index) => (
                          <Cell key={index} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col space-y-2 self-center">
                  {data.serviceStats.map((s, i) => (
                    <div key={s.name} className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ background: COLORS[i % COLORS.length] }}
                        />
                        <span className="text-sm text-gray-700 truncate">{s.name}</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-800 shrink-0">{s.count} kez</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
