"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { formatDate, formatCurrency } from "@/lib/format";

interface OrderDetail {
  id: number;
  plate: string;
  customer_name: string | null;
  customer_phone: string | null;
  notes: string | null;
  total_amount: number;
  paid_amount: number | null;
  status: "BEKLEMEDE" | "TAMAMLANDI";
  payment_type: string | null;
  payment_date: string | null;
  created_at: string;
  services: {
    id: number;
    line_id: number;
    name: string;
    unit_price: number;
    quantity: number;
    cost_price: number | null;
    supplier: string | null;
    stock_code: string | null;
    size_desc: string | null;
    payment_type: string | null;
    product_id: number | null;
  }[];
}

interface Service {
  id: number;
  name: string;
  price: number | null;
}
interface Customer {
  id: number;
  name: string;
  phone: string | null;
}
interface Supplier {
  id: number;
  name: string;
}
interface EditLine {
  id: number | null;
  service_name: string;
  supplier: string;
  stock_code: string;
  size_desc: string;
  quantity: string;
  unit_price: string;
  cost_price: string;
  payment_type: string;
  // "Lastik Satışı" işleminde belirli bir parti seçildiyse doldurulur — o
  // partinin stoğundan Adet kadar düşülür. max_stock, unit_sale_price ve
  // unit_purchase_price sadece istemcide tutulur (API'ye gönderilmez);
  // birim fiyatlar Adet değişince Tutar/Maliyet'i yeniden hesaplamak içindir.
  product_id: number | null;
  max_stock: number | null;
  unit_sale_price: number | null;
  unit_purchase_price: number | null;
}

interface StockBatch {
  id: number;
  production_week: number | null;
  production_year: number | null;
  size_desc: string | null;
  stock_qty: number;
  avg_purchase_price: string | number | null;
  avg_sale_price: string | number | null;
}

// Yalnızca bu işlem seçildiğinde Tedarikçi/Stok Kodu/Üretim Haftası-Yılı
// akışı Ürün sayfasındaki stoğa bağlanır ve kaydedilince stoktan düşülür.
const TIRE_SALE_SERVICE = "Lastik Satışı";

// Bir ürün/parça satışı temsil eden işlemler — bunlarda Tedarikçi varsayılan
// olarak "Servis İşçiliği" gelmez (boş bırakılır, gerçek tedarikçi seçilir) ve
// Stok Kodu alanı gösterilir. Diğer (işçilik) işlemlerde ikisi de gizlenir.
const PRODUCT_SALE_SERVICES = new Set(["Lastik Satışı", "Jant Satışı", "İkinci El Lastik", "İkinci El Jant"]);

function weekYearLabel(week: number | null, year: number | null): string {
  if (week == null || year == null) return "—";
  return `${String(week).padStart(2, "0")}/${String(year).slice(-2)}`;
}

// Eski enum değerleri (NAKIT/KREDI_KARTI/HAVALE) geçmiş siparişlerde hâlâ olabilir;
// yeni ödeme tipi serbest metin ve doğrudan Excel'deki etiketleri kullanır.
const PAYMENT_LABELS: Record<string, string> = {
  NAKIT: "Nakit",
  KREDI_KARTI: "Kredi Kartı",
  HAVALE: "Havale / EFT",
};

// "Mail Order" seçilirse tedarikçi listesinden biri seçilir; nihai değer
// "<Tedarikçi> Mail Order" olarak saklanır (Excel'deki tarihi verilerle aynı format).
const PAYMENT_OPTIONS = ["Nakit", "POS", "Cari", "Fatura Edildi.", "Garanti Hesap", "Nazım Hesap", "Sait Hesap", "Mail Order"];
const MAIL_ORDER_SUFFIX = " Mail Order";

const TEDARIKCI_SEED = [
  "Servis İşçiliği", "YUKE", "Keskin", "Artvin", "FB Lastik", "Uspa", "Güler",
  "Simetri", "Mollaoğlu", "Karaoğlu", "Yedi Oto", "Jantçı Bülent", "Sel Oto",
  "Mutaflar", "Güncan Veysel", "DRS", "LastikBurada", "Atlastur", "Gizem Oto",
  "İkinci El", "Hankook Fabrika", "Diğer", "Has Ticaret", "Özkan Lastik", "Haskar",
];

const EMPTY_EDIT_LINE: EditLine = {
  id: null, service_name: "", supplier: "Servis İşçiliği", stock_code: "", size_desc: "",
  quantity: "1", unit_price: "", cost_price: "0", payment_type: "", product_id: null, max_stock: null,
  unit_sale_price: null, unit_purchase_price: null,
};

function num(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Ürün sayfasındaki ortalama fiyatlar (numeric) çok haneli ondalık dönebilir
// (ör. "955.5555555555555556") — Tutar/Maliyet alanına doldururken 2 haneye yuvarlanır.
// Tutar/Maliyet, satırın toplamıdır (birim fiyat × Adet) — Kar da bu toplamlar
// üzerinden hesaplanır. Bir parti seçildiğinde ya da Adet değiştiğinde bu
// toplam yeniden hesaplanır.
function amountToStr(unitPrice: number | null, qty: number): string {
  if (unitPrice == null) return "";
  return String(Math.round(unitPrice * qty * 100) / 100);
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
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = query
    ? options.filter((o) => o.toLocaleLowerCase("tr-TR").includes(query.toLocaleLowerCase("tr-TR")))
    : options;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current && !containerRef.current.contains(e.target as Node) &&
        !(e.target as HTMLElement).closest("[data-combobox-list]")
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Dropdown, İşlem Satırları tablosunun yatay kaydırma alanı (overflow-x-auto)
  // tarafından kırpılmasın diye document.body'e portal ile taşınır; konumu
  // input'un ekran koordinatlarına göre hesaplanır.
  useEffect(() => {
    if (!open) return;
    function updateRect() {
      if (!inputRef.current) return;
      const r = inputRef.current.getBoundingClientRect();
      setRect({ top: r.bottom, left: r.left, width: r.width });
    }
    updateRect();
    window.addEventListener("scroll", updateRect, true);
    window.addEventListener("resize", updateRect);
    return () => {
      window.removeEventListener("scroll", updateRect, true);
      window.removeEventListener("resize", updateRect);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); setQuery(e.target.value); setOpen(true); }}
        onFocus={(e) => { setQuery(""); setOpen(true); e.target.select(); }}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {open && filtered.length > 0 && rect && typeof document !== "undefined" && createPortal(
        <ul
          data-combobox-list
          style={{ position: "fixed", top: rect.top + 4, left: rect.left, width: rect.width }}
          className="z-50 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto"
        >
          {filtered.map((opt) => (
            <li
              key={opt}
              onMouseDown={(e) => { e.preventDefault(); onChange(opt); setOpen(false); }}
              className={`px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 hover:text-blue-700 ${value === opt ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700"}`}
            >
              {opt}
            </li>
          ))}
        </ul>,
        document.body
      )}
    </div>
  );
}

// Ödeme tipi seçici — "Mail Order" seçilince ikinci bir tedarikçi seçici belirir;
// nihai değer "<Tedarikçi> Mail Order" olur. selectClassName ile modal/tablo
// bağlamlarında farklı boyut uygulanabilir.
function PaymentTypeSelect({
  value, onChange, supplierOptions, selectClassName,
}: {
  value: string;
  onChange: (val: string) => void;
  supplierOptions: string[];
  selectClassName: string;
}) {
  const isMailOrder = value === "Mail Order" || value.endsWith(MAIL_ORDER_SUFFIX);
  const baseValue = isMailOrder ? "Mail Order" : value;
  const mailOrderSupplier = value.endsWith(MAIL_ORDER_SUFFIX)
    ? value.slice(0, -MAIL_ORDER_SUFFIX.length)
    : "";

  return (
    <div className="flex gap-1.5">
      <select
        value={baseValue}
        onChange={(e) => {
          const next = e.target.value;
          if (next === "Mail Order") {
            onChange(mailOrderSupplier ? `${mailOrderSupplier}${MAIL_ORDER_SUFFIX}` : "Mail Order");
          } else {
            onChange(next);
          }
        }}
        className={selectClassName}
      >
        <option value="">Seçilmedi</option>
        {PAYMENT_OPTIONS.map((val) => (
          <option key={val} value={val}>{val}</option>
        ))}
      </select>
      {baseValue === "Mail Order" && (
        <select
          value={mailOrderSupplier}
          onChange={(e) => onChange(e.target.value ? `${e.target.value}${MAIL_ORDER_SUFFIX}` : "Mail Order")}
          className={selectClassName}
        >
          <option value="">Tedarikçi seç...</option>
          {supplierOptions.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      )}
    </div>
  );
}

// "Lastik Satışı" satırındaki Stok Kodu hücresi: kod seçilir/yazılır (seçilen
// tedarikçide stoğu olan kodlar önerilir), kod bir partiyle eşleşince altında
// Üretim Haftası/Yılı seçici belirir — seçilen parti product_id + Ebat + o
// partinin mevcut stoğunu (max_stock, anlık uyarı için) üst bileşene bildirir.
function TireBatchPicker({
  supplier, code, productId, codeOptions, onCodeChange, onBatchSelect,
}: {
  supplier: string;
  code: string;
  productId: number | null;
  codeOptions: string[];
  onCodeChange: (code: string) => void;
  onBatchSelect: (batch: StockBatch | null) => void;
}) {
  const [batches, setBatches] = useState<StockBatch[]>([]);

  useEffect(() => {
    if (!supplier.trim() || !code.trim()) {
      setBatches([]);
      return;
    }
    const t = setTimeout(() => {
      fetch(`/api/products/stock-batches?supplier=${encodeURIComponent(supplier)}&code=${encodeURIComponent(code)}`)
        .then((r) => r.json())
        .then((data: StockBatch[]) => { if (Array.isArray(data)) setBatches(data); })
        .catch(() => setBatches([]));
    }, 300);
    return () => clearTimeout(t);
  }, [supplier, code]);

  return (
    <div className="space-y-1">
      <SearchableCombobox
        value={code}
        onChange={(val) => { onCodeChange(val); onBatchSelect(null); }}
        options={codeOptions}
        placeholder="Ürün kodu..."
      />
      {batches.length > 0 && (
        <select
          value={productId ?? ""}
          onChange={(e) => {
            const b = batches.find((x) => x.id === Number(e.target.value));
            onBatchSelect(b ?? null);
          }}
          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Parti (Hafta/Yıl) seç...</option>
          {batches.map((b) => (
            <option key={b.id} value={b.id}>
              {weekYearLabel(b.production_week, b.production_year)} — Stok: {b.stock_qty}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function OrderDetailPageInner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const autoEditApplied = useRef(false);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  // Her sipariş satırı (işlem) kendi ödeme tipini alabilir — line_id -> payment_type.
  const [linePayments, setLinePayments] = useState<Record<number, string>>({});
  const [paidAmount, setPaidAmount] = useState("");
  const [closing, setClosing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState("");

  // Düzenleme
  const [editing, setEditing] = useState(false);
  const [editPlate, setEditPlate] = useState("");
  const [editCustomerName, setEditCustomerName] = useState("");
  const [editCustomerPhone, setEditCustomerPhone] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editLines, setEditLines] = useState<EditLine[]>([]);
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [supplierOptions, setSupplierOptions] = useState<string[]>(TEDARIKCI_SEED);
  const [stockCodesBySupplier, setStockCodesBySupplier] = useState<Record<string, string[]>>({});

  async function fetchOrder() {
    const res = await fetch(`/api/orders/${id}`);
    if (res.ok) {
      setOrder(await res.json());
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchOrder();

    fetch("/api/services").then((r) => r.json()).then((d) => { if (Array.isArray(d)) setServices(d); }).catch(() => { });
    fetch("/api/customers").then((r) => r.json()).then((d) => { if (Array.isArray(d)) setCustomers(d); }).catch(() => { });
    fetch("/api/suppliers")
      .then((r) => r.json())
      .then((d: Supplier[]) => {
        if (!Array.isArray(d)) return;
        const merged = Array.from(new Set([...TEDARIKCI_SEED, ...d.map((s) => s.name)])).sort((a, b) => a.localeCompare(b, "tr-TR"));
        setSupplierOptions(merged);
      })
      .catch(() => { });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // "Lastik Satışı" satırında Tedarikçi seçilince, o tedarikçide stoğu olan
  // ürün kodları (henüz önbellekte yoksa) çekilir.
  function ensureStockCodes(supplier: string) {
    if (!supplier.trim() || stockCodesBySupplier[supplier]) return;
    fetch(`/api/products/stock-codes?supplier=${encodeURIComponent(supplier)}`)
      .then((r) => r.json())
      .then((data: string[]) => {
        if (Array.isArray(data)) setStockCodesBySupplier((prev) => ({ ...prev, [supplier]: data }));
      })
      .catch(() => { });
  }

  const islemOptions = services.map((s) => s.name);
  const customerOptions = customers.map((c) => c.name);
  const priceByName = new Map(
    services.filter((s) => s.price != null).map((s) => [s.name.toLocaleLowerCase("tr-TR"), Number(s.price)])
  );
  const phoneByCustomer = new Map(customers.map((c) => [c.name.toLocaleLowerCase("tr-TR"), c.phone]));
  // Ebat sütunu (başlık dahil) yalnızca en az bir "Lastik Satışı" satırı
  // varsa gösterilir — diğer işlemlerde bu bilgi anlamsız.
  const hasTireSaleLine = editLines.some((l) => l.service_name.trim() === TIRE_SALE_SERVICE);
  // Stok Kodu sütunu (başlık dahil) yalnızca en az bir ürün/parça satışı
  // (Lastik/Jant/İkinci El) satırı varsa gösterilir — işçilik satırlarında girilmez.
  const hasProductSaleLine = editLines.some((l) => PRODUCT_SALE_SERVICES.has(l.service_name.trim()));

  function openEdit() {
    if (!order) return;
    setEditPlate(order.plate);
    setEditCustomerName(order.customer_name || "");
    setEditCustomerPhone(order.customer_phone || "");
    setEditNotes(order.notes || "");
    setEditLines(order.services.map((svc) => ({
      id: svc.line_id,
      service_name: svc.name,
      supplier: svc.supplier || "",
      stock_code: svc.stock_code || "",
      size_desc: svc.size_desc || "",
      quantity: String(svc.quantity),
      unit_price: String(svc.unit_price),
      cost_price: svc.cost_price != null ? String(svc.cost_price) : "0",
      payment_type: svc.payment_type || "",
      product_id: svc.product_id ?? null,
      max_stock: null,
      unit_sale_price: null,
      unit_purchase_price: null,
    })));
    // Mevcut "Lastik Satışı" satırlarının tedarikçileri için kod önerilerini
    // önden çeker, böylece parti seçici açılır açılmaz dolu gelir.
    order.services
      .filter((svc) => svc.name === TIRE_SALE_SERVICE && svc.supplier)
      .forEach((svc) => ensureStockCodes(svc.supplier as string));
    setEditError("");
    setEditing(true);
  }

  // Sipariş Listesi'ndeki "Düzelt" linki ?edit=1 ile geldiğinde, sipariş
  // yüklenir yüklenmez düzenleme modu otomatik açılır (sadece bir kez).
  useEffect(() => {
    if (order && !autoEditApplied.current && searchParams.get("edit") === "1") {
      autoEditApplied.current = true;
      openEdit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order]);

  function updateEditLine(index: number, patch: Partial<EditLine>) {
    setEditLines((prev) => prev.map((l, i) => {
      if (i !== index) return l;
      const next = { ...l, ...patch };
      if (patch.service_name !== undefined && patch.service_name !== l.service_name) {
        const trimmed = patch.service_name.trim();
        const match = priceByName.get(trimmed.toLocaleLowerCase("tr-TR"));
        // Yalnızca satırda henüz bir tutar yoksa (yeni satır) katalog fiyatı
        // otomatik doldurulur — mevcut (ör. Excel'den aktarılmış) bir tutar,
        // İşlem alanında arama yapıp aynı işlemi tekrar seçmekle bile silinmez.
        if (match != null && !l.unit_price.trim()) next.unit_price = String(match);
        // İşlem değişince önceki parti bağlantısı artık geçerli olmayabilir.
        next.product_id = null;
        next.max_stock = null;
        next.unit_sale_price = null;
        next.unit_purchase_price = null;
        if (trimmed !== TIRE_SALE_SERVICE) next.size_desc = "";
        // Ürün/parça satışlarında "Servis İşçiliği" varsayılanı anlamsız —
        // gerçek tedarikçi seçilsin diye boş bırakılır. Diğer işlemlerde geri döner.
        if (PRODUCT_SALE_SERVICES.has(trimmed)) {
          if (l.supplier === "Servis İşçiliği") next.supplier = "";
        } else if (!l.supplier.trim()) {
          next.supplier = "Servis İşçiliği";
        }
        if (!PRODUCT_SALE_SERVICES.has(trimmed)) next.stock_code = "";
      }
      return next;
    }));
  }

  function addEditLine() {
    setEditLines((prev) => [...prev, { ...EMPTY_EDIT_LINE }]);
  }

  function removeEditLine(index: number) {
    setEditLines((prev) => prev.length === 1 ? prev : prev.filter((_, i) => i !== index));
  }

  async function handleSaveEdit() {
    setEditError("");
    if (!editPlate.trim()) {
      setEditError("Araç plakası zorunludur.");
      return;
    }
    const validLines = editLines.filter((l) => l.service_name.trim());
    if (validLines.length === 0) {
      setEditError("En az bir işlem satırı giriniz.");
      return;
    }
    const overStock = validLines.find((l) => l.product_id && l.max_stock != null && Math.round(num(l.quantity)) > l.max_stock);
    if (overStock) {
      setEditError(`Yetersiz stok: "${overStock.stock_code}" için sadece ${overStock.max_stock} adet mevcut.`);
      return;
    }
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/orders/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plate: editPlate.replace(/\s+/g, "").toUpperCase(),
          customer_name: editCustomerName.trim() || null,
          customer_phone: editCustomerPhone.trim() || null,
          notes: editNotes.trim() || null,
          lines: validLines.map((l) => ({
            id: l.id,
            service_name: l.service_name.trim(),
            supplier: l.supplier.trim() || null,
            stock_code: l.stock_code.trim() || null,
            size_desc: l.size_desc.trim() || null,
            quantity: Math.max(1, Math.round(num(l.quantity)) || 1),
            unit_price: num(l.unit_price),
            cost_price: num(l.cost_price),
            payment_type: l.payment_type || null,
            product_id: l.product_id,
          })),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Kaydetme başarısız.");
      }
      setEditing(false);
      await fetchOrder();
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : "Hata oluştu.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleClose() {
    if (!order) return;
    setClosing(true);
    setError("");
    try {
      const res = await fetch(`/api/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: order.services.map((svc) => ({
            id: svc.line_id,
            payment_type: linePayments[svc.line_id] ?? "Nakit",
          })),
          paid_amount: paidAmount ? Number(paidAmount) : null,
        }),
      });
      if (!res.ok) throw new Error("İşlem başarısız.");
      setShowModal(false);
      await fetchOrder();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Hata oluştu.");
    } finally {
      setClosing(false);
    }
  }

  if (loading) {
    return <div className="p-12 text-center text-gray-400">Yükleniyor...</div>;
  }
  if (!order) {
    return <div className="p-12 text-center text-gray-400">Sipariş bulunamadı.</div>;
  }

  if (editing) {
    return (
      <div className="fixed inset-0 z-40 bg-white overflow-y-auto">
        <div className="max-w-7xl mx-auto p-6">
            <button
              onClick={() => setEditing(false)}
              className="mb-4 text-sm text-gray-500 hover:text-gray-800"
            >
              ← Geri
            </button>

            <div className="flex items-center justify-between mb-6">
              <h1 className="text-xl font-bold text-gray-800">Sipariş #{order.id} — Düzelt</h1>
            </div>

            {editError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                {editError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Araç Plakası <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editPlate}
                  onChange={(e) => setEditPlate(e.target.value.replace(/\s+/g, ""))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base font-mono uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Müşteri Adı</label>
                <SearchableCombobox
                  value={editCustomerName}
                  onChange={(val) => {
                    setEditCustomerName(val);
                    if (!editCustomerPhone) {
                      const knownPhone = phoneByCustomer.get(val.trim().toLocaleLowerCase("tr-TR"));
                      if (knownPhone) setEditCustomerPhone(knownPhone);
                    }
                  }}
                  options={customerOptions}
                  placeholder="Müşteri seç veya yaz..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Telefon</label>
                <input
                  type="tel"
                  value={editCustomerPhone}
                  onChange={(e) => setEditCustomerPhone(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                İşlem Satırları <span className="text-red-500">*</span>
              </label>
              <div className="border border-gray-200 rounded-lg overflow-x-auto">
                {/* table-fixed: sütun genişlikleri sabit kalır, Ödeme sütunu
                    Mail Order için ikinci bir seçici gösterse bile diğer
                    sütunlar sıkışmaz — taşma yatay kaydırmayla karşılanır. */}
                <table className="text-sm border-collapse table-fixed" style={{ width: "1232px" }}>
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-2 py-2 font-medium text-gray-600 whitespace-nowrap w-[160px]">Yapılan İşlem</th>
                      <th className="text-left px-2 py-2 font-medium text-gray-600 whitespace-nowrap w-[150px]">Tedarikçi</th>
                      {hasProductSaleLine && <th className="text-left px-2 py-2 font-medium text-gray-600 whitespace-nowrap w-[110px]">Stok Kodu</th>}
                      {hasTireSaleLine && <th className="text-left px-2 py-2 font-medium text-gray-600 whitespace-nowrap w-[220px]">Ebat</th>}
                      <th className="text-right px-2 py-2 font-medium text-gray-600 whitespace-nowrap w-[72px]">Adet</th>
                      <th className="text-right px-2 py-2 font-medium text-gray-600 whitespace-nowrap w-[112px]">Tutar (₺)</th>
                      <th className="text-right px-2 py-2 font-medium text-gray-600 whitespace-nowrap w-[112px]">Maliyet (₺)</th>
                      <th className="text-left px-2 py-2 font-medium text-gray-600 whitespace-nowrap w-[256px]">Ödeme</th>
                      <th className="px-2 py-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {editLines.map((line, i) => {
                      const isTireSale = line.service_name.trim() === TIRE_SALE_SERVICE;
                      const isProductSale = PRODUCT_SALE_SERVICES.has(line.service_name.trim());
                      const overStock = line.product_id != null && line.max_stock != null && Math.round(num(line.quantity)) > line.max_stock;
                      return (
                      <tr key={i}>
                        <td className="px-2 py-2 align-top">
                          <SearchableCombobox
                            value={line.service_name}
                            onChange={(val) => updateEditLine(i, { service_name: val })}
                            options={islemOptions}
                            placeholder="İşlem seç veya yaz..."
                          />
                        </td>
                        <td className="px-2 py-2 align-top">
                          <SearchableCombobox
                            value={line.supplier}
                            onChange={(val) => {
                              if (isTireSale) {
                                // Stok Kodu/Ebat yalnızca gerçek bir stok partisine bağlıysa
                                // (product_id doluysa) sıfırlanır — o parti eski tedarikçiye
                                // ait, artık geçersiz olur. Excel'den aktarılmış/elle girilmiş
                                // (stoğa bağlı olmayan) Ebat, tedarikçi düzeltirken silinmesin.
                                if (line.product_id != null) {
                                  updateEditLine(i, { supplier: val, stock_code: "", size_desc: "", product_id: null, max_stock: null, unit_sale_price: null, unit_purchase_price: null });
                                } else {
                                  updateEditLine(i, { supplier: val });
                                }
                                ensureStockCodes(val);
                              } else {
                                updateEditLine(i, { supplier: val });
                              }
                            }}
                            options={supplierOptions}
                            placeholder="Tedarikçi seç veya yaz..."
                          />
                        </td>
                        {hasProductSaleLine && (
                          <td className="px-2 py-2 align-top">
                            {isTireSale ? (
                              <TireBatchPicker
                                supplier={line.supplier}
                                code={line.stock_code}
                                productId={line.product_id}
                                codeOptions={stockCodesBySupplier[line.supplier] ?? []}
                                onCodeChange={(val) => updateEditLine(i, { stock_code: val })}
                                onBatchSelect={(batch) => {
                                  const qty = Math.max(1, Math.round(num(line.quantity)) || 1);
                                  const salePrice = batch?.avg_sale_price != null ? Number(batch.avg_sale_price) : null;
                                  const purchasePrice = batch?.avg_purchase_price != null ? Number(batch.avg_purchase_price) : null;
                                  updateEditLine(i, {
                                    product_id: batch?.id ?? null,
                                    size_desc: batch?.size_desc || line.size_desc,
                                    max_stock: batch?.stock_qty ?? null,
                                    unit_sale_price: salePrice,
                                    unit_purchase_price: purchasePrice,
                                    unit_price: batch ? amountToStr(salePrice, qty) : line.unit_price,
                                    cost_price: batch ? amountToStr(purchasePrice, qty) : line.cost_price,
                                  });
                                }}
                              />
                            ) : isProductSale ? (
                              <input
                                type="text"
                                value={line.stock_code}
                                onChange={(e) => updateEditLine(i, { stock_code: e.target.value })}
                                className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            ) : (
                              <span className="text-gray-300 text-sm">—</span>
                            )}
                          </td>
                        )}
                        {hasTireSaleLine && (
                          <td className="px-2 py-2 align-top">
                            {isTireSale ? (
                              <input
                                type="text"
                                value={line.size_desc}
                                onChange={(e) => updateEditLine(i, { size_desc: e.target.value })}
                                className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            ) : (
                              <span className="text-gray-300 text-sm">—</span>
                            )}
                          </td>
                        )}
                        <td className="px-2 py-2 align-top">
                          <input
                            type="number"
                            min="1"
                            value={line.quantity}
                            onChange={(e) => {
                              const quantity = e.target.value;
                              if (line.product_id != null && (line.unit_sale_price != null || line.unit_purchase_price != null)) {
                                const qty = Math.max(1, Math.round(num(quantity)) || 1);
                                updateEditLine(i, {
                                  quantity,
                                  unit_price: amountToStr(line.unit_sale_price, qty),
                                  cost_price: amountToStr(line.unit_purchase_price, qty),
                                });
                              } else {
                                updateEditLine(i, { quantity });
                              }
                            }}
                            className={`w-full border rounded-lg px-2 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500 ${overStock ? "border-red-400" : "border-gray-300"}`}
                          />
                          {line.product_id != null && line.max_stock != null && (
                            <p className={`text-[10px] mt-0.5 whitespace-nowrap ${overStock ? "text-red-500 font-medium" : "text-gray-400"}`}>
                              Stok: {line.max_stock}
                            </p>
                          )}
                        </td>
                        <td className="px-2 py-2 align-top">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.unit_price}
                            onChange={(e) => updateEditLine(i, { unit_price: e.target.value })}
                            className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm text-right font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-2 py-2 align-top">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.cost_price}
                            onChange={(e) => updateEditLine(i, { cost_price: e.target.value })}
                            className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-2 py-2 align-top">
                          <PaymentTypeSelect
                            value={line.payment_type}
                            onChange={(val) => updateEditLine(i, { payment_type: val })}
                            supplierOptions={supplierOptions}
                            selectClassName="flex-1 min-w-0 border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-2 py-2 align-top text-center pt-4">
                          {editLines.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeEditLine(i)}
                              className="text-red-400 hover:text-red-600 text-xs font-medium"
                            >
                              Sil
                            </button>
                          )}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                onClick={addEditLine}
                className="mt-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                + Satır Ekle
              </button>
            </div>

            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-1">Notlar</label>
              <textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={3}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setEditing(false)}
                className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg hover:bg-gray-50"
              >
                İptal
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={savingEdit}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-2.5 rounded-lg transition-colors"
              >
                {savingEdit ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <button
        onClick={() => router.back()}
        className="mb-4 text-sm text-gray-500 hover:text-gray-800"
      >
        ← Geri
      </button>

      <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h1 className="text-3xl font-bold font-mono text-gray-800">{order.plate}</h1>
                <p className="text-gray-500 text-sm mt-1">Sipariş #{order.id}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={openEdit}
                  className="px-3 py-1 rounded-lg text-sm font-medium border border-gray-300 text-gray-600 hover:bg-gray-50"
                >
                  Düzelt
                </button>
                <span
                  className={`px-3 py-1 rounded-full text-sm font-medium ${order.status === "TAMAMLANDI"
                    ? "bg-green-100 text-green-700"
                    : "bg-yellow-100 text-yellow-700"
                    }`}
                >
                  {order.status === "TAMAMLANDI" ? "Tamamlandı" : "Beklemede"}
                </span>
              </div>
            </div>

            {/* Müşteri Bilgileri */}
            {(order.customer_name || order.customer_phone) && (
              <div className="mb-5 p-4 bg-gray-50 rounded-lg">
                <h2 className="text-xs font-medium text-gray-500 uppercase mb-2">Müşteri</h2>
                {order.customer_name && (
                  <p className="font-medium text-gray-800">{order.customer_name}</p>
                )}
                {order.customer_phone && (
                  <p className="text-gray-600">{order.customer_phone}</p>
                )}
              </div>
            )}

            {/* Hizmetler */}
            <div className="mb-5">
              <h2 className="text-xs font-medium text-gray-500 uppercase mb-2">Hizmetler</h2>
              <div className="space-y-2">
                {order.services.map((svc) => (
                  <div key={svc.line_id} className="flex justify-between">
                    <span className="text-gray-700">
                      {svc.name}
                      {svc.quantity > 1 && <span className="text-gray-400"> ×{svc.quantity}</span>}
                      {svc.size_desc && <span className="text-gray-400"> — {svc.size_desc}</span>}
                      {svc.supplier && <span className="text-xs text-gray-400"> ({svc.supplier})</span>}
                      {svc.payment_type && (
                        <span className="ml-2 inline-block px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 text-xs font-medium">
                          {svc.payment_type}
                        </span>
                      )}
                    </span>
                    <span className="font-semibold text-gray-800">
                      {formatCurrency(svc.unit_price)}
                    </span>
                  </div>
                ))}
                <div className="border-t pt-2 flex justify-between font-bold text-lg">
                  <span>Toplam</span>
                  <span className="text-green-600">{formatCurrency(order.total_amount)}</span>
                </div>
                {order.paid_amount != null && order.paid_amount !== order.total_amount && (
                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-orange-600 font-medium">Alınan (indirimli)</span>
                    <span className="text-orange-600 font-semibold">{formatCurrency(order.paid_amount)}</span>
                  </div>
                )}
                {order.paid_amount != null && order.paid_amount === order.total_amount && (
                  <div className="flex justify-between text-sm mt-1 text-gray-400">
                    <span>Alınan</span>
                    <span>{formatCurrency(order.paid_amount)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Notlar */}
            {order.notes && (
              <div className="mb-5 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <h2 className="text-xs font-medium text-yellow-700 uppercase mb-1">Not</h2>
                <p className="text-gray-700">{order.notes}</p>
              </div>
            )}

            {/* Tarih & Ödeme */}
            <div className="text-sm text-gray-500 space-y-1">
              <p>Oluşturulma: {formatDate(order.created_at)}</p>
              {order.payment_type && (
                <p>
                  Ödeme: {PAYMENT_LABELS[order.payment_type] ?? order.payment_type} —{" "}
                  {order.payment_date ? formatDate(order.payment_date) : ""}
                </p>
              )}
            </div>

            {/* Ödeme Al butonu */}
            {order.status === "BEKLEMEDE" && (
              <button
                onClick={() => {
                  setPaidAmount(String(order.total_amount));
                  setLinePayments(Object.fromEntries(order.services.map((svc) => [svc.line_id, svc.payment_type ?? "Nakit"])));
                  setShowModal(true);
                }}
                className="mt-6 w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-lg transition-colors"
              >
                Ödeme Al & Kapat
              </button>
            )}
      </div>

      {/* Ödeme Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Ödeme Al</h2>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                {error}
              </div>
            )}

            <div className="mb-4 p-3 bg-gray-50 rounded-lg text-sm text-gray-500">
              Sistem fiyatı:{" "}
              <span className="font-semibold text-gray-700">
                {formatCurrency(order.total_amount)}
              </span>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Alınan Tutar (₺)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              {paidAmount && Number(paidAmount) < order.total_amount && (
                <p className="text-xs text-orange-500 mt-1">
                  İndirim: {formatCurrency(order.total_amount - Number(paidAmount))}
                </p>
              )}
            </div>

            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                İşlem Başına Ödeme Tipi
              </label>
              <div className="space-y-2">
                {order.services.map((svc) => (
                  <div
                    key={svc.line_id}
                    className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-gray-200"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{svc.name}</p>
                      <p className="text-xs text-gray-400">{formatCurrency(svc.unit_price)}</p>
                    </div>
                    <PaymentTypeSelect
                      value={linePayments[svc.line_id] ?? "Nakit"}
                      onChange={(val) => setLinePayments((prev) => ({ ...prev, [svc.line_id]: val }))}
                      supplierOptions={supplierOptions}
                      selectClassName="border border-gray-300 rounded-lg px-2 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-green-500 shrink-0"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg hover:bg-gray-50"
              >
                İptal
              </button>
              <button
                onClick={handleClose}
                disabled={closing}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-semibold py-2.5 rounded-lg transition-colors"
              >
                {closing ? "İşleniyor..." : "Onayla"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function OrderDetailPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-gray-400">Yükleniyor...</div>}>
      <OrderDetailPageInner />
    </Suspense>
  );
}
