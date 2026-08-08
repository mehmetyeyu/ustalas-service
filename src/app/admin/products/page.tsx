"use client";

import { Fragment, useEffect, useState, useRef } from "react";
import Link from "next/link";
import { formatCurrency } from "@/lib/format";
import { parseProductRows, chunk, type ParsedProductRow } from "@/lib/productsExcel";

const IMPORT_BATCH_SIZE = 50;

interface ProductBatch {
  id: number;
  code: string;
  brand: string | null;
  size_desc: string | null;
  season: string | null;
  supplier: string | null;
  production_week: number | null;
  production_year: number | null;
  purchase_price: string | number | null;
  avg_purchase_price: string | number | null;
  sale_price: string | number | null;
  avg_sale_price: string | number | null;
  stock_qty: number | null;
}

interface ProductGroup {
  code: string;
  brand: string | null;
  size_desc: string | null;
  season: string | null;
  total_stock: number;
  avg_purchase_price: string | number | null;
  avg_sale_price: string | number | null;
  batches: ProductBatch[];
}

interface StockEntry {
  id: number;
  entry_date: string;
  quantity: number;
  purchase_price: string | number | null;
  sale_price: string | number | null;
}

// "Malzeme Hareketleri": stoğu 0'a inip ana listeden kalkan partilerin geçmişini
// (hangi kod, hangi tedarikçi, ne zaman, ne kadar/ne fiyata alındığını) mevcut
// stok durumundan bağımsız, geriye dönük görebilmek için ayrı bir görünüm.
interface MovementRow {
  entry_id: number;
  type: "in" | "out";
  event_date: string;
  quantity: number;
  purchase_price: string | number | null;
  sale_price: string | number | null;
  customer_name: string | null;
  plate: string | null;
  order_id: number | null;
  product_id: number;
  code: string;
  brand: string | null;
  size_desc: string | null;
  supplier: string | null;
  production_week: number | null;
  production_year: number | null;
  current_stock: number;
}

const SEASON_OPTIONS = ["Yaz", "Kış", "Dört Mevsim"];

// Alış Fiyatı × (1 + yüzde/100) — kâr yüzdesi girildiğinde Satış Fiyatı'nı
// otomatik hesaplar; ikisi de boşsa mevcut değeri korur (elle de değiştirilebilir).
function calcSalePrice(purchasePrice: string, markupPercent: string, fallback: string): string {
  const cost = Number(purchasePrice) || 0;
  const pct = Number(markupPercent) || 0;
  if (cost > 0 && pct > 0) return String(Math.round(cost * (1 + pct / 100) * 100) / 100);
  return fallback;
}

function SearchableCombobox({
  value, onChange, options, placeholder,
}: {
  value: string;
  onChange: (val: string) => void;
  options: string[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const filtered = query
    ? options.filter((o) => o.toLowerCase().includes(query.toLowerCase()))
    : options;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); setQuery(e.target.value); setOpen(true); }}
        onFocus={(e) => { setQuery(""); setOpen(true); e.target.select(); }}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {filtered.map((opt) => (
            <li
              key={opt}
              onMouseDown={(e) => { e.preventDefault(); onChange(opt); setOpen(false); }}
              className={`px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 hover:text-blue-700 ${value === opt ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700"}`}
            >
              {opt}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Sadece parti (batch) seviyesindeki sütunlar aç/kapa edilebilir — Kod/Marka/Ebat/
// Toplam Stok ürün grubu satırında her zaman görünür.
const BATCH_COLUMNS: { key: string; label: string; defaultVisible: boolean }[] = [
  { key: "production_date", label: "Üretim Haftası/Yılı", defaultVisible: true },
  { key: "season", label: "Mevsim", defaultVisible: true },
  { key: "supplier", label: "Tedarikçi", defaultVisible: true },
  { key: "purchase_price", label: "Alış Maliyeti (Ort.)", defaultVisible: true },
  { key: "sale_price", label: "Satış Fiyatı (Ort.)", defaultVisible: true },
];

const EMPTY_FORM = {
  code: "",
  brand: "",
  size_desc: "",
  season: "",
  supplier: "",
  production_week: "",
  production_year: "",
  purchase_price: "",
  markupPercent: "",
  sale_price: "",
  stock_qty: "0",
};

function num(v: string | number | null): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function batchLabel(item: { code: string; brand?: string | null; size_desc?: string | null } | ProductBatch): string {
  const parts = [item.brand, item.size_desc, `(${item.code})`].filter(Boolean);
  return parts.join(" — ");
}

// DOT kodu biçimi: "10/26" = 10. hafta, 2026 — takvim tarihi değil.
function weekYearLabel(week: number | null, year: number | null): string {
  if (week == null || year == null) return "—";
  return `${String(week).padStart(2, "0")}/${String(year).slice(-2)}`;
}

function seasonBadge(season: string | null) {
  if (!season) return "—";
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] leading-none font-medium ${season === "Kış" ? "bg-blue-100 text-blue-700"
      : season === "Yaz" ? "bg-yellow-100 text-yellow-700"
        : season === "Dört Mevsim" ? "bg-green-100 text-green-700"
          : "bg-gray-100 text-gray-600"
      }`}>
      {season}
    </span>
  );
}

export default function ProductsPage() {
  const [items, setItems] = useState<ProductGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const LIMIT = 20;
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [seasonFilter, setSeasonFilter] = useState("");
  const [viewMode, setViewMode] = useState<"products" | "movements">("products");
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [movementsTotal, setMovementsTotal] = useState(0);
  const [movementsPage, setMovementsPage] = useState(1);
  const [movementsLoading, setMovementsLoading] = useState(false);
  const MOVEMENTS_LIMIT = 30;
  const [expandedCodes, setExpandedCodes] = useState<Set<string>>(new Set());
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [editItem, setEditItem] = useState<ProductBatch | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [editError, setEditError] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [historyModalProduct, setHistoryModalProduct] = useState<ProductBatch | null>(null);
  const [historyEntries, setHistoryEntries] = useState<StockEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [importStage, setImportStage] = useState<"reading" | "uploading" | "">("");
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>(
    () => Object.fromEntries(BATCH_COLUMNS.map((c) => [c.key, c.defaultVisible]))
  );
  const [showColPicker, setShowColPicker] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("products_visible_cols_v2");
      if (saved) setVisibleCols(JSON.parse(saved));
    } catch { }
  }, []);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [supplierOptions, setSupplierOptions] = useState<string[]>([]);
  const [brandOptions, setBrandOptions] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/suppliers")
      .then((r) => r.json())
      .then((data: { name: string }[]) => {
        if (Array.isArray(data)) setSupplierOptions(data.map((s) => s.name).sort((a, b) => a.localeCompare(b, "tr-TR")));
      })
      .catch(() => { });
    fetch("/api/products/brands")
      .then((r) => r.json())
      .then((data: string[]) => {
        if (Array.isArray(data)) setBrandOptions(data.sort((a, b) => a.localeCompare(b, "tr-TR")));
      })
      .catch(() => { });
  }, []);

  async function fetchItems(targetPage = page) {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (seasonFilter) params.set("season", seasonFilter);
    params.set("page", String(targetPage));
    params.set("limit", String(LIMIT));
    const res = await fetch(`/api/products?${params}`);
    const data = await res.json();
    setItems(data.items ?? []);
    setTotal(data.total ?? 0);
    setLoading(false);
  }

  useEffect(() => {
    setPage(1);
    fetchItems(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, seasonFilter]);

  useEffect(() => {
    fetchItems(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  async function fetchMovements(targetPage = movementsPage) {
    setMovementsLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    params.set("page", String(targetPage));
    params.set("limit", String(MOVEMENTS_LIMIT));
    const res = await fetch(`/api/products/movements?${params}`);
    const data = await res.json();
    setMovements(data.items ?? []);
    setMovementsTotal(data.total ?? 0);
    setMovementsLoading(false);
  }

  useEffect(() => {
    if (viewMode !== "movements") return;
    setMovementsPage(1);
    fetchMovements(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, search]);

  useEffect(() => {
    if (viewMode !== "movements") return;
    fetchMovements(movementsPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movementsPage]);

  function toggleExpand(code: string) {
    setExpandedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  }

  function buildPayload(f: typeof EMPTY_FORM) {
    return {
      code: f.code.trim(),
      brand: f.brand.trim() || null,
      size_desc: f.size_desc.trim() || null,
      season: f.season.trim() || null,
      supplier: f.supplier.trim() || null,
      production_week: f.production_week === "" ? null : Number(f.production_week),
      production_year: f.production_year === "" ? null : Number(f.production_year),
      purchase_price: f.purchase_price === "" ? null : Number(f.purchase_price),
      sale_price: f.sale_price === "" ? null : Number(f.sale_price),
      stock_qty: Number(f.stock_qty) || 0,
    };
  }

  async function handleSave() {
    if (!form.code.trim()) {
      setSaveError("Ürün kodu zorunludur.");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(form)),
      });
      if (!res.ok) {
        const data = await res.json();
        setSaveError(data.error ?? "Hata oluştu.");
        return;
      }
      setShowAddModal(false);
      setForm(EMPTY_FORM);
      await fetchItems(page);
    } finally {
      setSaving(false);
    }
  }

  function openAdd(prefillCode?: string, prefillBrand?: string | null, prefillSize?: string | null) {
    setForm({
      ...EMPTY_FORM,
      code: prefillCode ?? "",
      brand: prefillBrand ?? "",
      size_desc: prefillSize ?? "",
    });
    setSaveError("");
    setShowAddModal(true);
  }

  function openEdit(item: ProductBatch) {
    setEditItem(item);
    setEditError("");
    setEditForm({
      code: item.code ?? "",
      brand: item.brand ?? "",
      size_desc: item.size_desc ?? "",
      season: item.season ?? "",
      supplier: item.supplier ?? "",
      production_week: item.production_week != null ? String(item.production_week) : "",
      production_year: item.production_year != null ? String(item.production_year) : "",
      purchase_price: item.purchase_price != null ? String(num(item.purchase_price)) : "",
      markupPercent: "",
      sale_price: item.sale_price != null ? String(num(item.sale_price)) : "",
      stock_qty: String(item.stock_qty ?? 0),
    });
  }

  async function handleUpdate() {
    if (!editItem) return;
    setSaving(true);
    setEditError("");
    try {
      const res = await fetch(`/api/products/${editItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(editForm)),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error ?? "Hata oluştu.");
        return;
      }
      setEditItem(null);
      await fetchItems(page);
    } finally {
      setSaving(false);
    }
  }

  async function openHistoryModal(item: ProductBatch) {
    setHistoryModalProduct(item);
    setHistoryEntries([]);
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/products/${item.id}/history`);
      const data = await res.json();
      setHistoryEntries(data.items ?? []);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Bu partiyi silmek istediğinize emin misiniz?\nPartiye ait tüm stok girişi / fiyat geçmişi de kalıcı olarak silinecek.")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/products/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Parti silinemedi.");
        return;
      }
      await fetchItems(page);
    } finally {
      setDeletingId(null);
    }
  }

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
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });

      let parsed: { rows: ParsedProductRow[]; skipped: number };
      try {
        parsed = parseProductRows(rawRows);
      } catch (err) {
        setImportMsg(err instanceof Error ? err.message : "Dosya okunamadı.");
        return;
      }

      if (parsed.rows.length === 0) {
        setImportMsg("Aktarılacak ürün bulunamadı.");
        return;
      }

      setImportStage("uploading");
      const batches = chunk(parsed.rows, IMPORT_BATCH_SIZE);
      setImportProgress({ current: 0, total: parsed.rows.length });

      let imported = 0;
      let skipped = parsed.skipped;
      for (const batch of batches) {
        const res = await fetch("/api/products/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: batch }),
        });
        const data = await res.json();
        if (!res.ok) {
          setImportMsg(
            `${imported} parti aktarıldıktan sonra hata oluştu: ${data.error ?? "Bilinmeyen hata."}`
          );
          setPage(1);
          await fetchItems(1);
          return;
        }
        imported += data.imported ?? 0;
        skipped += data.skipped ?? 0;
        setImportProgress((prev) => ({ ...prev, current: Math.min(prev.total, prev.current + batch.length) }));
      }

      setImportMsg(
        `${imported} parti içe aktarıldı.` +
        (skipped ? ` ${skipped} satır ürün kodu olmadığı için atlandı.` : "")
      );
      setPage(1);
      await fetchItems(1);
    } catch {
      setImportMsg("Dosya işlenirken hata oluştu.");
    } finally {
      setImporting(false);
      setImportStage("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div onClick={() => setShowColPicker(false)}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Ürün Kataloğu</h1>
        <div className="flex gap-2">
          <input
            type="file"
            accept=".xlsx,.xls"
            ref={fileInputRef}
            onChange={handleImport}
            className="hidden"
          />
          <button
            onClick={() => { window.location.href = "/api/products/export"; }}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Dışa Aktar
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {importing ? "İçe Aktarılıyor..." : "İçeri Aktar"}
          </button>
          <button
            onClick={() => openAdd()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
          >
            + Yeni Ürün
          </button>
        </div>
      </div>

      {importMsg && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          {importMsg}
        </div>
      )}

      {/* Sekmeler: Ürünler (aktif stok) / Malzeme Hareketleri (geçmiş — stoğu
          0'a inip listeden kalkan partiler dahil, geriye dönük bakış). */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        <button
          onClick={() => setViewMode("products")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${viewMode === "products" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
        >
          Ürünler
        </button>
        <button
          onClick={() => setViewMode("movements")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${viewMode === "movements" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
        >
          Malzeme Hareketleri
        </button>
      </div>

      {/* Arama + Filtre + Sütun Seçici */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-6 flex flex-wrap gap-3 items-center justify-between">
        <div className="flex flex-wrap gap-3 flex-1">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={viewMode === "products" ? "Ürün kodu, marka, ebat veya tedarikçi ara..." : "Ürün kodu, marka, ebat, tedarikçi, müşteri veya plaka ara..."}
            className="w-full sm:w-72 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {viewMode === "products" && (
            <select
              value={seasonFilter}
              onChange={(e) => setSeasonFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Tüm Mevsimler</option>
              {SEASON_OPTIONS.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          )}
        </div>
        {viewMode === "products" && (
          <div className="relative">
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
              <div className="absolute left-0 sm:left-auto sm:right-0 top-10 z-30 bg-white border border-gray-200 rounded-xl shadow-lg p-3 w-52" onClick={(e) => e.stopPropagation()}>
                <p className="text-xs text-gray-400 px-2 mb-1">Parti (üretim tarihi) sütunları</p>
                {BATCH_COLUMNS.map((col) => (
                  <label key={col.key} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={visibleCols[col.key]}
                      onChange={(e) => setVisibleCols((prev) => {
                        const next = { ...prev, [col.key]: e.target.checked };
                        try { localStorage.setItem("products_visible_cols_v2", JSON.stringify(next)); } catch { }
                        return next;
                      })}
                      className="accent-blue-600"
                    />
                    {col.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {viewMode === "movements" ? (
        <>
          {/* Malzeme Hareketleri Tablosu */}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            {movementsLoading ? (
              <div className="p-12 text-center text-gray-400">Yükleniyor...</div>
            ) : movements.length === 0 ? (
              <div className="p-12 text-center text-gray-400">Kayıt bulunamadı.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Tarih</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Tür</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Ürün Kodu</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Marka</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Ebat</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Tedarikçi</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Üretim Haftası/Yılı</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Müşteri</th>
                      <th className="text-center px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Miktar</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Alış Fiyatı</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Satış Fiyatı</th>
                      <th className="text-center px-4 py-3 font-medium text-gray-600 whitespace-nowrap" title="Bu partinin şu anki stok durumu">Güncel Stok</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {movements.map((m) => (
                      <tr key={`${m.type}-${m.entry_id}`} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{new Date(m.event_date).toLocaleDateString("tr-TR")}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${m.type === "in" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                            {m.type === "in" ? "Giriş" : "Çıkış"}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono font-semibold text-gray-800">{m.code}</td>
                        <td className="px-4 py-3 text-gray-700">{m.brand ?? "—"}</td>
                        <td className="px-4 py-3 text-gray-700">{m.size_desc ?? "—"}</td>
                        <td className="px-4 py-3 text-gray-700">{m.supplier ?? "—"}</td>
                        <td className="px-4 py-3 text-gray-700 font-mono">{weekYearLabel(m.production_week, m.production_year)}</td>
                        <td className="px-4 py-3 text-gray-700">
                          {m.type === "out" ? (
                            <>
                              {m.customer_name ?? "—"}
                              {m.plate && <span className="text-gray-400 text-xs"> — {m.plate}</span>}
                              {m.order_id != null && (
                                <Link href={`/admin/orders/${m.order_id}`} className="ml-1 text-blue-600 hover:text-blue-800 font-mono text-xs whitespace-nowrap">
                                  #{m.order_id}
                                </Link>
                              )}
                            </>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-3 text-center text-gray-700">{m.type === "out" ? `-${m.quantity}` : m.quantity}</td>
                        <td className="px-4 py-3 text-right text-gray-700">{m.purchase_price != null ? formatCurrency(num(m.purchase_price)) : "—"}</td>
                        <td className="px-4 py-3 text-right text-gray-700">{m.sale_price != null ? formatCurrency(num(m.sale_price)) : "—"}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-block min-w-[2.5rem] px-2 py-1 rounded-full text-xs font-bold ${m.current_stock === 0 ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-800"}`}>
                            {m.current_stock}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {movementsTotal > MOVEMENTS_LIMIT && (
            <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
              <span>
                {(movementsPage - 1) * MOVEMENTS_LIMIT + 1}–{Math.min(movementsPage * MOVEMENTS_LIMIT, movementsTotal)} / {movementsTotal} hareket
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => setMovementsPage((p) => Math.max(1, p - 1))}
                  disabled={movementsPage === 1}
                  className="px-3 py-1 rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ‹
                </button>
                <span className="px-3 py-1">{movementsPage} / {Math.ceil(movementsTotal / MOVEMENTS_LIMIT)}</span>
                <button
                  onClick={() => setMovementsPage((p) => p + 1)}
                  disabled={movementsPage * MOVEMENTS_LIMIT >= movementsTotal}
                  className="px-3 py-1 rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ›
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
      <>
      {/* Tablo */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400">Yükleniyor...</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-gray-400">Ürün bulunamadı.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Ürün Kodu</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Marka</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Ebat</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Stok</th>
                  {visibleCols.production_date && <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Üretim Haftası/Yılı</th>}
                  {visibleCols.season && <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Mevsim</th>}
                  {visibleCols.supplier && <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Tedarikçi</th>}
                  {visibleCols.purchase_price && <th className="text-right px-4 py-3 font-medium text-gray-600 whitespace-nowrap" title="Stoktaki tüm girişlerin miktar ağırlıklı ortalaması">Alış Maliyeti (Ort.)</th>}
                  {visibleCols.sale_price && <th className="text-right px-4 py-3 font-medium text-gray-600 whitespace-nowrap" title="Stoktaki tüm girişlerin miktar ağırlıklı ortalaması">Satış Fiyatı (Ort.)</th>}
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((group) => {
                  const expanded = expandedCodes.has(group.code);
                  return (
                    <Fragment key={group.code}>
                      <tr className="hover:bg-gray-50 transition-colors bg-gray-50/40">
                        <td className="px-4 py-3">
                          <button
                            onClick={() => toggleExpand(group.code)}
                            className="flex items-center gap-2 font-mono font-semibold text-gray-800"
                          >
                            <svg
                              className={`w-3.5 h-3.5 text-gray-400 transition-transform ${expanded ? "rotate-90" : ""}`}
                              fill="none" stroke="currentColor" viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                            {group.code}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-gray-700">{group.brand || "—"}</td>
                        <td className="px-4 py-3 text-gray-700">{group.size_desc || "—"}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-block min-w-[2.5rem] px-2 py-1 rounded-full text-sm font-bold ${group.total_stock === 0 ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-800"}`}>
                            {group.total_stock}
                          </span>
                        </td>
                        {visibleCols.production_date && <td className="px-4 py-3 text-gray-400 text-xs">{group.batches.length} parti</td>}
                        {visibleCols.season && <td className="px-4 py-3">{seasonBadge(group.season)}</td>}
                        {visibleCols.supplier && <td className="px-4 py-3"></td>}
                        {visibleCols.purchase_price && (
                          <td className="px-4 py-3 text-right text-gray-800 font-medium">
                            {group.avg_purchase_price != null ? formatCurrency(num(group.avg_purchase_price)) : "—"}
                          </td>
                        )}
                        {visibleCols.sale_price && (
                          <td className="px-4 py-3 text-right text-gray-800 font-medium">
                            {group.avg_sale_price != null ? formatCurrency(num(group.avg_sale_price)) : "—"}
                          </td>
                        )}
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => openAdd(group.code, group.brand, group.size_desc)}
                            className="text-blue-600 hover:text-blue-800 text-xs font-medium whitespace-nowrap"
                          >
                            Stok Girişi
                          </button>
                        </td>
                      </tr>
                      {expanded && group.batches.map((batch) => (
                        <tr key={batch.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 pl-10 text-gray-300 text-xs">#{batch.id}</td>
                          <td className="px-4 py-3"></td>
                          <td className="px-4 py-3"></td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-block min-w-[2.5rem] px-2 py-1 rounded-full text-sm font-bold ${(batch.stock_qty ?? 0) === 0 ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-800"}`}>
                              {batch.stock_qty ?? 0}
                            </span>
                          </td>
                          {visibleCols.production_date && (
                            <td className="px-4 py-3 text-gray-700 font-mono">
                              {weekYearLabel(batch.production_week, batch.production_year)}
                            </td>
                          )}
                          {visibleCols.season && <td className="px-4 py-3"></td>}
                          {visibleCols.supplier && <td className="px-4 py-3 text-gray-500">{batch.supplier ?? "—"}</td>}
                          {visibleCols.purchase_price && <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(num(batch.avg_purchase_price ?? batch.purchase_price))}</td>}
                          {visibleCols.sale_price && <td className="px-4 py-3 text-right text-gray-700 font-medium">{formatCurrency(num(batch.avg_sale_price ?? batch.sale_price))}</td>}
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-3 whitespace-nowrap">
                              <button onClick={() => openHistoryModal(batch)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">Fiyat Geçmişi</button>
                              <button onClick={() => openEdit(batch)} className="text-gray-600 hover:text-gray-900 text-xs font-medium">Düzenle</button>
                              <button onClick={() => handleDelete(batch.id)} disabled={deletingId === batch.id}
                                className="text-red-500 hover:text-red-700 text-xs font-medium disabled:opacity-40">
                                {deletingId === batch.id ? "..." : "Sil"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {total > LIMIT && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
          <span>
            {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} / {total} ürün kodu
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(1)}
              disabled={page === 1}
              className="px-2 py-1 rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              «
            </button>
            <button
              onClick={() => setPage((p) => p - 1)}
              disabled={page === 1}
              className="px-3 py-1 rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ‹
            </button>
            {Array.from({ length: Math.ceil(total / LIMIT) }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === Math.ceil(total / LIMIT) || Math.abs(p - page) <= 2)
              .reduce<(number | "…")[]>((acc, p, i, arr) => {
                if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("…");
                acc.push(p);
                return acc;
              }, [])
              .map((p, i) =>
                p === "…" ? (
                  <span key={`ellipsis-${i}`} className="px-2 py-1 text-gray-400">…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p as number)}
                    className={`px-3 py-1 rounded border ${page === p
                      ? "bg-blue-600 text-white border-blue-600"
                      : "border-gray-300 hover:bg-gray-100"
                      }`}
                  >
                    {p}
                  </button>
                )
              )}
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page * LIMIT >= total}
              className="px-3 py-1 rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ›
            </button>
            <button
              onClick={() => setPage(Math.ceil(total / LIMIT))}
              disabled={page * LIMIT >= total}
              className="px-2 py-1 rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              »
            </button>
          </div>
        </div>
      )}
      </>
      )}

      {/* Yeni Ürün / Parti Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-800 mb-1">Yeni Ürün / Parti</h2>
            <p className="text-xs text-gray-400 mb-5">Aynı Ürün Kodu zaten varsa, farklı bir Üretim Haftası/Yılı ve/veya Tedarikçi girerek o koda yeni bir parti eklemiş olursunuz. Kod+Hafta/Yılı+Tedarikçi mevcut bir partiyle birebir eşleşirse, girdiğiniz miktar o partinin stoğuna eklenir ve fiyat geçmişine yeni bir satır düşer.</p>

            {saveError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                {saveError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Ürün Kodu <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  className={`w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 ${!form.code && saveError ? "border-red-400" : "border-gray-300"}`}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Marka</label>
                <SearchableCombobox value={form.brand} onChange={(val) => setForm({ ...form, brand: val })} options={brandOptions} placeholder="Marka seç veya yaz..." />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Ebat</label>
                <input type="text" value={form.size_desc} onChange={(e) => setForm({ ...form, size_desc: e.target.value })}
                  placeholder="205/60R16"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Mevsim</label>
                <SearchableCombobox value={form.season} onChange={(val) => setForm({ ...form, season: val })} options={SEASON_OPTIONS} placeholder="Mevsim seç veya yaz..." />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tedarikçi</label>
                <SearchableCombobox value={form.supplier} onChange={(val) => setForm({ ...form, supplier: val })} options={supplierOptions} placeholder="Tedarikçi seç veya yaz..." />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Üretim Haftası / Yılı</label>
                <div className="flex gap-2">
                  <input type="number" min="1" max="53" placeholder="Hafta" value={form.production_week}
                    onChange={(e) => setForm({ ...form, production_week: e.target.value })}
                    className="w-1/2 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <input type="number" min="2000" max="2100" placeholder="Yıl" value={form.production_year}
                    onChange={(e) => setForm({ ...form, production_year: e.target.value })}
                    className="w-1/2 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Alış Maliyeti</label>
                <input type="number" step="0.01" value={form.purchase_price}
                  onChange={(e) => {
                    const purchase_price = e.target.value;
                    setForm((prev) => ({ ...prev, purchase_price, sale_price: calcSalePrice(purchase_price, prev.markupPercent, prev.sale_price) }));
                  }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Kâr Yüzdesi (%)</label>
                <input type="number" step="0.01" min="0" value={form.markupPercent}
                  onChange={(e) => {
                    const markupPercent = e.target.value;
                    setForm((prev) => ({ ...prev, markupPercent, sale_price: calcSalePrice(prev.purchase_price, markupPercent, prev.sale_price) }));
                  }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Satış Fiyatı</label>
                <input type="number" step="0.01" value={form.sale_price} onChange={(e) => setForm({ ...form, sale_price: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Stok Miktarı</label>
                <input type="number" value={form.stock_qty} onChange={(e) => setForm({ ...form, stock_qty: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg hover:bg-gray-50"
              >
                İptal
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-2.5 rounded-lg"
              >
                {saving ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Düzenle Modal */}
      {editItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-800 mb-5">Partiyi Düzenle</h2>

            {editError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                {editError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Ürün Kodu</label>
                <input type="text" value={editForm.code} onChange={(e) => setEditForm({ ...editForm, code: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Marka</label>
                <SearchableCombobox value={editForm.brand} onChange={(val) => setEditForm({ ...editForm, brand: val })} options={brandOptions} placeholder="Marka seç veya yaz..." />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Ebat</label>
                <input type="text" value={editForm.size_desc} onChange={(e) => setEditForm({ ...editForm, size_desc: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Mevsim</label>
                <SearchableCombobox value={editForm.season} onChange={(val) => setEditForm({ ...editForm, season: val })} options={SEASON_OPTIONS} placeholder="Mevsim seç veya yaz..." />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tedarikçi</label>
                <SearchableCombobox value={editForm.supplier} onChange={(val) => setEditForm({ ...editForm, supplier: val })} options={supplierOptions} placeholder="Tedarikçi seç veya yaz..." />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Üretim Haftası / Yılı</label>
                <div className="flex gap-2">
                  <input type="number" min="1" max="53" placeholder="Hafta" value={editForm.production_week}
                    onChange={(e) => setEditForm({ ...editForm, production_week: e.target.value })}
                    className="w-1/2 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <input type="number" min="2000" max="2100" placeholder="Yıl" value={editForm.production_year}
                    onChange={(e) => setEditForm({ ...editForm, production_year: e.target.value })}
                    className="w-1/2 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Alış Maliyeti</label>
                <input type="number" step="0.01" value={editForm.purchase_price}
                  onChange={(e) => {
                    const purchase_price = e.target.value;
                    setEditForm((prev) => ({ ...prev, purchase_price, sale_price: calcSalePrice(purchase_price, prev.markupPercent, prev.sale_price) }));
                  }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Kâr Yüzdesi (%)</label>
                <input type="number" step="0.01" min="0" value={editForm.markupPercent}
                  onChange={(e) => {
                    const markupPercent = e.target.value;
                    setEditForm((prev) => ({ ...prev, markupPercent, sale_price: calcSalePrice(prev.purchase_price, markupPercent, prev.sale_price) }));
                  }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Satış Fiyatı</label>
                <input type="number" step="0.01" value={editForm.sale_price} onChange={(e) => setEditForm({ ...editForm, sale_price: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Stok Miktarı</label>
                <input type="number" value={editForm.stock_qty} onChange={(e) => setEditForm({ ...editForm, stock_qty: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setEditItem(null)}
                className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg hover:bg-gray-50">
                İptal
              </button>
              <button onClick={handleUpdate} disabled={saving}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-2.5 rounded-lg">
                {saving ? "Kaydediliyor..." : "Güncelle"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fiyat Geçmişi Modal */}
      {historyModalProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-1">
              <h2 className="text-xl font-bold text-gray-800">Fiyat Geçmişi</h2>
              <button onClick={() => setHistoryModalProduct(null)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-xs text-gray-400 mb-5">
              {batchLabel(historyModalProduct)}
              {historyModalProduct.production_week != null && historyModalProduct.production_year != null && (
                <span className="text-gray-400"> — Üretim: {weekYearLabel(historyModalProduct.production_week, historyModalProduct.production_year)}</span>
              )}
              {historyModalProduct.supplier && <span className="text-gray-400"> — Tedarikçi: {historyModalProduct.supplier}</span>}
            </p>

            {historyLoading ? (
              <div className="py-8 text-center text-gray-400 text-sm">Yükleniyor...</div>
            ) : historyEntries.length === 0 ? (
              <div className="py-8 text-center text-gray-400 text-sm">Henüz stok girişi kaydı yok.</div>
            ) : (
              <div className="overflow-x-auto border border-gray-100 rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-gray-600 whitespace-nowrap">Tarih</th>
                      <th className="text-center px-3 py-2 font-medium text-gray-600 whitespace-nowrap">Miktar</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600 whitespace-nowrap">Alış Fiyatı</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600 whitespace-nowrap">Satış Fiyatı</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {historyEntries.map((e) => (
                      <tr key={e.id}>
                        <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{new Date(e.entry_date).toLocaleDateString("tr-TR")}</td>
                        <td className="px-3 py-2 text-center text-gray-700">{e.quantity}</td>
                        <td className="px-3 py-2 text-right text-gray-700">{e.purchase_price != null ? formatCurrency(num(e.purchase_price)) : "—"}</td>
                        <td className="px-3 py-2 text-right text-gray-700">{e.sale_price != null ? formatCurrency(num(e.sale_price)) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <button onClick={() => setHistoryModalProduct(null)}
              className="w-full mt-5 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg hover:bg-gray-50">
              Kapat
            </button>
          </div>
        </div>
      )}

      {/* Import Loading Overlay */}
      {importing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm text-center">
            <svg className="w-8 h-8 mx-auto mb-4 text-blue-600 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-sm font-medium text-gray-700 mb-1">
              {importStage === "reading" ? "Excel dosyası okunuyor..." : "Ürünler içe aktarılıyor..."}
            </p>
            {importStage === "uploading" && importProgress.total > 0 && (
              <>
                <p className="text-xs text-gray-400 mb-3">
                  {importProgress.current} / {importProgress.total} satır
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
