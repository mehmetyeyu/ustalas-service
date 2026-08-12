"use client";

import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { formatDate, formatCurrency } from "@/lib/format";
import { parseOrderRows, chunk, type ParsedOrder } from "@/lib/ordersExcel";

const IMPORT_BATCH_SIZE = 20;

// Filtrele modalındaki Yapılan İşlem/Tedarikçi/Ödeme Şekli alanları için:
// bilinen bir listeden checkbox'larla birden fazla değer seçilebilen dropdown.
// Modal kendi içinde kaydırıldığından (overflow-y-auto), liste modalın DOM
// hiyerarşisi içinde absolute konumlanırsa modal sınırında kırpılır — bunun
// yerine document.body'e portal ile taşınır, konumu (yukarı/aşağı dahil)
// butonun ekran koordinatlarına göre hesaplanır (bkz. src/app/page.tsx'teki
// aynı desenle çözülmüş SearchableCombobox).
const DROPDOWN_MAX_HEIGHT = 224;

function MultiSelectDropdown({
  options, selected, onChange, placeholder,
}: {
  options: string[];
  selected: string[];
  onChange: (vals: string[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ left: number; width: number; top: number | null; bottom: number | null }>({ left: 0, width: 0, top: null, bottom: null });
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current && !containerRef.current.contains(e.target as Node) &&
        !(e.target as HTMLElement).closest("[data-multiselect-list]")
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (!open) return;
    function updateRect() {
      if (!buttonRef.current) return;
      const r = buttonRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - r.bottom;
      const spaceAbove = r.top;
      const openUp = spaceBelow < DROPDOWN_MAX_HEIGHT && spaceAbove > spaceBelow;
      setRect({
        left: r.left,
        width: r.width,
        top: openUp ? null : r.bottom + 4,
        bottom: openUp ? window.innerHeight - r.top + 4 : null,
      });
    }
    updateRect();
    window.addEventListener("scroll", updateRect, true);
    window.addEventListener("resize", updateRect);
    return () => {
      window.removeEventListener("scroll", updateRect, true);
      window.removeEventListener("resize", updateRect);
    };
  }, [open]);

  function toggle(opt: string) {
    onChange(selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt]);
  }

  const summary = selected.length === 0
    ? (placeholder ?? "Tümü")
    : selected.length === 1
      ? selected[0]
      : `${selected.length} seçili`;

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-left flex items-center justify-between gap-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <span className={`truncate ${selected.length === 0 ? "text-gray-400" : "text-gray-800"}`}>{summary}</span>
        <svg className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div
          data-multiselect-list
          style={{
            position: "fixed", left: rect.left, width: rect.width,
            top: rect.top ?? undefined, bottom: rect.bottom ?? undefined,
            maxHeight: DROPDOWN_MAX_HEIGHT,
          }}
          className="z-50 bg-white border border-gray-200 rounded-lg shadow-lg overflow-y-auto p-1"
        >
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full text-left px-2 py-1.5 text-xs text-gray-400 hover:text-gray-700"
            >
              Seçimi temizle
            </button>
          )}
          {options.length === 0 ? (
            <div className="px-2 py-1.5 text-sm text-gray-400">Kayıt yok</div>
          ) : options.map((opt) => (
            <label key={opt} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer text-sm text-gray-700">
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={() => toggle(opt)}
                className="w-4 h-4 accent-blue-500"
              />
              {opt}
            </label>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

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

// Yükleniyor durumunda "Yükleniyor..." yazısı yerine gerçek tablo iskeletiyle
// aynı sütunlarda nabız (pulse) animasyonlu çubuklar gösterilir — veri
// gelince ani bir yerleşim sıçraması olmasın diye başlıklar hep aynı kalır.
const SKELETON_COL_WIDTH: Record<string, string> = {
  order_no: "w-10", date: "w-16", customer_name: "w-28", plate: "w-16",
  service_name: "w-24", supplier: "w-20", stock_code: "w-16", size_desc: "w-28",
  quantity: "w-6", unit_price: "w-14", cost_price: "w-14", kar: "w-14",
  payment_type: "w-20", notes: "w-32",
};
const SKELETON_ROWS = 8;

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

// Sayfalama nedeniyle tüm filtreler (Statü/Tarih dahil) sunucuda uygulanır
// (bkz. /api/orders, fetchOrders) — bu alanlar birbiriyle VE mantığıyla
// birleşir; ayrı "Ara" kutusu (search) ise kendi içinde VEYA arar.
// Yapılan İşlem/Tedarikçi, bilinen (katalogdaki) değerlerden çoklu seçim
// olduğu için dizi — sunucuda birbirleriyle VEYA, diğer filtrelerle VE ile
// birleşir (bkz. /api/orders: `s.name = ANY(...)`).
interface FieldFilters {
  customer_name: string;
  plate: string;
  service_name: string[];
  supplier: string[];
  stock_code: string;
  size_desc: string;
  payment_type: string[];
}
const EMPTY_FIELD_FILTERS: FieldFilters = {
  customer_name: "", plate: "", service_name: [], supplier: [], stock_code: "", size_desc: "", payment_type: [],
};

export default function OrdersPage() {
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);
  const [totalKar, setTotalKar] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [search, setSearch] = useState("");
  const [fieldFilters, setFieldFilters] = useState<FieldFilters>(EMPTY_FIELD_FILTERS);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [importHasWarning, setImportHasWarning] = useState(false);
  const [importStage, setImportStage] = useState<"reading" | "uploading" | "">("");
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>(
    () => Object.fromEntries(COLUMNS.map((c) => [c.key, c.defaultVisible]))
  );
  const [showColPicker, setShowColPicker] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [serviceOptions, setServiceOptions] = useState<string[]>([]);
  const [supplierOptions, setSupplierOptions] = useState<string[]>([]);
  const [paymentTypeOptions, setPaymentTypeOptions] = useState<string[]>([]);

  // Filtrele modalındaki Yapılan İşlem/Tedarikçi/Ödeme Şekli çoklu seçim
  // listeleri — Yapılan İşlem/Tedarikçi katalogdan (Hizmetler/Tedarikçiler),
  // Ödeme Şekli ise gerçekten kullanılmış değerlerden ("Mail Order" tipleri
  // "<Tedarikçi> Mail Order" olarak dinamik oluştuğundan sabit liste yetmez)
  // doldurulur.
  useEffect(() => {
    fetch("/api/services")
      .then((r) => r.json())
      .then((data: { name: string }[]) => {
        if (Array.isArray(data)) setServiceOptions(data.map((s) => s.name).sort((a, b) => a.localeCompare(b, "tr-TR")));
      })
      .catch(() => { });
    fetch("/api/suppliers")
      .then((r) => r.json())
      .then((data: { name: string }[]) => {
        if (Array.isArray(data)) setSupplierOptions(data.map((s) => s.name).sort((a, b) => a.localeCompare(b, "tr-TR")));
      })
      .catch(() => { });
    fetch("/api/orders/payment-types")
      .then((r) => r.json())
      .then((data: string[]) => {
        if (Array.isArray(data)) setPaymentTypeOptions(data.sort((a, b) => a.localeCompare(b, "tr-TR")));
      })
      .catch(() => { });
  }, []);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const ALIGN_CLASS = { left: "text-left", right: "text-right", center: "text-center" } as const;

  function SortTh({ sortK, label, align = "left", stickyClassName }: { sortK: SortKey; label: string; align?: "left" | "right" | "center"; stickyClassName?: string }) {
    const active = sortKey === sortK;
    return (
      <th
        onClick={() => toggleSort(sortK)}
        className={`px-4 py-3 font-medium text-gray-600 whitespace-nowrap cursor-pointer select-none hover:text-gray-900 ${ALIGN_CLASS[align]} ${stickyClassName ?? ""}`}
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
      await fetchOrders(page);
    } finally {
      setDeletingId(null);
    }
  }

  async function fetchOrders(targetPage = page) {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);

    if (dateFilter === "ozel") {
      if (customFrom) params.set("dateFrom", customFrom);
      if (customTo) params.set("dateTo", customTo);
    } else if (dateFilter) {
      const { dateFrom, dateTo } = getDateRange(dateFilter);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
    }
    if (search) params.set("search", search);
    if (fieldFilters.customer_name) params.set("customer_name", fieldFilters.customer_name);
    if (fieldFilters.plate) params.set("plate", fieldFilters.plate);
    fieldFilters.service_name.forEach((v) => params.append("service_name", v));
    fieldFilters.supplier.forEach((v) => params.append("supplier", v));
    if (fieldFilters.stock_code) params.set("stock_code", fieldFilters.stock_code);
    if (fieldFilters.size_desc) params.set("size_desc", fieldFilters.size_desc);
    fieldFilters.payment_type.forEach((v) => params.append("payment_type", v));
    if (sortKey) { params.set("sortBy", sortKey); params.set("sortDir", sortDir); }
    params.set("page", String(targetPage));
    params.set("limit", String(limit));

    const res = await fetch(`/api/orders?${params}`);
    const data = await res.json();
    setRows(Array.isArray(data.items) ? data.items : []);
    setTotal(data.total ?? 0);
    setTotalAmount(data.totalAmount ?? 0);
    setTotalKar(data.totalKar ?? 0);
    setLoading(false);
  }

  useEffect(() => {
    setPage(1);
    fetchOrders(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, dateFilter, customFrom, customTo, search, fieldFilters, sortKey, sortDir, limit]);

  useEffect(() => {
    fetchOrders(page);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportMsg("");
    setImportHasWarning(false);
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
        setImportHasWarning(true);
        return;
      }

      if (parsed.orders.length === 0) {
        setImportMsg("Aktarılacak sipariş bulunamadı.");
        setImportHasWarning(true);
        return;
      }

      setImportStage("uploading");
      const batches = chunk(parsed.orders, IMPORT_BATCH_SIZE);
      setImportProgress({ current: 0, total: parsed.orders.length });

      let imported = 0;
      let duplicates = 0;
      let changedDuplicates = 0;
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
          setImportHasWarning(true);
          setPage(1);
          await fetchOrders(1);
          return;
        }
        imported += data.imported ?? 0;
        duplicates += data.duplicates ?? 0;
        changedDuplicates += data.changedDuplicates ?? 0;
        productsAdded += data.productsAdded ?? 0;
        setImportProgress((prev) => ({ ...prev, current: Math.min(prev.total, prev.current + batch.length) }));
      }

      setImportMsg(
        `${imported} sipariş içe aktarıldı.` +
        (duplicates ? ` ${duplicates} sipariş daha önce aktarıldığı için atlandı.` : "") +
        (changedDuplicates
          ? ` DİKKAT: bunlardan ${changedDuplicates} tanesinde şu anki dosyadaki satır sayısı kayıtlı siparişten farklı — dosyaya sonradan satır eklenmiş olabilir, bu satırlar aktarılmadı, elle kontrol edin.`
          : "") +
        (parsed.skipped ? ` ${parsed.skipped} satır tarih/işlem bilgisi olmadığı için atlandı.` : "") +
        (productsAdded ? ` Ürün kataloğuna eksik olan ${productsAdded} ürün kodu eklendi.` : "")
      );
      setImportHasWarning(changedDuplicates > 0);
      setPage(1);
      await fetchOrders(1);
    } catch {
      setImportMsg("Dosya işlenirken hata oluştu.");
      setImportHasWarning(true);
    } finally {
      setImporting(false);
      setImportStage("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const activeFilterCount =
    (statusFilter ? 1 : 0) + (dateFilter ? 1 : 0) +
    Object.values(fieldFilters).filter((v) => Array.isArray(v) ? v.length > 0 : v.trim()).length;

  // + 2: her zaman görünen Statü ve İşlemler sütunları.
  const visibleColCount = COLUMNS.filter((c) => visibleCols[c.key]).length + 2;

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
            onClick={() => { window.location.href = "/api/orders/import/template"; }}
            title="Tarih, Plaka ve Yapılan İşlem zorunludur, diğer sütunlar isteğe bağlıdır."
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-50"
          >
            Şablon İndir
          </button>
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
        <div className={`mb-4 p-3 rounded-lg text-sm border ${importHasWarning
          ? "bg-orange-50 border-orange-200 text-orange-700"
          : "bg-green-50 border-green-200 text-green-700"
          }`}>
          {importMsg}
        </div>
      )}

      {/* Filtreler */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-6 flex flex-wrap gap-3 items-center">
        <button
          onClick={(e) => { e.stopPropagation(); setShowFilterModal(true); }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h18M6 8h12M9 12h6M11 16h2" />
          </svg>
          Filtrele
          {activeFilterCount > 0 && (
            <span className="bg-blue-600 text-white text-xs font-bold rounded-full min-w-[1.25rem] h-5 px-1 flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </button>

        {activeFilterCount > 0 && (
          <button
            onClick={() => { setStatusFilter(""); setDateFilter(""); setCustomFrom(""); setCustomTo(""); setFieldFilters(EMPTY_FIELD_FILTERS); }}
            className="text-sm text-gray-400 hover:text-gray-700"
          >
            Filtreleri Temizle
          </button>
        )}

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Hızlı ara: Plaka, Müşteri, Tedarikçi, Stok Kodu, Ebat..."
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-96"
        />

        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-4 px-4 py-1.5 bg-gray-50 border border-gray-200 rounded-lg">
            <div>
              <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Toplam Tutar</div>
              <div className="text-sm font-semibold text-gray-800">{formatCurrency(totalAmount)}</div>
            </div>
            <div className="w-px h-7 bg-gray-200" />
            <div>
              <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Kâr</div>
              <div className={`text-sm font-semibold ${totalKar >= 0 ? "text-green-600" : "text-red-500"}`}>
                {formatCurrency(totalKar)}
              </div>
            </div>
          </div>
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
      </div>

      {/* Filtreleme Modalı */}
      {showFilterModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowFilterModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-bold text-gray-800">Siparişleri Filtrele</h2>
              <button onClick={() => setShowFilterModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Tarih</label>
                <select
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Tümü</option>
                  <option value="bugun">Bugün</option>
                  <option value="bu_hafta">Bu Hafta</option>
                  <option value="bu_ay">Bu Ay</option>
                  <option value="ozel">Özel Aralık</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Statü</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Tümü</option>
                  <option value="BEKLEMEDE">Beklemede</option>
                  <option value="TAMAMLANDI">Tamamlandı</option>
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
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Bitiş</label>
                    <input
                      type="date"
                      value={customTo}
                      onChange={(e) => setCustomTo(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Müşteri</label>
                <input
                  type="text"
                  value={fieldFilters.customer_name}
                  onChange={(e) => setFieldFilters((f) => ({ ...f, customer_name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Plaka</label>
                <input
                  type="text"
                  value={fieldFilters.plate}
                  onChange={(e) => setFieldFilters((f) => ({ ...f, plate: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Yapılan İşlem</label>
                <MultiSelectDropdown
                  options={serviceOptions}
                  selected={fieldFilters.service_name}
                  onChange={(vals) => setFieldFilters((f) => ({ ...f, service_name: vals }))}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Tedarikçi</label>
                <MultiSelectDropdown
                  options={supplierOptions}
                  selected={fieldFilters.supplier}
                  onChange={(vals) => setFieldFilters((f) => ({ ...f, supplier: vals }))}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Stok Kodu</label>
                <input
                  type="text"
                  value={fieldFilters.stock_code}
                  onChange={(e) => setFieldFilters((f) => ({ ...f, stock_code: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Ebat</label>
                <input
                  type="text"
                  value={fieldFilters.size_desc}
                  onChange={(e) => setFieldFilters((f) => ({ ...f, size_desc: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Ödeme Şekli</label>
                <MultiSelectDropdown
                  options={paymentTypeOptions}
                  selected={fieldFilters.payment_type}
                  onChange={(vals) => setFieldFilters((f) => ({ ...f, payment_type: vals }))}
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setStatusFilter(""); setDateFilter(""); setCustomFrom(""); setCustomTo(""); setFieldFilters(EMPTY_FIELD_FILTERS); }}
                className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg hover:bg-gray-50"
              >
                Filtreleri Temizle
              </button>
              <button
                onClick={() => setShowFilterModal(false)}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg transition-colors"
              >
                Uygula
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tablo */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
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
                <SortTh sortK="status" label="Statü" align="center" stickyClassName="sticky right-[240px] z-20 bg-gray-50 shadow-[-1px_0_0_0_#e5e7eb]" />
                <th className="px-4 py-3 sticky right-0 z-20 bg-gray-50 w-[240px] min-w-[240px] max-w-[240px]"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: SKELETON_ROWS }).map((_, i) => (
                  <tr key={`skeleton-${i}`}>
                    {COLUMNS.filter((c) => visibleCols[c.key]).map((c) => (
                      <td key={c.key} className="px-4 py-3">
                        <div className={`h-4 ${SKELETON_COL_WIDTH[c.key]} bg-gray-100 rounded animate-pulse`} />
                      </td>
                    ))}
                    <td className="px-4 py-3 text-center">
                      <div className="h-5 w-16 bg-gray-100 rounded-full animate-pulse mx-auto" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-4 w-20 bg-gray-100 rounded animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={visibleColCount} className="p-12 text-center text-gray-400">
                    {activeFilterCount > 0 || search.trim() ? "Filtrelere uyan sipariş bulunamadı." : "Sipariş bulunamadı."}
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const unitPrice = Number(r.unit_price || 0);
                  const costPrice = Number(r.cost_price || 0);
                  const kar = unitPrice - costPrice;
                  return (
                    <tr key={`${r.id}-${r.line_id ?? "none"}`} className="group hover:bg-gray-50 transition-colors">
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
                      <td className="px-4 py-3 text-center sticky right-[240px] z-10 bg-white group-hover:bg-gray-50 shadow-[-1px_0_0_0_#f3f4f6]">
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
                      <td className="px-4 py-3 sticky right-0 z-10 bg-white group-hover:bg-gray-50 w-[240px] min-w-[240px] max-w-[240px]">
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
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
        <div className="flex items-center gap-3">
          <span>
            {total === 0 ? 0 : (page - 1) * limit + 1}–{Math.min(page * limit, total)} / {total} satır
          </span>
          <label className="flex items-center gap-1.5 text-xs text-gray-500">
            Sayfa başına
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="border border-gray-300 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {[20, 50, 100, 200, 500].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>
        {total > limit && (
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
            {Array.from({ length: Math.ceil(total / limit) }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === Math.ceil(total / limit) || Math.abs(p - page) <= 2)
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
              disabled={page * limit >= total}
              className="px-3 py-1 rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ›
            </button>
            <button
              onClick={() => setPage(Math.ceil(total / limit))}
              disabled={page * limit >= total}
              className="px-2 py-1 rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              »
            </button>
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
