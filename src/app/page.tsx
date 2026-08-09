"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

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

interface OrderLine {
  service_name: string;
  supplier: string;
  stock_code: string;
  size_desc: string;
  quantity: string;
  unit_price: string;
  cost_price: string;
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
// akışı Ürün sayfasındaki stoğa bağlanır ve sipariş oluşunca stoktan düşülür.
const TIRE_SALE_SERVICE = "Lastik Satışı";

// Bir ürün/parça satışı temsil eden işlemler — bunlarda Tedarikçi varsayılan
// olarak "Servis İşçiliği" gelmez (boş bırakılır, gerçek tedarikçi seçilir) ve
// Stok Kodu alanı gösterilir. Diğer (işçilik) işlemlerde ikisi de gizlenir.
const PRODUCT_SALE_SERVICES = new Set(["Lastik Satışı", "Jant Satışı", "İkinci El Lastik", "İkinci El Jant"]);

// Başlangıç tedarikçi listesi — sunucudan gelen dinamik listeyle (daha önce
// girilmiş tedarikçiler) birleştirilir, böylece hiç sipariş yokken de boş kalmaz.
const TEDARIKCI_SEED = [
  "Servis İşçiliği", "YUKE", "Keskin", "Artvin", "FB Lastik", "Uspa", "Güler",
  "Simetri", "Mollaoğlu", "Karaoğlu", "Yedi Oto", "Jantçı Bülent", "Sel Oto",
  "Mutaflar", "Güncan Veysel", "DRS", "LastikBurada", "Atlastur", "Gizem Oto",
  "İkinci El", "Hankook Fabrika", "Diğer", "Has Ticaret", "Özkan Lastik", "Haskar",
];

const EMPTY_LINE: OrderLine = {
  service_name: "", supplier: "Servis İşçiliği", stock_code: "", size_desc: "",
  quantity: "1", unit_price: "", cost_price: "0", product_id: null, max_stock: null,
  unit_sale_price: null, unit_purchase_price: null,
};

function num(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Ürün sayfasındaki ortalama fiyatlar (numeric) çok haneli ondalık dönebilir
// (ör. "955.5555555555555556") — Tutar/Maliyet alanına doldururken 2 haneye yuvarlanır.
// Tutar/Maliyet, satırın toplamıdır (birim fiyat × Adet) — Kar da bu toplamlar
// üzerinden hesaplanır (bkz. total = Σ unit_price). Bir parti seçildiğinde ya
// da Adet değiştiğinde bu toplam yeniden hesaplanır.
function amountToStr(unitPrice: number | null, qty: number): string {
  if (unitPrice == null) return "";
  return String(Math.round(unitPrice * qty * 100) / 100);
}

function weekYearLabel(week: number | null, year: number | null): string {
  if (week == null || year == null) return "—";
  return `${String(week).padStart(2, "0")}/${String(year).slice(-2)}`;
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
  // Odaklanınca sıfırlanır: alan zaten bir değerle dolu gelse bile (ör. varsayılan
  // "Servis İşçiliği") açılışta tüm liste gösterilir, daraltma sadece yazarken olur.
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
        className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
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

// "Lastik Satışı" satırındaki Stok Kodu hücresi: kod seçilir/yazılır (seçilen
// tedarikçide stoğu olan kodlar önerilir), kod bir partiyle eşleşince altında
// Üretim Haftası/Yılı seçici belirir — seçilen parti product_id + Ebat + o
// partinin mevcut stoğunu (max_stock, sipariş ekranında anlık uyarı için) üst
// bileşene bildirir.
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

export default function OrderPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [lines, setLines] = useState<OrderLine[]>([{ ...EMPTY_LINE }]);
  const [plate, setPlate] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [supplierOptions, setSupplierOptions] = useState<string[]>(TEDARIKCI_SEED);
  const [stockCodesBySupplier, setStockCodesBySupplier] = useState<Record<string, string[]>>({});

  useEffect(() => {
    fetch("/api/services")
      .then((r) => r.json())
      .then(setServices)
      .catch(() => setError("Hizmetler yüklenemedi."));

    fetch("/api/auth/me")
      .then((r) => r.ok ? r.json() : null)
      .then((user) => { if (user?.role === "admin") setIsAdmin(true); })
      .catch(() => { });

    fetch("/api/customers")
      .then((r) => r.json())
      .then((data: Customer[]) => { if (Array.isArray(data)) setCustomers(data); })
      .catch(() => { });

    fetch("/api/suppliers")
      .then((r) => r.json())
      .then((data: Supplier[]) => {
        if (!Array.isArray(data)) return;
        const merged = Array.from(new Set([...TEDARIKCI_SEED, ...data.map((s) => s.name)])).sort((a, b) =>
          a.localeCompare(b, "tr-TR")
        );
        setSupplierOptions(merged);
      })
      .catch(() => { });
  }, []);

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

  // Fiyatı girilmemiş hizmetler otomatik doldurmaz — Tutar elle girilir.
  const priceByName = new Map(
    services.filter((s) => s.price != null).map((s) => [s.name.toLocaleLowerCase("tr-TR"), Number(s.price)])
  );
  const islemOptions = services.map((s) => s.name);
  const customerOptions = customers.map((c) => c.name);
  const phoneByCustomer = new Map(customers.map((c) => [c.name.toLocaleLowerCase("tr-TR"), c.phone]));

  function updateLine(index: number, patch: Partial<OrderLine>) {
    setLines((prev) => prev.map((l, i) => {
      if (i !== index) return l;
      const next = { ...l, ...patch };
      if (patch.service_name !== undefined && patch.service_name !== l.service_name) {
        const trimmed = patch.service_name.trim();
        const match = priceByName.get(trimmed.toLocaleLowerCase("tr-TR"));
        // Yalnızca satırda henüz bir tutar yoksa katalog fiyatı otomatik
        // doldurulur — elle girilmiş bir tutar, İşlem alanında arama yapıp
        // aynı işlemi tekrar seçmekle bile silinmez.
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

  function addLine() {
    setLines((prev) => [...prev, { ...EMPTY_LINE }]);
  }

  function removeLine(index: number) {
    setLines((prev) => prev.length === 1 ? prev : prev.filter((_, i) => i !== index));
  }

  const total = lines.reduce((sum, l) => sum + num(l.unit_price), 0);
  // Ebat sütunu (başlık dahil) yalnızca en az bir "Lastik Satışı" satırı
  // varsa gösterilir — diğer işlemlerde bu bilgi anlamsız.
  const hasTireSaleLine = lines.some((l) => l.service_name.trim() === TIRE_SALE_SERVICE);
  // Stok Kodu sütunu (başlık dahil) yalnızca en az bir ürün/parça satışı
  // (Lastik/Jant/İkinci El) satırı varsa gösterilir — işçilik satırlarında girilmez.
  const hasProductSaleLine = lines.some((l) => PRODUCT_SALE_SERVICES.has(l.service_name.trim()));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!plate.trim()) {
      setError("Araç plakası zorunludur.");
      return;
    }
    const validLines = lines.filter((l) => l.service_name.trim());
    if (validLines.length === 0) {
      setError("En az bir işlem satırı giriniz.");
      return;
    }
    const overStock = validLines.find((l) => l.product_id && l.max_stock != null && Math.round(num(l.quantity)) > l.max_stock);
    if (overStock) {
      setError(`Yetersiz stok: "${overStock.stock_code}" için sadece ${overStock.max_stock} adet mevcut.`);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plate: plate.replace(/\s+/g, "").toUpperCase(),
          customer_name: customerName.trim() || null,
          customer_phone: customerPhone.trim() || null,
          notes: notes.trim() || null,
          lines: validLines.map((l) => ({
            service_name: l.service_name.trim(),
            supplier: l.supplier.trim() || null,
            stock_code: l.stock_code.trim() || null,
            size_desc: l.size_desc.trim() || null,
            quantity: Math.max(1, Math.round(num(l.quantity)) || 1),
            unit_price: num(l.unit_price),
            cost_price: num(l.cost_price),
            product_id: l.product_id,
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Hata oluştu.");
      }

      setSuccess(true);
      setPlate("");
      setCustomerName("");
      setCustomerPhone("");
      setNotes("");
      setLines([{ ...EMPTY_LINE }]);

      setTimeout(() => setSuccess(false), 5000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Hata oluştu.");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/admin/login";
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="w-full">
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Lastik Servis</h1>
              <p className="text-gray-500 text-sm mt-1">Yeni Sipariş Oluştur</p>
            </div>
            {isAdmin && (
              <div className="flex items-center gap-3">
                <a
                  href="/admin/orders"
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
                >
                  Yönetici Paneli
                </a>
                <span className="text-gray-300">|</span>
                <button
                  onClick={handleLogout}
                  className="text-sm text-gray-400 hover:text-gray-700 transition-colors"
                >
                  Çıkış
                </button>
              </div>
            )}
          </div>

          {success && (
            <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 text-center font-medium">
              Sipariş başarıyla kaydedildi!
            </div>
          )}

          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-center">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Araç Plakası <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={plate}
                  onChange={(e) => setPlate(e.target.value.replace(/\s+/g, ""))}
                  placeholder="34 ABC 123"
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-base font-mono uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Müşteri Adı
                </label>
                <SearchableCombobox
                  value={customerName}
                  onChange={(val) => {
                    setCustomerName(val);
                    if (!customerPhone) {
                      const knownPhone = phoneByCustomer.get(val.trim().toLocaleLowerCase("tr-TR"));
                      if (knownPhone) setCustomerPhone(knownPhone);
                    }
                  }}
                  options={customerOptions}
                  placeholder="Müşteri seç veya yaz..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Telefon
                </label>
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="0555 000 00 00"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                İşlem Satırları <span className="text-red-500">*</span>
              </label>
              <div className="border border-gray-200 rounded-lg overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-2 py-2 font-medium text-gray-600 whitespace-nowrap min-w-[160px]">Yapılan İşlem</th>
                      <th className="text-left px-2 py-2 font-medium text-gray-600 whitespace-nowrap min-w-[150px]">Tedarikçi</th>
                      {hasProductSaleLine && <th className="text-left px-2 py-2 font-medium text-gray-600 whitespace-nowrap min-w-[110px]">Stok Kodu</th>}
                      {hasTireSaleLine && <th className="text-left px-2 py-2 font-medium text-gray-600 whitespace-nowrap min-w-[150px]">Ebat</th>}
                      <th className="text-right px-2 py-2 font-medium text-gray-600 whitespace-nowrap w-16">Adet</th>
                      <th className="text-right px-2 py-2 font-medium text-gray-600 whitespace-nowrap w-24">Tutar (₺)</th>
                      <th className="text-right px-2 py-2 font-medium text-gray-600 whitespace-nowrap w-24">Maliyet (₺)</th>
                      <th className="text-right px-2 py-2 font-medium text-gray-600 whitespace-nowrap w-20">Kar (₺)</th>
                      <th className="px-2 py-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {lines.map((line, i) => {
                      const kar = num(line.unit_price) - num(line.cost_price);
                      const isTireSale = line.service_name.trim() === TIRE_SALE_SERVICE;
                      const isProductSale = PRODUCT_SALE_SERVICES.has(line.service_name.trim());
                      const overStock = line.product_id != null && line.max_stock != null && Math.round(num(line.quantity)) > line.max_stock;
                      return (
                        <tr key={i}>
                          <td className="px-2 py-2 align-top">
                            <SearchableCombobox
                              value={line.service_name}
                              onChange={(val) => updateLine(i, { service_name: val })}
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
                                  // ait, artık geçersiz olur.
                                  if (line.product_id != null) {
                                    updateLine(i, { supplier: val, stock_code: "", size_desc: "", product_id: null, max_stock: null, unit_sale_price: null, unit_purchase_price: null });
                                  } else {
                                    updateLine(i, { supplier: val });
                                  }
                                  ensureStockCodes(val);
                                } else {
                                  updateLine(i, { supplier: val });
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
                                  onCodeChange={(val) => updateLine(i, { stock_code: val })}
                                  onBatchSelect={(batch) => {
                                    const qty = Math.max(1, Math.round(num(line.quantity)) || 1);
                                    const salePrice = batch?.avg_sale_price != null ? Number(batch.avg_sale_price) : null;
                                    const purchasePrice = batch?.avg_purchase_price != null ? Number(batch.avg_purchase_price) : null;
                                    updateLine(i, {
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
                                  onChange={(e) => updateLine(i, { stock_code: e.target.value })}
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
                                  onChange={(e) => updateLine(i, { size_desc: e.target.value })}
                                  placeholder="205/60R16"
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
                                  updateLine(i, {
                                    quantity,
                                    unit_price: amountToStr(line.unit_sale_price, qty),
                                    cost_price: amountToStr(line.unit_purchase_price, qty),
                                  });
                                } else {
                                  updateLine(i, { quantity });
                                }
                              }}
                              className={`w-16 border rounded-lg px-2 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500 ${overStock ? "border-red-400" : "border-gray-300"}`}
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
                              onChange={(e) => updateLine(i, { unit_price: e.target.value })}
                              className="w-24 border border-gray-300 rounded-lg px-2 py-2 text-sm text-right font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </td>
                          <td className="px-2 py-2 align-top">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={line.cost_price}
                              onChange={(e) => updateLine(i, { cost_price: e.target.value })}
                              className="w-24 border border-gray-300 rounded-lg px-2 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </td>
                          <td className="px-2 py-2 align-top text-right font-medium text-gray-500 whitespace-nowrap pt-4">
                            {kar.toLocaleString("tr-TR")}
                          </td>
                          <td className="px-2 py-2 align-top text-center pt-4">
                            {lines.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeLine(i)}
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
                onClick={addLine}
                className="mt-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                + Satır Ekle
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notlar
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ek notlar..."
                rows={3}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            <div className="bg-gray-50 rounded-lg p-3 flex justify-between items-center">
              <span className="text-gray-600 font-medium">Toplam Tutar:</span>
              <span className="text-xl font-bold text-green-600">
                {total.toLocaleString("tr-TR")} ₺
              </span>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-3 rounded-lg transition-colors text-lg"
            >
              {loading ? "Kaydediliyor..." : "Sipariş Oluştur"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
