"use client";

import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { formatDate, formatCurrency } from "@/lib/format";
import { parseOrderRows, chunk, type ParsedOrder } from "@/lib/ordersExcel";
import { Tooltip } from "@/components/Tooltip";
import { useViewGuard, usePermission } from "../AuthContext";

const IMPORT_BATCH_SIZE = 20;

// Genel Ayarlar'daki ödeme şekilleri fetch edilene kadar (veya fetch
// başarısız olursa) kullanılacak varsayılan — DB'deki app_settings
// varsayılanıyla aynı.
const DEFAULT_PAYMENT_TYPES = ["Nakit", "POS", "Cari", "Fatura Edildi.", "Garanti Hesap", "Nazım Hesap", "Sait Hesap", "Mail Order"];

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
  const allowed = useViewGuard("orders");
  const canEdit = usePermission("orders.edit");
  const canDelete = usePermission("orders.delete");
  // İşlemler sütunu her zaman Detay içerir, Düzenle/Sil izne göre eklenir —
  // sütun genişliği görünen buton sayısına göre daralır, aksi halde izni
  // olmayan kullanıcılarda (ör. sadece orders.view) sütun boş yer kaplardı
  // (özellikle mobilde fark ediliyordu).
  const orderActionCount = 1 + (canEdit ? 1 : 0) + (canDelete ? 1 : 0);
  const ORDER_ACTIONS_WIDTH: Record<number, { cell: string; statusOffset: string }> = {
    1: { cell: "w-[44px] min-w-[44px] max-w-[44px] sm:w-[90px] sm:min-w-[90px] sm:max-w-[90px]", statusOffset: "sm:right-[90px]" },
    2: { cell: "w-[70px] min-w-[70px] max-w-[70px] sm:w-[155px] sm:min-w-[155px] sm:max-w-[155px]", statusOffset: "sm:right-[155px]" },
    3: { cell: "w-[96px] min-w-[96px] max-w-[96px] sm:w-[220px] sm:min-w-[220px] sm:max-w-[220px]", statusOffset: "sm:right-[220px]" },
  };
  const orderActionsWidth = ORDER_ACTIONS_WIDTH[orderActionCount];
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
  const [showMobileActions, setShowMobileActions] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [serviceOptions, setServiceOptions] = useState<string[]>([]);
  const [supplierOptions, setSupplierOptions] = useState<string[]>([]);
  const [paymentTypeOptions, setPaymentTypeOptions] = useState<string[]>([]);
  // Genel Ayarlar'daki ödeme şekilleri listesi — Filtrele modalındaki
  // paymentTypeOptions'tan farklı (o gerçekten kullanılmış değerlerdir),
  // bu Excel içe aktarma normalizasyonu için kullanılır (bkz. handleImport).
  const [settingsPaymentTypes, setSettingsPaymentTypes] = useState<string[]>(DEFAULT_PAYMENT_TYPES);

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
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d.payment_types)) setSettingsPaymentTypes(d.payment_types); })
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

  function SortTh({ sortK, label, align = "left", stickyClassName, narrow }: { sortK: SortKey; label: string; align?: "left" | "right" | "center"; stickyClassName?: string; narrow?: boolean }) {
    const active = sortKey === sortK;
    return (
      <th
        onClick={() => toggleSort(sortK)}
        className={`${narrow ? "px-2" : "px-4"} py-3 font-medium text-gray-600 whitespace-nowrap cursor-pointer select-none hover:text-gray-900 ${ALIGN_CLASS[align]} ${stickyClassName ?? ""}`}
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

  // Aktif filtreleri query param'a çevirir — hem liste fetch'i hem Excel'e
  // Dışa Aktar butonu aynı fonksiyonu kullanır ki ikisi asla farklı sonuç
  // vermesin (bkz. handleExport).
  function buildFilterParams(): URLSearchParams {
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
    return params;
  }

  async function fetchOrders(targetPage = page) {
    setLoading(true);
    const params = buildFilterParams();
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
        parsed = parseOrderRows(rawRows, settingsPaymentTypes);
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

  function handleExport() {
    const params = buildFilterParams();
    window.location.href = `/api/orders/export?${params}`;
  }

  const activeFilterCount =
    (statusFilter ? 1 : 0) + (dateFilter ? 1 : 0) +
    Object.values(fieldFilters).filter((v) => Array.isArray(v) ? v.length > 0 : v.trim()).length;

  // + 2: her zaman görünen Statü ve İşlemler sütunları.
  const visibleColCount = COLUMNS.filter((c) => visibleCols[c.key]).length + 2;

  if (!allowed) return null;

  return (
    <div onClick={() => { setShowColPicker(false); setShowMobileActions(false); }}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Sipariş Listesi</h1>
        <div className="flex gap-1.5 sm:gap-2">
          <input
            type="file"
            accept=".xlsx,.xls"
            ref={fileInputRef}
            onChange={handleImport}
            className="hidden"
          />

          {/* Masaüstü: ayrı ayrı butonlar */}
          <div className="hidden sm:flex gap-2">
            {canEdit && (
              <button
                onClick={() => { window.location.href = "/api/orders/import/template"; }}
                className="shrink-0 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-50 flex items-center gap-1 whitespace-nowrap"
              >
                Şablon İndir
                <Tooltip text="Tarih, Plaka ve Yapılan İşlem zorunludur, diğer sütunlar isteğe bağlıdır.">
                  <span className="text-gray-400 hover:text-gray-600 cursor-help">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
                    </svg>
                  </span>
                </Tooltip>
              </button>
            )}
            {canEdit && (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                className="shrink-0 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 whitespace-nowrap"
              >
                {importing ? "İçe Aktarılıyor..." : "Excel'den İçe Aktar"}
              </button>
            )}
            <button
              onClick={handleExport}
              className="shrink-0 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 whitespace-nowrap"
            >
              {activeFilterCount > 0 || search ? "Filtreliyi Dışa Aktar" : "Dışa Aktar"}
            </button>
            <Link
              href="/"
              className="shrink-0 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium whitespace-nowrap"
            >
              + Sipariş Ekle
            </Link>
          </div>

          {/* Mobil: hızlı menü altında toplanmış aksiyonlar */}
          <div className="relative sm:hidden shrink-0">
            <button
              onClick={(e) => { e.stopPropagation(); setShowMobileActions((v) => !v); }}
              className="shrink-0 px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-1 whitespace-nowrap"
            >
              İşlemler
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showMobileActions && (
              <div
                className="absolute left-0 top-full mt-1 z-30 bg-white border border-gray-200 rounded-xl shadow-lg py-1 w-56"
                onClick={(e) => e.stopPropagation()}
              >
                {canEdit && (
                  <button
                    onClick={() => { setShowMobileActions(false); window.location.href = "/api/orders/import/template"; }}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Şablon İndir
                  </button>
                )}
                {canEdit && (
                  <button
                    onClick={() => { setShowMobileActions(false); fileInputRef.current?.click(); }}
                    disabled={importing}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {importing ? "İçe Aktarılıyor..." : "Excel'den İçe Aktar"}
                  </button>
                )}
                <button
                  onClick={() => { setShowMobileActions(false); handleExport(); }}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  {activeFilterCount > 0 || search ? "Filtreliyi Dışa Aktar" : "Dışa Aktar"}
                </button>
                <Link
                  href="/"
                  onClick={() => setShowMobileActions(false)}
                  className="block px-4 py-2.5 text-sm font-medium text-blue-600 hover:bg-blue-50"
                >
                  + Sipariş Ekle
                </Link>
              </div>
            )}
          </div>
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
      <div className="bg-white rounded-xl shadow-sm p-4 mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={(e) => { e.stopPropagation(); setShowFilterModal(true); }}
            className="shrink-0 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 flex items-center gap-2"
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

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Hızlı ara: Plaka, Müşteri, Tedarikçi..."
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1 min-w-0 sm:w-96 sm:flex-none"
          />

          {activeFilterCount > 0 && (
            <button
              onClick={() => { setStatusFilter(""); setDateFilter(""); setCustomFrom(""); setCustomTo(""); setFieldFilters(EMPTY_FIELD_FILTERS); }}
              className="hidden sm:inline text-sm text-gray-400 hover:text-gray-700"
            >
              Filtreleri Temizle
            </button>
          )}
        </div>



        <div className="flex items-stretch gap-1.5 sm:gap-3 sm:ml-auto">
          <div className="shrink-0 flex items-center gap-2 sm:gap-4 px-2 sm:px-4 py-1 sm:py-1.5 bg-gray-50 border border-gray-200 rounded-lg">
            <div>
              <div className="text-[9px] sm:text-[10px] font-medium text-gray-500 uppercase tracking-wide">Toplam Tutar</div>
              <div className="text-xs sm:text-sm font-semibold text-gray-800 whitespace-nowrap">{formatCurrency(totalAmount)}</div>
            </div>
            <div className="w-px h-6 sm:h-7 bg-gray-200" />
            <div>
              <div className="text-[9px] sm:text-[10px] font-medium text-gray-500 uppercase tracking-wide">Kâr</div>
              <div className={`text-xs sm:text-sm font-semibold whitespace-nowrap ${totalKar >= 0 ? "text-green-600" : "text-red-500"}`}>
                {formatCurrency(totalKar)}
              </div>
            </div>
          </div>
          <div className="relative shrink-0 flex">
            <button
              onClick={(e) => { e.stopPropagation(); setShowColPicker((v) => !v); }}
              className="h-full px-1.5 sm:px-3 border border-gray-300 rounded-lg text-[11px] sm:text-sm text-gray-600 hover:bg-gray-50 flex items-center gap-1 sm:gap-2 whitespace-nowrap"
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
            className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 pb-4">
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
            </div>

            <div className="sticky bottom-0 sm:static bg-white border-t border-gray-100 sm:border-t-0 px-6 py-4 sm:pt-0 sm:pb-6 flex gap-3">
              <button
                onClick={() => { setStatusFilter(""); setDateFilter(""); setCustomFrom(""); setCustomTo(""); setFieldFilters(EMPTY_FIELD_FILTERS); }}
                className="flex-1 border border-gray-300 text-gray-700 text-sm sm:text-base font-medium py-2 sm:py-2.5 rounded-lg hover:bg-gray-50"
              >
                Filtreleri Temizle
              </button>
              <button
                onClick={() => setShowFilterModal(false)}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm sm:text-base font-semibold py-2 sm:py-2.5 rounded-lg transition-colors"
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
          <table className="w-full text-xs sm:text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {visibleCols.order_no && <SortTh sortK="order_no" label="Sipariş No" narrow />}
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
                <SortTh sortK="status" label="Statü" align="center" stickyClassName={`sm:sticky ${orderActionsWidth.statusOffset} sm:z-20 sm:bg-gray-50 sm:shadow-[-1px_0_0_0_#e5e7eb]`} />
                <th className={`px-1.5 py-3 sticky right-0 z-20 bg-gray-50 ${orderActionsWidth.cell}`}></th>
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
                        <td className="px-2 py-3 whitespace-nowrap">
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
                      <td className={`px-1.5 py-3 text-center sm:sticky ${orderActionsWidth.statusOffset} sm:z-10 sm:bg-white sm:group-hover:bg-gray-50 sm:shadow-[-1px_0_0_0_#f3f4f6]`}>
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
                      <td className={`px-1 sm:px-3 py-3 sticky right-0 z-10 bg-white group-hover:bg-gray-50 ${orderActionsWidth.cell}`}>
                        <div className="flex items-center justify-center sm:justify-start gap-0.5 sm:gap-3">
                          <Link
                            href={`/admin/orders/${r.id}`}
                            title="Detay"
                            aria-label="Detay"
                            className="flex items-center gap-1 p-1 sm:p-0 rounded text-blue-600 hover:bg-blue-50 sm:hover:bg-transparent hover:text-blue-800 text-xs font-medium whitespace-nowrap"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <span className="hidden sm:inline">Detay</span>
                          </Link>
                          {canEdit && (
                            <Link
                              href={`/admin/orders/${r.id}?edit=1`}
                              title="Düzenle"
                              aria-label="Düzenle"
                              className="flex items-center gap-1 p-1 sm:p-0 rounded text-gray-500 hover:bg-gray-100 sm:hover:bg-transparent hover:text-gray-700 text-xs font-medium whitespace-nowrap"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.5 19.5H4.5" />
                              </svg>
                              <span className="hidden sm:inline">Düzenle</span>
                            </Link>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => deleteOrder(r.id)}
                              disabled={deletingId === r.id}
                              title="Sil"
                              aria-label="Sil"
                              className="flex items-center gap-1 p-1 sm:p-0 rounded text-red-500 hover:bg-red-50 sm:hover:bg-transparent hover:text-red-700 disabled:opacity-40 text-xs font-medium whitespace-nowrap"
                            >
                              {deletingId === r.id ? (
                                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={3} />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
                                </svg>
                              ) : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                </svg>
                              )}
                              <span className="hidden sm:inline">{deletingId === r.id ? "Siliniyor..." : "Sil"}</span>
                            </button>
                          )}
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
      <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm text-gray-600">
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
          <div className="flex gap-1 overflow-x-auto">
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
