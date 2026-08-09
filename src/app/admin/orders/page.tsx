"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { formatDate, formatCurrency } from "@/lib/format";
import { parseOrderRows, chunk, type ParsedOrder } from "@/lib/ordersExcel";

const IMPORT_BATCH_SIZE = 20;

const COLUMNS: { key: string; label: string; defaultVisible: boolean }[] = [
  { key: "order_no", label: "Sipariş No", defaultVisible: true },
  { key: "date", label: "Tarih", defaultVisible: true },
  { key: "customer_name", label: "Müşteri", defaultVisible: true },
  { key: "plate", label: "Plaka", defaultVisible: true },
  { key: "service_name", label: "Yapılan İşlem", defaultVisible: true },
  { key: "supplier", label: "Tedarikçi", defaultVisible: true },
  { key: "stock_code", label: "Stok Kodu", defaultVisible: false },
  { key: "size_desc", label: "Ebat/Ürün", defaultVisible: false },
  { key: "quantity", label: "Adet", defaultVisible: true },
  { key: "unit_price", label: "Tutar", defaultVisible: true },
  { key: "cost_price", label: "Maliyet", defaultVisible: false },
  { key: "kar", label: "Kar", defaultVisible: false },
  { key: "payment_type", label: "Ödeme Şekli", defaultVisible: true },
  { key: "notes", label: "Açıklama", defaultVisible: true },
];

interface OrderRow {
  id: number;
  plate: string;
  customer_name: string | null;
  notes: string | null;
  payment_type: string | null;
  status: "BEKLEMEDE" | "TAMAMLANDI";
  created_at: string;
  line_id: number | null;
  service_name: string | null;
  supplier: string | null;
  stock_code: string | null;
  size_desc: string | null;
  quantity: number | null;
  unit_price: number | null;
  cost_price: number | null;
}

function toLocalDate(d: Date): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Istanbul" }).format(d);
}

const TODAY = toLocalDate(new Date());

type SortKey = "order_no" | "date" | "customer_name" | "plate" | "service_name" | "supplier"
  | "stock_code" | "size_desc" | "quantity" | "unit_price" | "cost_price" | "kar" | "payment_type" | "notes" | "status";
type SortDir = "asc" | "desc";

// Tüm satırlar zaten tek seferde çekildiği için (bkz. fetchOrders) sıralama
// istemcide yapılır — sunucuya ekstra istek gerekmez.
function sortValue(r: OrderRow, key: SortKey): string | number {
  switch (key) {
    case "order_no": return r.id;
    case "date": return r.created_at;
    case "customer_name": return r.customer_name ?? "";
    case "plate": return r.plate ?? "";
    case "service_name": return r.service_name ?? "";
    case "supplier": return r.supplier ?? "";
    case "stock_code": return r.stock_code ?? "";
    case "size_desc": return r.size_desc ?? "";
    case "quantity": return r.quantity ?? 0;
    case "unit_price": return r.unit_price ?? 0;
    case "cost_price": return r.cost_price ?? 0;
    case "kar": return Number(r.unit_price ?? 0) - Number(r.cost_price ?? 0);
    case "payment_type": return r.payment_type ?? "";
    case "notes": return r.notes ?? "";
    case "status": return r.status;
  }
}

function sortRows(rows: OrderRow[], key: SortKey | null, dir: SortDir): OrderRow[] {
  if (!key) return rows;
  const sorted = [...rows].sort((a, b) => {
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    if (typeof va === "number" && typeof vb === "number") return va - vb;
    return String(va).localeCompare(String(vb), "tr-TR");
  });
  return dir === "asc" ? sorted : sorted.reverse();
}

function getDateRange(filter: string): { dateFrom: string; dateTo: string } {
  const now = new Date();
  if (filter === "bugun") return { dateFrom: TODAY, dateTo: TODAY };
  if (filter === "bu_hafta") {
    const day = now.getDay() || 7;
    const mon = new Date(now);
    mon.setDate(now.getDate() - day + 1);
    return { dateFrom: toLocalDate(mon), dateTo: TODAY };
  }
  if (filter === "bu_ay") {
    const localNow = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Istanbul" }));
    return {
      dateFrom: `${localNow.getFullYear()}-${String(localNow.getMonth() + 1).padStart(2, "0")}-01`,
      dateTo: TODAY,
    };
  }
  return { dateFrom: "", dateTo: "" };
}

export default function OrdersPage() {
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [importStage, setImportStage] = useState<"reading" | "uploading" | "">("");
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>(
    () => Object.fromEntries(COLUMNS.map((c) => [c.key, c.defaultVisible]))
  );
  const [showColPicker, setShowColPicker] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const ALIGN_CLASS = { left: "text-left", right: "text-right", center: "text-center" } as const;

  function SortTh({ sortK, label, align = "left" }: { sortK: SortKey; label: string; align?: "left" | "right" | "center" }) {
    const active = sortKey === sortK;
    return (
      <th
        onClick={() => toggleSort(sortK)}
        className={`px-4 py-3 font-medium text-gray-600 whitespace-nowrap cursor-pointer select-none hover:text-gray-900 ${ALIGN_CLASS[align]}`}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          <span className={`text-[10px] ${active ? "text-blue-600" : "text-gray-300"}`}>
            {active ? (sortDir === "asc" ? "▲" : "▼") : "▲"}
          </span>
        </span>
      </th>
    );
  }

  // localStorage sadece istemcide okunur; sunucu render'ıyla eşleşmesi için
  // ilk render'da her zaman varsayılanlar kullanılır, kaydedilmiş tercih varsa
  // mount sonrası (hydration bitince) uygulanır.
  useEffect(() => {
    try {
      const saved = localStorage.getItem("orders_visible_cols");
      if (saved) setVisibleCols(JSON.parse(saved));
    } catch { }
  }, []);

  async function deleteOrder(id: number) {
    if (!confirm(`#${id} numaralı siparişi silmek istediğinize emin misiniz?`)) return;
    setDeletingId(id);
    try {
      await fetch(`/api/orders/${id}`, { method: "DELETE" });
      setRows((prev) => prev.filter((r) => r.id !== id));
    } finally {
      setDeletingId(null);
    }
  }

  async function fetchOrders() {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (search) params.set("search", search);

    if (dateFilter === "ozel") {
      if (customFrom) params.set("dateFrom", customFrom);
      if (customTo) params.set("dateTo", customTo);
    } else if (dateFilter) {
      const { dateFrom, dateTo } = getDateRange(dateFilter);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
    }

    const res = await fetch(`/api/orders?${params}`);
    const data = await res.json();
    setRows(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => {
    fetchOrders();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, dateFilter, customFrom, customTo, search]);

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportMsg("");
    setImportStage("reading");
    setImportProgress({ current: 0, total: 0 });
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(new Uint8Array(buffer), { type: "array" });
      const sheetName = workbook.SheetNames.find((n) => n.toLocaleLowerCase("tr-TR").includes("satış")) ?? workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });

      let parsed: { orders: ParsedOrder[]; skipped: number };
      try {
        parsed = parseOrderRows(rawRows);
      } catch (err) {
        setImportMsg(err instanceof Error ? err.message : "Dosya okunamadı.");
        return;
      }

      if (parsed.orders.length === 0) {
        setImportMsg("Aktarılacak sipariş bulunamadı.");
        return;
      }

      setImportStage("uploading");
      const batches = chunk(parsed.orders, IMPORT_BATCH_SIZE);
      setImportProgress({ current: 0, total: parsed.orders.length });

      let imported = 0;
      let duplicates = 0;
      let productsAdded = 0;
      for (const batch of batches) {
        const res = await fetch("/api/orders/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orders: batch }),
        });
        const data = await res.json();
        if (!res.ok) {
          setImportMsg(
            `${imported} sipariş aktarıldıktan sonra hata oluştu: ${data.error ?? "Bilinmeyen hata."}`
          );
          await fetchOrders();
          return;
        }
        imported += data.imported ?? 0;
        duplicates += data.duplicates ?? 0;
        productsAdded += data.productsAdded ?? 0;
        setImportProgress((prev) => ({ ...prev, current: Math.min(prev.total, prev.current + batch.length) }));
      }

      setImportMsg(
        `${imported} sipariş içe aktarıldı.` +
        (duplicates ? ` ${duplicates} sipariş daha önce aktarıldığı için atlandı.` : "") +
        (parsed.skipped ? ` ${parsed.skipped} satır tarih/işlem bilgisi olmadığı için atlandı.` : "") +
        (productsAdded ? ` Ürün kataloğuna eksik olan ${productsAdded} ürün kodu eklendi.` : "")
      );
      await fetchOrders();
    } catch {
      setImportMsg("Dosya işlenirken hata oluştu.");
    } finally {
      setImporting(false);
      setImportStage("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const displayRows = sortRows(rows, sortKey, sortDir);

  return (
    <div onClick={() => setShowColPicker(false)}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Sipariş Listesi</h1>
        <div className="flex gap-2">
          <input
            type="file"
            accept=".xlsx,.xls"
            ref={fileInputRef}
            onChange={handleImport}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {importing ? "İçe Aktarılıyor..." : "Excel'den İçe Aktar"}
          </button>
          <Link
            href="/"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
          >
            + Sipariş Ekle
          </Link>
        </div>
      </div>

      {importMsg && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          {importMsg}
        </div>
      )}

      {/* Filtreler */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-6 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Tarih</label>
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Tümü</option>
            <option value="bugun">Bugün</option>
            <option value="bu_hafta">Bu Hafta</option>
            <option value="bu_ay">Bu Ay</option>
            <option value="ozel">Özel Aralık</option>
          </select>
        </div>

        {dateFilter === "ozel" && (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Başlangıç</label>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Bitiş</label>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Statü</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Tümü</option>
            <option value="BEKLEMEDE">Beklemede</option>
            <option value="TAMAMLANDI">Tamamlandı</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Ara</label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Plaka, Stok Kodu, Ebat, Müşteri veya Tedarikçi..."
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
          />
        </div>

        <div className="relative ml-auto">
          <button
            onClick={(e) => { e.stopPropagation(); setShowColPicker((v) => !v); }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
            </svg>
            Sütunlar
          </button>
          {showColPicker && (
            <div className="absolute right-0 top-10 z-30 bg-white border border-gray-200 rounded-xl shadow-lg p-3 w-48" onClick={(e) => e.stopPropagation()}>
              {COLUMNS.map((col) => (
                <label key={col.key} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={visibleCols[col.key]}
                    onChange={(e) => setVisibleCols((prev) => {
                      const next = { ...prev, [col.key]: e.target.checked };
                      try { localStorage.setItem("orders_visible_cols", JSON.stringify(next)); } catch { }
                      return next;
                    })}
                    className="w-4 h-4 accent-blue-500"
                  />
                  {col.label}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tablo */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400">Yükleniyor...</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-gray-400">Sipariş bulunamadı.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {visibleCols.order_no && <SortTh sortK="order_no" label="Sipariş No" />}
                  {visibleCols.date && <SortTh sortK="date" label="Tarih" />}
                  {visibleCols.customer_name && <SortTh sortK="customer_name" label="Müşteri" />}
                  {visibleCols.plate && <SortTh sortK="plate" label="Plaka" />}
                  {visibleCols.service_name && <SortTh sortK="service_name" label="Yapılan İşlem" />}
                  {visibleCols.supplier && <SortTh sortK="supplier" label="Tedarikçi" />}
                  {visibleCols.stock_code && <SortTh sortK="stock_code" label="Stok Kodu" />}
                  {visibleCols.size_desc && <SortTh sortK="size_desc" label="Ebat/Ürün" />}
                  {visibleCols.quantity && <SortTh sortK="quantity" label="Adet" align="right" />}
                  {visibleCols.unit_price && <SortTh sortK="unit_price" label="Tutar" align="right" />}
                  {visibleCols.cost_price && <SortTh sortK="cost_price" label="Maliyet" align="right" />}
                  {visibleCols.kar && <SortTh sortK="kar" label="Kar" align="right" />}
                  {visibleCols.payment_type && <SortTh sortK="payment_type" label="Ödeme Şekli" />}
                  {visibleCols.notes && <SortTh sortK="notes" label="Açıklama" />}
                  <SortTh sortK="status" label="Statü" align="center" />
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {displayRows.map((r) => {
                  const unitPrice = Number(r.unit_price || 0);
                  const costPrice = Number(r.cost_price || 0);
                  const kar = unitPrice - costPrice;
                  return (
                    <tr key={`${r.id}-${r.line_id ?? "none"}`} className="hover:bg-gray-50 transition-colors">
                      {visibleCols.order_no && (
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Link href={`/admin/orders/${r.id}`} className="font-mono font-semibold text-blue-600 hover:text-blue-800">
                            #{r.id}
                          </Link>
                        </td>
                      )}
                      {visibleCols.date && (
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                          {formatDate(r.created_at)}
                        </td>
                      )}
                      {visibleCols.customer_name && <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{r.customer_name || "-"}</td>}
                      {visibleCols.plate && <td className="px-4 py-3 font-mono font-semibold text-gray-800 whitespace-nowrap">{r.plate}</td>}
                      {visibleCols.service_name && <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{r.service_name || "-"}</td>}
                      {visibleCols.supplier && <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.supplier || "-"}</td>}
                      {visibleCols.stock_code && <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{r.stock_code || "-"}</td>}
                      {visibleCols.size_desc && <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{r.size_desc || "-"}</td>}
                      {visibleCols.quantity && <td className="px-4 py-3 text-right text-gray-600">{r.quantity ?? "-"}</td>}
                      {visibleCols.unit_price && (
                        <td className="px-4 py-3 text-right font-semibold text-gray-800 whitespace-nowrap">
                          {formatCurrency(unitPrice)}
                        </td>
                      )}
                      {visibleCols.cost_price && (
                        <td className="px-4 py-3 text-right text-gray-500 whitespace-nowrap">
                          {formatCurrency(costPrice)}
                        </td>
                      )}
                      {visibleCols.kar && (
                        <td className={`px-4 py-3 text-right font-medium whitespace-nowrap ${kar >= 0 ? "text-green-600" : "text-red-500"}`}>
                          {formatCurrency(kar)}
                        </td>
                      )}
                      {visibleCols.payment_type && <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.payment_type || "-"}</td>}
                      {visibleCols.notes && (
                        <td className="px-4 py-3 text-gray-500 max-w-xs truncate" title={r.notes || undefined}>
                          {r.notes || "-"}
                        </td>
                      )}
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${
                            r.status === "TAMAMLANDI"
                              ? "bg-green-100 text-green-700"
                              : "bg-yellow-100 text-yellow-700"
                          }`}
                        >
                          {r.status === "TAMAMLANDI" ? "Tamamlandı" : "Beklemede"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Link
                            href={`/admin/orders/${r.id}`}
                            className="text-blue-600 hover:text-blue-800 font-medium text-xs whitespace-nowrap"
                          >
                            Detay →
                          </Link>
                          <Link
                            href={`/admin/orders/${r.id}?edit=1`}
                            className="text-gray-500 hover:text-gray-700 font-medium text-xs whitespace-nowrap"
                          >
                            Düzelt
                          </Link>
                          <button
                            onClick={() => deleteOrder(r.id)}
                            disabled={deletingId === r.id}
                            className="text-red-500 hover:text-red-700 text-xs font-medium disabled:opacity-40 whitespace-nowrap"
                          >
                            {deletingId === r.id ? "Siliniyor..." : "Sil"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Import Loading Overlay */}
      {importing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm text-center">
            <svg className="w-8 h-8 mx-auto mb-4 text-blue-600 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-sm font-medium text-gray-700 mb-1">
              {importStage === "reading" ? "Excel dosyası okunuyor..." : "Siparişler içe aktarılıyor..."}
            </p>
            {importStage === "uploading" && importProgress.total > 0 && (
              <>
                <p className="text-xs text-gray-400 mb-3">
                  {importProgress.current} / {importProgress.total} sipariş
                </p>
                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${Math.round((importProgress.current / importProgress.total) * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  %{Math.round((importProgress.current / importProgress.total) * 100)}
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
