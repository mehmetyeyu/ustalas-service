"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { formatDate, formatCurrency } from "@/lib/format";
import { canGoBackInApp } from "@/lib/navHistory";
import { useViewGuard, usePermission, useAuth } from "../../AuthContext";
import { useToast } from "@/components/ToastProvider";
import { useConfirm } from "@/components/ConfirmProvider";
import { KasaSelect } from "@/components/KasaSelect";
import { MAIL_ORDER_SUFFIX } from "@/lib/paymentTypes";
import { escapeHtml } from "@/lib/htmlEscape";
import { useServices, useCustomers, useSuppliers, useProductSizes, useKasalar, invalidateAfter, useStockCodes } from "@/lib/queries";
import { TRNumberInput } from "@/components/TRNumberInput";
import { weekYearLabel } from "@/lib/weekYear";
import { trIncludes } from "@/lib/trSearch";
import { useDialog } from "@/lib/useDialog";
import { StickyScrollX } from "@/components/StickyScrollX";

interface OrderDetail {
  id: number;
  custom_order_no: string | null;
  custom_order_no_enabled: boolean;
  payment_note: string | null;
  plate: string | null;
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
    brand: string | null;
    model_name: string | null;
    payment_type: string | null;
    product_id: number | null;
    kasa_id: number | null;
  }[];
  payments: {
    id: number;
    payment_type: string;
    amount: number;
    kasa_id: number | null;
  }[];
}

// Sorgu verisi henüz yokken kullanılan sabit boş diziler (render'lar arası aynı referans).
const NO_SERVICES: Service[] = [];
const NO_STRINGS: string[] = [];

interface Service {
  id: number;
  name: string;
  price: number | string | null;
  tracks_size: boolean;
}
interface Customer {
  id: number;
  name: string;
  phone: string | null;
}
const NO_CUSTOMERS: Customer[] = [];
interface EditLine {
  id: number | null;
  service_name: string;
  supplier: string;
  stock_code: string;
  size_desc: string;
  brand: string;
  model_name: string;
  quantity: string;
  unit_price: string;
  cost_price: string;
  payment_type: string;
  kasa_id: number | null;
  // tracks_size işaretli bir hizmette (bkz. Hizmetler ekranı) belirli bir
  // parti seçildiyse doldurulur — o partinin stoğundan Adet kadar düşülür.
  // max_stock, unit_sale_price ve unit_purchase_price sadece istemcide
  // tutulur (API'ye gönderilmez); birim fiyatlar Adet değişince Tutar/
  // Maliyet'i yeniden hesaplamak içindir.
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
  location: string | null;
  brand: string | null;
  model_name: string | null;
  avg_purchase_price: string | number | null;
  avg_sale_price: string | number | null;
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
// Liste Genel Ayarlar'dan gelir (bkz. paymentOptions state) — bu, fetch
// tamamlanana/başarısız olana kadarki varsayılan.
const DEFAULT_PAYMENT_OPTIONS = ["Nakit", "POS", "Cari", "Fatura Edildi.", "Garanti Hesap", "Nazım Hesap", "Sait Hesap", "Mail Order"];

// "Servis İşçiliği" hariç firmaya özel tedarikçi isimleri burada tutulmaz
// (bkz. suppliers tablosu) — bkz. src/app/page.tsx'teki aynı sabit.
const TEDARIKCI_SEED = ["Servis İşçiliği"];

const EMPTY_EDIT_LINE: EditLine = {
  id: null, service_name: "", supplier: "Servis İşçiliği", stock_code: "", size_desc: "",
  brand: "", model_name: "",
  quantity: "1", unit_price: "", cost_price: "0", payment_type: "", kasa_id: null, product_id: null, max_stock: null,
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
    ? options.filter((o) => trIncludes(o, query))
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
        // Escape önce açık öneri listesini kapatır; içinde bulunduğu pencere
        // (useDialog) preventDefault'u görüp kapanmaz — ikinci Escape kapatır.
        onKeyDown={(e) => { if (e.key === "Escape" && open) { e.preventDefault(); setOpen(false); } }}
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

// Ödeme tipi seçici — "Mail Order" seçilince ikinci bir tedarikçi seçici belirir;
// nihai değer "<Tedarikçi> Mail Order" olur. selectClassName ile modal/tablo
// bağlamlarında farklı boyut uygulanabilir.
function PaymentTypeSelect({
  value, onChange, supplierOptions, paymentOptions, selectClassName,
  kasaId, onKasaChange, kasaOptions,
}: {
  value: string;
  onChange: (val: string) => void;
  supplierOptions: string[];
  paymentOptions: string[];
  selectClassName: string;
  kasaId?: number | null;
  onKasaChange?: (kasaId: number | null) => void;
  kasaOptions?: { id: number; name: string }[];
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
        <option value="">Karışık</option>
        {paymentOptions.map((val) => (
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
      {baseValue === "Nakit" && onKasaChange && (
        <KasaSelect
          value={kasaId ?? null}
          onChange={onKasaChange}
          kasaOptions={kasaOptions ?? []}
          className={selectClassName}
        />
      )}
    </div>
  );
}

// tracks_size işaretli bir satırdaki (bkz. Hizmetler ekranı) Stok Kodu
// hücresi: kod seçilir/yazılır (seçilen tedarikçide stoğu olan kodlar
// önerilir), kod bir partiyle eşleşince altında
// Üretim Haftası/Yılı seçici belirir — seçilen parti product_id + Ebat + o
// partinin mevcut stoğunu (max_stock, anlık uyarı için) üst bileşene bildirir.
const NO_CODES: string[] = [];

// Stok Kodu ve Parti, satır ızgarasında İKİ AYRI hücre olarak çizilir
// (fragment döner; hücre/etiket sınıfları çağırandan gelir). Parti seçimi
// eskiden kod kutusunun altına küçük bir listeyle sıkışıyor, satırı
// hizasız uzatıyordu; marka/model ön yazısı da Marka/Model alanlarını
// tekrarlıyordu (seçilince zaten oralara dolar).
function TireBatchPicker({
  supplier, code, productId, onCodeChange, onBatchSelect, cellClassName, labelClassName,
}: {
  supplier: string;
  code: string;
  productId: number | null;
  onCodeChange: (code: string) => void;
  onBatchSelect: (batch: StockBatch | null) => void;
  cellClassName: string;
  labelClassName: string;
}) {
  const [batches, setBatches] = useState<StockBatch[]>([]);
  // Partiler çekilirken boş liste "parti yok" sanılmasın diye.
  const [loadingBatches, setLoadingBatches] = useState(false);
  // 300ms bekleme yalnızca kullanıcı kodu YAZARKEN anlamlı (her tuşta istek
  // atılmasın). Kod zaten dolu açılan satırlarda (Düzelt, Ürünler'den
  // sipariş) açılıştaki koda yapılan çekim beklemeden başlar — Parti alanı
  // geç dolmasın. (Bir "ilk çalışma" bayrağı yerine açılış değeriyle
  // karşılaştırılır: Strict Mode'da efekt iki kez çalışsa da doğru kalır.)
  const initialCodeRef = useRef(code);
  // Tedarikçide stoğu olan kodlar — ortak önbellekten (bkz. useStockCodes);
  // sipariş/ürün kaydında tazelenir, form açık kalsa da eskimez.
  const codeOptions = useStockCodes(supplier).data ?? NO_CODES;

  useEffect(() => {
    if (!supplier.trim() || !code.trim()) {
      setBatches([]);
      setLoadingBatches(false);
      return;
    }
    setLoadingBatches(true);
    const delay = code === initialCodeRef.current ? 0 : 300;
    const t = setTimeout(() => {
      fetch(`/api/products/stock-batches?supplier=${encodeURIComponent(supplier)}&code=${encodeURIComponent(code)}`)
        .then((r) => r.json())
        .then((data: StockBatch[]) => { if (Array.isArray(data)) setBatches(data); })
        .catch(() => setBatches([]))
        .finally(() => setLoadingBatches(false));
    }, delay);
    return () => clearTimeout(t);
  }, [supplier, code]);

  const batchPlaceholder = !code.trim()
    ? "Önce stok kodu seçin"
    : loadingBatches
    ? "Partiler yükleniyor…"
    : batches.length === 0
    ? "Bu kodda parti bulunamadı"
    : "Parti seçin…";

  return (
    <>
      <div className={cellClassName}>
        <label className={labelClassName}>Stok Kodu</label>
        <SearchableCombobox
          value={code}
          onChange={(val) => { onCodeChange(val); onBatchSelect(null); }}
          options={codeOptions}
          placeholder="Ürün kodu..."
        />
      </div>
      <div className={cellClassName}>
        <label className={labelClassName}>Parti (Hafta/Yıl)</label>
        <select
          value={productId ?? ""}
          disabled={batches.length === 0}
          onChange={(e) => {
            const b = batches.find((x) => x.id === Number(e.target.value));
            onBatchSelect(b ?? null);
          }}
          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <option value="">{batchPlaceholder}</option>
          {batches.map((b) => (
            <option key={b.id} value={b.id}>
              {weekYearLabel(b.production_week, b.production_year)} — Stok: {b.stock_qty}{b.location ? ` (${b.location})` : ""}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}

function OrderDetailPageInner() {
  const toast = useToast();
  const confirm = useConfirm();
  const allowed = useViewGuard("orders");
  const canEdit = usePermission("orders.edit");
  const canApprove = usePermission("orders.approve");
  // Genel Ayarlar'daki "Araç Plakası Zorunlu" (bkz. database/schema.sql
  // plate_required notu) — auth.user null iken (ilk render) güvenli
  // varsayılan olarak true (tarihsel davranış).
  const { user: authUser } = useAuth();
  const plateRequired = authUser?.plateRequired ?? true;
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const autoEditApplied = useRef(false);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  // Parçalı ödeme: "Ödeme Al & Kapat" birden fazla (ödeme tipi, tutar) girişi
  // kabul eder (ör. 7.000 POS + 15.000 Garanti Hesap) — tek bir "Alınan
  // Tutar" yerine.
  const [paymentEntries, setPaymentEntries] = useState<{ payment_type: string; amount: string; kasa_id: number | null }[]>([]);
  // Ödeme Notu — ör. "Fatura Edildi" ile kapatırken fatura numarası gibi bir
  // bilgi kaydetmek için (bkz. database/schema.sql orders.payment_note notu).
  // Tamamen opsiyonel; kapatırken boş bırakılırsa hiçbir şey yazılmaz.
  const [paymentNoteInput, setPaymentNoteInput] = useState("");
  const [closing, setClosing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const payDialog = useDialog(() => { if (!closing) setShowModal(false); });

  // Düzenleme
  const [editing, setEditing] = useState(false);
  const [editPlate, setEditPlate] = useState("");
  const [editCustomOrderNo, setEditCustomOrderNo] = useState("");
  const [editPaymentNote, setEditPaymentNote] = useState("");
  const [editCustomerName, setEditCustomerName] = useState("");
  const [editCustomerPhone, setEditCustomerPhone] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editLines, setEditLines] = useState<EditLine[]>([]);
  const [editPayments, setEditPayments] = useState<{ payment_type: string; amount: string; kasa_id: number | null }[]>([]);
  // Bir satıra tek bir ödeme tipi seçilip parçalı ödeme bilinçli sıfırlandığında
  // true olur — kaydederken backend'e "payments: []" gönderilip mevcut parçalı
  // ödeme kayıtlarının silinmesi sağlanır (aksi hâlde payments hiç gönderilmez).
  const [paymentsCleared, setPaymentsCleared] = useState(false);
  // Düzenleme açılırken gelen orijinal parçalı ödeme girişleri — sıfırlama geri
  // alınırsa (bir satır tekrar Karışık'a dönerse) buradan aynen geri yüklenir.
  const [originalEditPayments, setOriginalEditPayments] = useState<{ payment_type: string; amount: string; kasa_id: number | null }[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);
  // Hizmet/müşteri/tedarikçi/ebat/kasa listeleri TanStack önbelleğinden (bkz.
  // src/lib/queries.ts) — liste sayfasından ya da sipariş formundan zaten
  // yüklendiyse detay açılışında tekrar çekilmez; düzenleme/ödeme kaydı
  // sonrası tazelenir.
  const queryClient = useQueryClient();
  const services: Service[] = useServices().data ?? NO_SERVICES;
  // Bir ürün/parça satışı temsil eden işlemler — bunlarda Tedarikçi varsayılan
  // olarak "Servis İşçiliği" gelmez (boş bırakılır, gerçek tedarikçi seçilir),
  // Stok Kodu ve Ebat alanları gösterilir. Diğer (işçilik) işlemlerinde ikisi
  // de gizlenir. Önceden burada sabit, kod içine gömülü bir isim listesi
  // vardı — artık services.tracks_size'a (bkz. Hizmetler ekranı) bakıyor.
  const productSaleServiceNames = new Set(services.filter((s) => s.tracks_size).map((s) => s.name));
  const customers: Customer[] = useCustomers().data ?? NO_CUSTOMERS;
  const suppliersData = useSuppliers().data;
  const supplierOptions = useMemo(
    () => Array.from(new Set([...TEDARIKCI_SEED, ...(suppliersData ?? []).map((s) => s.name)])).sort((a, b) => a.localeCompare(b, "tr-TR")),
    [suppliersData]
  );
  const sizeOptions = useProductSizes().data ?? NO_STRINGS;
  // Genel Ayarlar'daki ödeme tipleri — AuthContext store'undan (bkz. /api/auth/me).
  const paymentOptions = authUser?.paymentTypes.length ? authUser.paymentTypes : DEFAULT_PAYMENT_OPTIONS;
  // Nakit ödeme her zaman TL'dir — döviz kasaları (ör. "Dolar Kasa") bu
  // seçicide hiç görünmez (bkz. plan: "Kasalara Para Birimi Desteği").
  const kasalarData = useKasalar().data;
  const kasaOptions = useMemo(() => (kasalarData ?? []).filter((k) => k.currency === "TRY"), [kasalarData]);

  async function fetchOrder() {
    const res = await fetch(`/api/orders/${id}`);
    if (res.ok) {
      setOrder(await res.json());
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchOrder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const islemOptions = services.map((s) => s.name);
  const customerOptions = customers.map((c) => c.name);
  const priceByName = new Map(
    services.filter((s) => s.price != null).map((s) => [s.name.toLocaleLowerCase("tr-TR"), Number(s.price)])
  );
  const phoneByCustomer = new Map(customers.map((c) => [c.name.toLocaleLowerCase("tr-TR"), c.phone]));

  // İş Emri yazdırma — src/app/admin/storage/page.tsx'teki printLabel ile
  // AYNI desen (HTML string, window.open + document.write + window.print(),
  // hiçbir kütüphane/sunucu round-trip'i yok). Firma bilgisi (adres/telefon/
  // vergi no) sipariş anında değil, YAZDIRMA anında çekilir — /api/company-info
  // rol kısıtı olmadan (bkz. o dosyanın yorumu) herkese açık, ekstra bir
  // yetki kontrolüne gerek yok. logoUrl/stampUrl ayarlanmışsa (Genel
  // Ayarlar > Marka) başlıkta/kaşe kutusunda gösterilir, yoksa eskisi gibi
  // metin/boş kutu.
  async function printWorkOrder() {
    if (!order) return;
    let company: {
      name: string; phone: string | null; taxIdLabel: string; taxId: string | null;
      taxOffice: string | null; address: string | null; logoUrl: string | null; stampUrl: string | null;
    } | null = null;
    try {
      const res = await fetch("/api/company-info");
      if (res.ok) company = await res.json();
    } catch { /* firma bilgisi olmadan da yazdırılabilir, sessizce devam */ }

    const rowsHtml = order.services.map((s) => `
      <tr>
        <td>${escapeHtml(s.name)}</td>
        <td class="c">${s.quantity}</td>
        <td class="r">${formatCurrency(s.unit_price)}</td>
        <td class="r">${formatCurrency(s.unit_price * s.quantity)}</td>
      </tr>`).join("");

    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>İş Emri - ${escapeHtml(order.plate || "Plakasız Satış")}</title>
<style>
  @page { size: A4 portrait; margin: 15mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; color: #222; font-size: 11pt; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 6mm; border-bottom: 2px solid #222; padding-bottom: 8mm; margin-bottom: 8mm; }
  .logo { max-height: 18mm; max-width: 50mm; object-fit: contain; margin-bottom: 3mm; }
  .company h1 { font-size: 16pt; margin: 0 0 2mm; }
  .company div { font-size: 9pt; color: #555; }
  .title { text-align: right; }
  .title h2 { font-size: 20pt; margin: 0; }
  .title div { font-size: 9pt; color: #555; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; margin-bottom: 8mm; font-size: 10pt; }
  .info-grid .lbl { color: #777; font-size: 8.5pt; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8mm; }
  th, td { padding: 3mm 2mm; border-bottom: 1px solid #ddd; text-align: left; font-size: 10pt; }
  th { border-bottom: 2px solid #222; font-size: 9pt; color: #555; text-transform: uppercase; }
  td.c, th.c { text-align: center; }
  td.r, th.r { text-align: right; }
  .total-row td { border-bottom: none; font-weight: bold; font-size: 12pt; padding-top: 4mm; }
  .notes { margin-bottom: 12mm; font-size: 10pt; }
  .notes .lbl { color: #777; font-size: 8.5pt; }
  .footer { display: flex; justify-content: space-between; margin-top: 20mm; }
  .sign-box { width: 60mm; text-align: center; }
  .sign-line { border-top: 1px solid #222; margin-top: 18mm; padding-top: 2mm; font-size: 9pt; color: #555; }
  .sign-line.tight { margin-top: 3mm; }
  .stamp-img { max-height: 16mm; max-width: 50mm; object-fit: contain; margin-top: 6mm; }
</style>
</head><body>
  <div class="header">
    <div class="company">
      ${company?.logoUrl ? `<img class="logo" src="${escapeHtml(company.logoUrl)}" alt="" />` : ""}
      <h1>${escapeHtml(company?.name) || ""}</h1>
      <div>${escapeHtml(company?.address)}</div>
      <div>${company?.phone ? "Tel: " + escapeHtml(company.phone) : ""}${company?.taxOffice ? " · " + escapeHtml(company.taxOffice) : ""}${company?.taxId ? " · " + escapeHtml(company.taxIdLabel) + ": " + escapeHtml(company.taxId) : ""}</div>
    </div>
    <div class="title">
      <h2>İŞ EMRİ</h2>
      <div>Sipariş ${order.custom_order_no ? escapeHtml(order.custom_order_no) : "#" + order.id}</div>
      <div>${formatDate(order.created_at)}</div>
    </div>
  </div>

  <div class="info-grid">
    <div><div class="lbl">Plaka</div>${escapeHtml(order.plate || "—")}</div>
    <div><div class="lbl">Müşteri</div>${escapeHtml(order.customer_name) || "—"}</div>
    <div><div class="lbl">Telefon</div>${escapeHtml(order.customer_phone) || "—"}</div>
    <div><div class="lbl">Durum</div>${order.status === "TAMAMLANDI" ? "Tamamlandı" : "Beklemede"}</div>
  </div>

  <table>
    <thead>
      <tr><th>Hizmet</th><th class="c">Adet</th><th class="r">Birim Fiyat</th><th class="r">Tutar</th></tr>
    </thead>
    <tbody>
      ${rowsHtml}
      <tr class="total-row"><td colspan="3">Toplam</td><td class="r">${formatCurrency(order.total_amount)}</td></tr>
    </tbody>
  </table>

  ${order.notes ? `<div class="notes"><div class="lbl">Not</div>${escapeHtml(order.notes)}</div>` : ""}

  <div class="footer">
    <div class="sign-box">
      ${company?.stampUrl ? `<img class="stamp-img" src="${escapeHtml(company.stampUrl)}" alt="" />` : ""}
      <div class="sign-line${company?.stampUrl ? " tight" : ""}">Firma Kaşesi</div>
    </div>
    <div class="sign-box"><div class="sign-line">Müşteri İmza</div></div>
  </div>

  <script>window.onload=()=>{window.print();}<\/script>
</body></html>`);
    win.document.close();
  }

  function openEdit() {
    if (!order) return;
    setEditPlate(order.plate || "");
    // Bu sipariş ayar KAPALIYKEN oluşturulmuşsa custom_order_no null'dur —
    // ama sonradan ayar açılıp bu siparişi düzenlemeye çalışınca alan boş VE
    // zorunlu gelir, kullanıcı hiçbir şey yazmadan kaydedemez (gerçek bir
    // kullanıcı geri bildirimiyle bulundu). Çıplak id'yi (# İŞARETSİZ) ön
    // dolgu yaparak kullanıcı hiçbir şey değiştirmeden kaydedebilir — elle
    // girilen gerçek numaralarla (ör. "FB-2024-001") aynı temiz formatta
    // kalır, başında yapay bir "#" olmaz. Bunun bedeli: değiştirmeden
    // kaydedilirse görünüm "#id"den "id"ye döner (hash işareti kaybolur) —
    // bilinçli bir tercih. Alan zaten custom_order_no VEYA ayar açık
    // değilse hiç gösterilmiyor (bkz. JSX), o yüzden burada koşulsuz id'ye
    // düşmek güvenli.
    setEditCustomOrderNo(order.custom_order_no || String(order.id));
    setEditPaymentNote(order.payment_note || "");
    setEditCustomerName(order.customer_name || "");
    setEditCustomerPhone(order.customer_phone || "");
    setEditNotes(order.notes || "");
    const initialLines = order.services.map((svc) => ({
      id: svc.line_id,
      service_name: svc.name,
      supplier: svc.supplier || "",
      stock_code: svc.stock_code || "",
      size_desc: svc.size_desc || "",
      brand: svc.brand || "",
      model_name: svc.model_name || "",
      quantity: String(svc.quantity),
      unit_price: String(svc.unit_price),
      cost_price: svc.cost_price != null ? String(svc.cost_price) : "0",
      payment_type: svc.payment_type || "",
      kasa_id: svc.kasa_id ?? null,
      product_id: svc.product_id ?? null,
      max_stock: null,
      unit_sale_price: null,
      unit_purchase_price: null,
    }));
    const initialPayments = order.payments.map((p) => ({ payment_type: p.payment_type, amount: String(p.amount), kasa_id: p.kasa_id ?? null }));
    // Tek satır + tek ödeme + tutar eşleşiyorsa ekran unified moda girer (bkz.
    // useUnifiedEditPayment) ve Ödeme/Kasa seçicisi editPayments[0]'ı gösterir.
    // Satırın kendi payment_type/kasa_id'si ("Ödeme Al & Kapat" hiç yazmaz, ya
    // da geçmişte farklı bir tipteyken sonradan sadece Ödemeler'den değiştirilmiş
    // olabilir) burada gösterileneden farklı kalırsa, dokunulmadan kaydedilse
    // bile order_services sessizce eski tipte kalırdı — ekranla aynı görünsün
    // diye satır burada, yükleme anında, gerçek ödeme kaydıyla hizalanır.
    if (initialLines.length === 1 && initialPayments.length === 1
      && Math.abs((Number(initialLines[0].unit_price) || 0) - (Number(initialPayments[0].amount) || 0)) < 0.01) {
      initialLines[0] = { ...initialLines[0], payment_type: initialPayments[0].payment_type, kasa_id: initialPayments[0].kasa_id };
    }
    setEditLines(initialLines);
    setEditPayments(initialPayments);
    setOriginalEditPayments(initialPayments);
    setPaymentsCleared(false);
    // Zaten bir partiye bağlı satırların (product_id dolu) güncel stok
    // durumunu çeker — bu satırın kendi miktarı zaten o partiden düşülmüş
    // olduğundan, gerçek sınır (max_stock) güncel stok + bu satırın halihazırda
    // tuttuğu miktardır; aksi hâlde Adet artırılınca kırmızı uyarı hiç görünmezdi.
    order.services
      .filter((svc) => svc.product_id != null)
      .forEach((svc) => {
        fetch(`/api/products/${svc.product_id}`)
          .then((r) => r.json())
          .then((data: { stock_qty?: number }) => {
            if (typeof data.stock_qty !== "number") return;
            setEditLines((prev) => prev.map((l) =>
              l.id === svc.line_id ? { ...l, max_stock: data.stock_qty! + svc.quantity } : l
            ));
          })
          .catch(() => { });
      });
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
        if (!productSaleServiceNames.has(trimmed)) { next.size_desc = ""; next.brand = ""; next.model_name = ""; }
        // Ürün/parça satışlarında "Servis İşçiliği" varsayılanı anlamsız —
        // gerçek tedarikçi seçilsin diye boş bırakılır. Diğer işlemlerde geri döner.
        if (productSaleServiceNames.has(trimmed)) {
          if (l.supplier === "Servis İşçiliği") next.supplier = "";
        } else if (!l.supplier.trim()) {
          next.supplier = "Servis İşçiliği";
        }
        if (!productSaleServiceNames.has(trimmed)) next.stock_code = "";
      }
      return next;
    }));
  }

  function addEditPayment() {
    setEditPayments((prev) => [...prev, { payment_type: "Nakit", amount: "", kasa_id: null }]);
  }

  function removeEditPayment(index: number) {
    setEditPayments((prev) => prev.length === 1 ? prev : prev.filter((_, i) => i !== index));
  }

  function updateEditPayment(index: number, patch: Partial<{ payment_type: string; amount: string; kasa_id: number | null }>) {
    setEditPayments((prev) => prev.map((p, i) => i === index ? { ...p, ...patch } : p));
  }

  // Unified görünümde (bkz. useUnifiedEditPayment) Ödeme/Kasa seçicisi hem
  // editPayments[0] hem de editLines[0]'ı aynı anda günceller — sadece
  // editPayments'ı değiştirmek, kaydederken order_services.payment_type'ın
  // (satırdan gönderilen, artık eski) order_payments/orders.payment_type'tan
  // (payments'tan gönderilen, güncel) farklı kalıp sessizce çelişmesine yol
  // açardı (ör. "Cari"den "Nakit"e çevrilen bir satırın listede hâlâ "Cari"
  // görünmesi).
  function updateUnifiedEditPayment(lineIndex: number, patch: Partial<{ payment_type: string; kasa_id: number | null }>) {
    updateEditPayment(0, patch);
    updateEditLine(lineIndex, patch);
  }

  // Tek satır + tek ödeme + tutarlar eşitken (bkz. useUnifiedEditPayment)
  // fiyatı düzeltmek Ödemeler bölümünü de elle güncellemeyi gerektiriyordu —
  // parçalı ödeme yapmayan kullanıcı için anlamsız bir çift giriş (gerçek
  // kullanıcı raporuyla saptandı: tek satırlık bir Cari siparişte fiyatı
  // düzeltince "Sipariş tutarını aşıyor" hatası alıp Kaydet kilitleniyordu).
  // Bu yüzden unified modda fiyat girişi ödeme tutarını da aynı anda
  // günceller — ikisi zaten "aynı tek ödeme" demek, ayrı düşünmenin bir
  // anlamı yok. İkinci bir ödeme eklenip gerçek bir parçalı ödeme
  // başladığında (useUnifiedEditPayment false'a düşer) bu otomatik
  // senkronizasyon devre dışı kalır — o noktadan sonra tutar elle girilir.
  function updateEditLinePrice(index: number, value: string) {
    updateEditLine(index, { unit_price: value });
    if (useUnifiedEditPayment) updateEditPayment(0, { amount: value });
  }

  function addEditLine() {
    setEditLines((prev) => [...prev, { ...EMPTY_EDIT_LINE }]);
  }

  function removeEditLine(index: number) {
    setEditLines((prev) => prev.length === 1 ? prev : prev.filter((_, i) => i !== index));
  }

  // Masaüstü tablosu ve mobil kart görünümü aynı satır mantığını paylaşır.
  function handleEditSupplierChange(index: number, line: EditLine, val: string) {
    if (productSaleServiceNames.has(line.service_name.trim())) {
      // Stok Kodu/Ebat yalnızca gerçek bir stok partisine bağlıysa
      // (product_id doluysa) sıfırlanır — o parti eski tedarikçiye
      // ait, artık geçersiz olur. Excel'den aktarılmış/elle girilmiş
      // (stoğa bağlı olmayan) Ebat, tedarikçi düzeltirken silinmesin.
      if (line.product_id != null) {
        updateEditLine(index, { supplier: val, stock_code: "", size_desc: "", brand: "", model_name: "", product_id: null, max_stock: null, unit_sale_price: null, unit_purchase_price: null });
      } else {
        updateEditLine(index, { supplier: val });
      }
    } else {
      updateEditLine(index, { supplier: val });
    }
  }

  function handleEditQuantityChange(index: number, line: EditLine, quantity: string) {
    if (line.product_id != null && (line.unit_sale_price != null || line.unit_purchase_price != null)) {
      const qty = Math.max(1, Math.round(num(quantity)) || 1);
      updateEditLine(index, {
        quantity,
        unit_price: amountToStr(line.unit_sale_price, qty),
        cost_price: amountToStr(line.unit_purchase_price, qty),
      });
    } else {
      updateEditLine(index, { quantity });
    }
  }

  async function handleEditLinePaymentChange(index: number, line: EditLine, val: string) {
    // Karışık (boş) durumdan tek bir ödeme tipine geçmek, aşağıdaki
    // parçalı ödeme girişleriyle çelişir — bu yüzden önce onaylatılır,
    // onaylanırsa parçalı girişler sıfırlanır.
    if (!line.payment_type && val && editPayments.length > 0) {
      const ok = await confirm(
        "Bu satıra ödeme tipi seçmek, aşağıdaki parçalı ödeme girişlerini sıfırlayacak. Devam edilsin mi?"
      );
      if (!ok) return;
      setEditPayments([]);
      setPaymentsCleared(true);
    } else if (line.payment_type && !val) {
      // Karışık'a dönüldü — parçalı ödeme girişleri henüz boşsa
      // (hiç girilmemiş ya da az önce sıfırlanmış) doldurulabilir
      // hâle getirilir: varsa orijinal (sıfırlama öncesi) değerlerle,
      // yoksa boş bir başlangıç satırıyla.
      if (editPayments.length === 0) {
        setEditPayments(
          originalEditPayments.length > 0
            ? originalEditPayments
            : [{ payment_type: "Nakit", amount: "", kasa_id: null }]
        );
      }
      setPaymentsCleared(false);
    }
    updateEditLine(index, { payment_type: val });
  }

  async function handleSaveEdit() {
    if (order?.custom_order_no_enabled && !editCustomOrderNo.trim()) {
      toast.error("Sipariş numarası zorunludur.");
      return;
    }
    // Genel Ayarlar'dan Plaka zorunlu tutuluyorsa doğrudan Plaka aranır;
    // kapalıysa ikisi BİRDEN boş olmasın yeter (bkz. POST /api/orders'taki
    // aynı kontrol).
    if (plateRequired && !editPlate.trim()) {
      toast.error("Araç plakası zorunludur.");
      return;
    }
    if (!plateRequired && !editPlate.trim() && !editCustomerName.trim()) {
      toast.error("Plaka veya müşteri adından en az biri girilmelidir.");
      return;
    }
    const validLines = editLines.filter((l) => l.service_name.trim());
    if (validLines.length === 0) {
      toast.error("En az bir işlem satırı giriniz.");
      return;
    }
    const overStock = validLines.find((l) => l.product_id && l.max_stock != null && Math.round(num(l.quantity)) > l.max_stock);
    if (overStock) {
      toast.error(`Yetersiz stok: "${overStock.stock_code}" için sadece ${overStock.max_stock} adet mevcut.`);
      return;
    }
    const editTotalAmount = validLines.reduce((sum, l) => sum + num(l.unit_price), 0);
    if (editTotalAmount <= 0) {
      toast.error("Sipariş tutarı 0'dan büyük olmalıdır.");
      return;
    }
    // Ödemeler bölümü yalnızca sipariş daha önce kapatıldıysa gösterilir
    // (bkz. openEdit) — o durumda en az bir geçerli giriş zorunludur.
    const validEditPayments = editPayments.filter((p) => p.payment_type && Number(p.amount) > 0);
    if (editPayments.length > 0) {
      if (validEditPayments.length === 0) {
        toast.error("En az bir ödeme girişi (tip + tutar) giriniz.");
        return;
      }
      const validEditPaymentsTotal = validEditPayments.reduce((sum, p) => sum + Number(p.amount), 0);
      if (validEditPaymentsTotal > editTotalAmount + 0.01) {
        toast.error("Girilen ödeme toplamı sipariş tutarını aşamaz.");
        return;
      }
    }
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/orders/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plate: editPlate.replace(/\s+/g, "").toUpperCase(),
          custom_order_no: (order?.custom_order_no_enabled || order?.custom_order_no) ? editCustomOrderNo.trim() : undefined,
          payment_note: editPaymentNote.trim() || null,
          customer_name: editCustomerName.trim() || null,
          customer_phone: editCustomerPhone.trim() || null,
          notes: editNotes.trim() || null,
          lines: validLines.map((l) => ({
            id: l.id,
            service_name: l.service_name.trim(),
            supplier: l.supplier.trim() || null,
            stock_code: l.stock_code.trim() || null,
            size_desc: l.size_desc.trim() || null,
            brand: l.brand.trim() || null,
            model_name: l.model_name.trim() || null,
            quantity: Math.max(1, Math.round(num(l.quantity)) || 1),
            unit_price: num(l.unit_price),
            cost_price: num(l.cost_price),
            payment_type: l.payment_type || null,
            kasa_id: l.kasa_id,
            product_id: l.product_id,
          })),
          ...(editPayments.length > 0
            ? { payments: validEditPayments.map((p) => ({ payment_type: p.payment_type, amount: Number(p.amount), kasa_id: p.kasa_id })) }
            : paymentsCleared
            ? { payments: [] }
            : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Kaydetme başarısız.");
      }
      setEditing(false);
      invalidateAfter(queryClient, "order");
      await fetchOrder();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Hata oluştu.");
    } finally {
      setSavingEdit(false);
    }
  }

  const paymentEntriesTotal = paymentEntries.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const editPaymentsTotal = editPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const editLinesTotalAmount = editLines.reduce((sum, l) => sum + num(l.unit_price), 0);
  // Cari seçilen kısım kaydedince otomatik olarak müşterinin cari bakiyesine
  // borç olarak yansır (bkz. src/lib/customerLedger.ts) — burada sadece bilgi
  // amaçlı gösteriliyor, yeni bir input alanı yok.
  const cariAmount = paymentEntries.filter((p) => p.payment_type === "Cari").reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  // syncOrderLedger de aynı önceliği kullanır: parçalı ödeme (editPayments)
  // girilmişse sadece o dikkate alınır, yoksa satır bazlı payment_type'a
  // düşülür (bkz. src/lib/customerLedger.ts) — ikisi asla toplanmaz.
  const editCariAmount = editPayments.length > 0
    ? editPayments.filter((p) => p.payment_type === "Cari").reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
    : editLines.filter((l) => l.payment_type === "Cari").reduce((sum, l) => sum + num(l.unit_price), 0);
  // Tek satırlı, tek ödemeli bir sipariş "Ödeme Al & Kapat" ile kapatıldığında
  // satırın kendi payment_type'ı hiç set edilmez (gerçek kayıt sadece
  // order_payments'tadır) — satırda "Karışık" (boş) görünüp altta ayrıca
  // "Ödemeler" bölümü de göstermek kafa karıştırıyordu. Bu durumda satırın
  // Ödeme/Kasa seçicisi doğrudan tek ödeme girişini (editPayments[0]) yansıtır
  // ve düzenler, ayrı "Ödemeler" bölümü (tutar dahil) gizlenir — "+ Başka
  // Ödeme Ekle" ile ikinci bir ödeme eklenince otomatik olarak normal (çok
  // satırlı) görünüme döner. Tutar alanı SADECE ödeme tutarı satır toplamına
  // EŞİTKEN gizlenir (indirim yoksa) — bir indirim varsa (editPaymentsTotal
  // farklıysa) tutar elle görülüp düzeltilebilsin diye otomatik olarak tam
  // "Ödemeler" görünümüne düşülür, hiçbir tutar sessizce ezilmez/gizlenmez.
  const useUnifiedEditPayment = editLines.length === 1 && editPayments.length === 1
    && Math.abs(editPaymentsTotal - editLinesTotalAmount) < 0.01;

  function addPaymentEntry() {
    setPaymentEntries((prev) => [...prev, { payment_type: "Nakit", amount: "", kasa_id: null }]);
  }

  function removePaymentEntry(index: number) {
    setPaymentEntries((prev) => prev.length === 1 ? prev : prev.filter((_, i) => i !== index));
  }

  function updatePaymentEntry(index: number, patch: Partial<{ payment_type: string; amount: string; kasa_id: number | null }>) {
    setPaymentEntries((prev) => prev.map((p, i) => i === index ? { ...p, ...patch } : p));
  }

  async function handleClose() {
    if (!order) return;
    const validEntries = paymentEntries.filter((p) => p.payment_type && Number(p.amount) > 0);
    if (validEntries.length === 0) {
      toast.error("En az bir ödeme girişi (tip + tutar) giriniz.");
      return;
    }
    const validEntriesTotal = validEntries.reduce((sum, p) => sum + Number(p.amount), 0);
    if (validEntriesTotal > order.total_amount + 0.01) {
      toast.error("Girilen ödeme toplamı sipariş tutarını aşamaz.");
      return;
    }
    setClosing(true);
    try {
      const res = await fetch(`/api/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payments: validEntries.map((p) => ({ payment_type: p.payment_type, amount: Number(p.amount), kasa_id: p.kasa_id })),
          payment_note: paymentNoteInput.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "İşlem başarısız.");
      }
      setShowModal(false);
      invalidateAfter(queryClient, "order");
      setPaymentNoteInput("");
      await fetchOrder();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Hata oluştu.");
    } finally {
      setClosing(false);
    }
  }

  // Düzelt'te kaydedilmemiş değişiklik koruması. Ekran artık panel çerçevesi
  // içinde açıldığından (menü görünür) kaydetmeden bir bağlantıya tıklamak
  // değişiklikleri uyarısız siliyordu. Açılış hali (editBaseline) bir kez
  // alınır; yalnızca kullanıcının değiştirebildiği alanlar karşılaştırılır
  // (max_stock gibi açılıştan sonra arka planda gelen bilgiler değil).
  // Tarayıcının geri tuşu App Router'da güvenilir yakalanamıyor — kapsam dışı.
  const editSnapshot = editing
    ? JSON.stringify({
        plate: editPlate, no: editCustomOrderNo, paymentNote: editPaymentNote,
        customer: editCustomerName, phone: editCustomerPhone, notes: editNotes,
        lines: editLines.map((l) => [l.service_name, l.supplier, l.stock_code, l.size_desc, l.brand, l.model_name, l.quantity, l.unit_price, l.cost_price, l.payment_type, l.kasa_id, l.product_id]),
        payments: editPayments.map((p) => [p.payment_type, p.amount, p.kasa_id]),
      })
    : null;
  const [editBaseline, setEditBaseline] = useState<string | null>(null);
  useEffect(() => {
    if (!editing) { setEditBaseline(null); return; }
    // openEdit'teki tüm başlangıç değerleri aynı render'da gelir; ilk
    // görüntü açılış hali olarak alınır.
    setEditBaseline((prev) => prev ?? editSnapshot);
  }, [editing, editSnapshot]);
  const editDirty = editing && editBaseline !== null && editSnapshot !== editBaseline;

  async function confirmDiscardEdit(): Promise<boolean> {
    if (!editDirty) return true;
    return confirm({
      title: "Kaydedilmemiş değişiklikler",
      message: "Bu siparişte yaptığınız değişiklikler kaydedilmedi. Kaydetmeden çıkılsın mı?",
      confirmText: "Kaydetmeden çık",
      cancelText: "Düzenlemeye dön",
      variant: "danger",
    });
  }

  async function closeEditGuarded() {
    if (await confirmDiscardEdit()) setEditing(false);
  }

  // Değişiklik varken: sayfa yenileme/sekme kapatma (tarayıcının kendi
  // uyarısı) ve panel içi bağlantılar (menü, üst çubuk, konum yolu) sorulur.
  // Bağlantı tıklaması capture aşamasında yakalanıp Next Link'e ulaşmadan
  // durdurulur; onaylanırsa aynı adrese programatik olarak gidilir.
  useEffect(() => {
    if (!editDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      e.preventDefault();
      e.stopPropagation();
      void confirmDiscardEdit().then((ok) => {
        if (!ok) return;
        setEditing(false);
        router.push(url.pathname + url.search + url.hash);
      });
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  // confirmDiscardEdit her render'da yeniden oluşur; yalnızca editDirty değişince yeniden bağlanması yeterli.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editDirty]);

  if (loading) {
    return <div className="p-12 text-center text-gray-400">Yükleniyor...</div>;
  }
  if (!order) {
    return <div className="p-12 text-center text-gray-400">Sipariş bulunamadı.</div>;
  }
  if (!allowed) return null;

  if (editing && canEdit) {
    const editKar = editLines.reduce((sum, l) => sum + num(l.unit_price) - num(l.cost_price), 0);
    return (
      // Panel çerçevesinin içinde açılır (sipariş oluşturma formuyla aynı
      // düzen: konum yolu + başlık, altında kart) — eskiden tüm ekranı örten
      // bir katmandı, menü/üst çubuk kayboluyordu.
      <div className="max-w-6xl">
        <header className="mb-6">
          <button
            type="button"
            onClick={() => { void closeEditGuarded(); }}
            className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-v2-fg-subtle hover:text-v2-fg"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="m15 18-6-6 6-6" /></svg>
            Sipariş {order.custom_order_no || `#${order.id}`}
          </button>
          <h1 className="text-2xl font-semibold tracking-tight text-v2-fg [overflow-wrap:anywhere]">Sipariş {order.custom_order_no || `#${order.id}`} — Düzelt</h1>
        </header>
        <div className="flex flex-col gap-6">
            <section aria-labelledby="duzelt-bilgiler" className="rounded-xl border border-v2-line bg-v2-surface shadow-sm p-5">
              <h2 id="duzelt-bilgiler" className="mb-4 text-[15px] font-semibold text-v2-fg">Sipariş Bilgileri</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Araç Plakası {plateRequired
                    ? <span className="text-red-500">*</span>
                    : <span className="text-gray-400 font-normal">(opsiyonel)</span>}
                </label>
                <input
                  type="text"
                  value={editPlate}
                  onChange={(e) => setEditPlate(e.target.value.replace(/\s+/g, ""))}
                  placeholder={plateRequired ? undefined : "Araca bağlı değilse boş bırakın"}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-base font-mono uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {/* Ayar sonradan kapatılmış olsa bile, bu sipariş zaten bir
                  numaraya sahipse alan yine gösterilir — kullanıcı
                  düzeltebilir veya bilerek boşaltıp #id'ye döndürebilir
                  (bkz. PUT /api/orders/[id] notu). Zorunluluk sadece firma
                  ayarı gerçekten açıkken geçerli, o yüzden yıldız da ona bağlı. */}
              {(order.custom_order_no_enabled || order.custom_order_no) && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Sipariş No {order.custom_order_no_enabled && <span className="text-red-500">*</span>}
                  </label>
                  <input
                    type="text"
                    value={editCustomOrderNo}
                    onChange={(e) => setEditCustomOrderNo(e.target.value)}
                    placeholder={order.custom_order_no_enabled ? undefined : "Boş bırakılırsa otomatik #id kullanılır"}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
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
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            </section>

            <section aria-labelledby="duzelt-satirlar" className="rounded-xl border border-v2-line bg-v2-surface shadow-sm">
              <div className="flex items-center justify-between border-b border-v2-line px-5 py-4">
                <h2 id="duzelt-satirlar" className="text-[15px] font-semibold text-v2-fg">
                  İşlem Satırları <span className="text-red-500">*</span>
                </h2>
                <span className="text-[13px] text-v2-fg-muted">{editLines.length} satır</span>
              </div>
              {editLines.map((line, i) => {
                const isProductSale = productSaleServiceNames.has(line.service_name.trim());
                const overStock = line.product_id != null && line.max_stock != null && Math.round(num(line.quantity)) > line.max_stock;
                const name = line.service_name.trim();
                return (
                  <div key={i} className="flex flex-col gap-3.5 border-b border-v2-line px-5 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold uppercase tracking-wider text-v2-fg-muted">
                        Satır {i + 1}{name ? ` · ${name}` : ""}
                      </span>
                      {editLines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeEditLine(i)}
                          aria-label={`Satır ${i + 1}'i sil`}
                          title="Satırı sil"
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-v2-fg-muted hover:bg-v2-danger-bg hover:text-v2-danger-fg"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></svg>
                        </button>
                      )}
                    </div>

                    {/* Tüm alanlar TEK ızgarada ve listede sabit yerlerinde (bkz.
                        src/app/page.tsx satır bloğu notu): ürün satışına özel
                        alanlar koşullu girer, İşlem/Tedarikçi kutuları taşınmaz —
                        yazarken odak kaybolmaz. lg'de 24 sütun: normal işlem tek
                        satır (5+5+2+3+3+6), ürün satışı iki satır (İşlem/
                        Tedarikçi/Stok Kodu/Parti 6×4 / Ebat 3 + Marka 3 + Model 4
                        +2+3+3+6). */}
                    <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-[repeat(24,minmax(0,1fr))]">
                      <div className={isProductSale ? "col-span-2 min-w-0 sm:col-span-1 lg:col-span-6" : "col-span-2 min-w-0 sm:col-span-1 lg:col-span-5"}>
                        <label className="block text-[13px] font-medium text-gray-700 mb-1.5">Yapılan İşlem</label>
                        <SearchableCombobox value={line.service_name} onChange={(val) => updateEditLine(i, { service_name: val })} options={islemOptions} placeholder="İşlem seç veya yaz..." />
                      </div>
                      <div className={isProductSale ? "col-span-2 min-w-0 sm:col-span-1 lg:col-span-6" : "col-span-2 min-w-0 sm:col-span-1 lg:col-span-5"}>
                        <label className="block text-[13px] font-medium text-gray-700 mb-1.5">Tedarikçi</label>
                        <SearchableCombobox value={line.supplier} onChange={(val) => handleEditSupplierChange(i, line, val)} options={supplierOptions} placeholder="Tedarikçi seç veya yaz..." />
                      </div>
                      {isProductSale && (
                        <TireBatchPicker
                          supplier={line.supplier}
                          code={line.stock_code}
                          productId={line.product_id}
                          onCodeChange={(val) => updateEditLine(i, { stock_code: val })}
                          onBatchSelect={(batch) => {
                            const qty = Math.max(1, Math.round(num(line.quantity)) || 1);
                            const salePrice = batch?.avg_sale_price != null ? Number(batch.avg_sale_price) : null;
                            const purchasePrice = batch?.avg_purchase_price != null ? Number(batch.avg_purchase_price) : null;
                            updateEditLine(i, {
                              product_id: batch?.id ?? null,
                              size_desc: batch?.size_desc || line.size_desc,
                              brand: batch?.brand || line.brand,
                              model_name: batch?.model_name || line.model_name,
                              max_stock: batch?.stock_qty ?? null,
                              unit_sale_price: salePrice,
                              unit_purchase_price: purchasePrice,
                              unit_price: batch ? amountToStr(salePrice, qty) : line.unit_price,
                              cost_price: batch ? amountToStr(purchasePrice, qty) : line.cost_price,
                            });
                          }}
  cellClassName="col-span-2 min-w-0 sm:col-span-1 lg:col-span-6"
                          labelClassName="block text-[13px] font-medium text-gray-700 mb-1.5"
                        />
                      )}
                      {isProductSale && (
                        <div className="col-span-2 min-w-0 sm:col-span-1 lg:col-span-3">
                          <label className="block text-[13px] font-medium text-gray-700 mb-1.5">Ebat</label>
                          <SearchableCombobox value={line.size_desc} onChange={(val) => updateEditLine(i, { size_desc: val })} options={sizeOptions} placeholder="205/60R16" />
                        </div>
                      )}
                      {isProductSale && (
                        <div className="col-span-2 min-w-0 sm:col-span-1 lg:col-span-3">
                          <label className="block text-[13px] font-medium text-gray-700 mb-1.5">Marka</label>
                          <input type="text" value={line.brand} onChange={(e) => updateEditLine(i, { brand: e.target.value })} placeholder="Marka" className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                      )}
                      {isProductSale && (
                        <div className="col-span-2 min-w-0 sm:col-span-1 lg:col-span-4">
                          <label className="block text-[13px] font-medium text-gray-700 mb-1.5">Model</label>
                          <input type="text" value={line.model_name} onChange={(e) => updateEditLine(i, { model_name: e.target.value })} placeholder="Model" className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                      )}
                      <div className="lg:col-span-2">
                        {/* Stok sınırı Adet etiketinin yanında rozet — alanın altındaki
                            yazı yalnızca bu satırı uzatıp ızgara hizasını bozuyordu. */}
                        <div className="mb-1.5 flex items-center justify-between gap-1">
                          <label className="block text-[13px] font-medium text-gray-700">Adet</label>
                          {line.product_id != null && line.max_stock != null && (
                            <span
                              title="Seçilebilecek en fazla adet: partide kalan stok + bu satırın zaten ayırdığı adet"
                              className={`whitespace-nowrap rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums ${overStock ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"}`}
                            >
                              Stok {line.max_stock}
                            </span>
                          )}
                        </div>
                        <input
                          type="number"
                          min="1"
                          value={line.quantity}
                          onChange={(e) => handleEditQuantityChange(i, line, e.target.value)}
                          className={`w-full border rounded-lg px-4 py-2.5 text-base text-right focus:outline-none focus:ring-2 focus:ring-blue-500 ${overStock ? "border-red-400" : "border-gray-300"}`}
                        />
                      </div>
                      <div className="lg:col-span-3">
                        <label className="block text-[13px] font-medium text-gray-700 mb-1.5">Tutar (₺)</label>
                        <TRNumberInput value={line.unit_price} onChange={(raw) => updateEditLinePrice(i, raw)} className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 text-right font-semibold" />
                      </div>
                      <div className="lg:col-span-3">
                        <label className="block text-[13px] font-medium text-gray-700 mb-1.5">Maliyet (₺)</label>
                        <TRNumberInput value={line.cost_price} onChange={(raw) => updateEditLine(i, { cost_price: raw })} className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 text-right" />
                      </div>
                      <div className="col-span-2 min-w-0 lg:col-span-6">
                        <label className="block text-[13px] font-medium text-gray-700 mb-1.5">Ödeme</label>
                        <PaymentTypeSelect
                          value={useUnifiedEditPayment ? editPayments[0].payment_type : line.payment_type}
                          onChange={(val) => useUnifiedEditPayment ? updateUnifiedEditPayment(i, { payment_type: val }) : handleEditLinePaymentChange(i, line, val)}
                          supplierOptions={supplierOptions}
                          paymentOptions={paymentOptions}
                          selectClassName="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                          kasaId={useUnifiedEditPayment ? editPayments[0].kasa_id : line.kasa_id}
                          onKasaChange={(kasaId) => useUnifiedEditPayment ? updateUnifiedEditPayment(i, { kasa_id: kasaId }) : updateEditLine(i, { kasa_id: kasaId })}
                          kasaOptions={kasaOptions}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
              <div className="flex flex-col gap-3 p-5">
                <button
                  type="button"
                  onClick={addEditLine}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-v2-line-strong text-sm font-semibold text-v2-link hover:bg-v2-muted"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M12 5v14M5 12h14" /></svg>
                  Satır Ekle
                </button>
                {useUnifiedEditPayment && (
                  <button
                    type="button"
                    onClick={addEditPayment}
                    className="self-start text-sm font-medium text-blue-600 hover:text-blue-800"
                  >
                    + Başka Ödeme Ekle
                  </button>
                )}
              </div>
            </section>

            {editPayments.length > 0 && !useUnifiedEditPayment && (
              <section aria-labelledby="duzelt-odemeler" className="rounded-xl border border-v2-line bg-v2-surface p-5 shadow-sm">
                {/* Ödemeler satıra değil siparişin tamamına ait — satırlarda
                    "Karışık" seçili olanların toplamı bu
                    girişlerle karşılanır (bkz. editCariAmount, syncOrderLedger:
                    giriş varsa yalnız bunlar sayılır). */}
                <div className="mb-4">
                  <h2 id="duzelt-odemeler" className="text-[15px] font-semibold text-v2-fg">Ödemeler — siparişin tamamı</h2>
                  <p className="mt-0.5 text-[13px] text-v2-fg-muted">
                    Siparişteki {editLines.length} satırın toplamı ({formatCurrency(editLinesTotalAmount)}) bu ödemelerle karşılanır.
                  </p>
                </div>
                <div className="max-w-3xl space-y-2">
                  {editPayments.map((entry, i) => (
                    <div key={i} className="grid grid-cols-[minmax(0,1fr)_9rem_2.5rem] items-center gap-2">
                      <PaymentTypeSelect
                        value={entry.payment_type}
                        onChange={(val) => updateEditPayment(i, { payment_type: val })}
                        supplierOptions={supplierOptions}
                        paymentOptions={paymentOptions}
                        selectClassName="flex-1 min-w-0 border border-gray-300 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                        kasaId={entry.kasa_id}
                        onKasaChange={(kasaId) => updateEditPayment(i, { kasa_id: kasaId })}
                        kasaOptions={kasaOptions}
                      />
                      <TRNumberInput
                        placeholder="Tutar"
                        value={entry.amount}
                        onChange={(raw) => updateEditPayment(i, { amount: raw })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base text-right font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      {editPayments.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => removeEditPayment(i)}
                          aria-label={`${i + 1}. ödemeyi sil`}
                          title="Ödemeyi sil"
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-v2-fg-muted hover:bg-v2-danger-bg hover:text-v2-danger-fg"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></svg>
                        </button>
                      ) : <span aria-hidden="true" />}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addEditPayment}
                  className="mt-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  + Ödeme Ekle
                </button>
                {(() => {
                  const remaining = editLinesTotalAmount - editPaymentsTotal;
                  const over = remaining < -0.005;
                  const done = Math.abs(remaining) < 0.005;
                  const pct = editLinesTotalAmount > 0 ? Math.min(100, Math.max(0, (editPaymentsTotal / editLinesTotalAmount) * 100)) : 0;
                  return (
                    <div className={`mt-3 flex flex-col gap-2.5 rounded-lg border p-3.5 text-sm ${over ? "border-v2-danger-fg/40 bg-v2-danger-bg" : done ? "border-v2-line bg-v2-surface-2" : "border-v2-warning-fg/30 bg-v2-surface-2"}`}>
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <span className="text-v2-fg-muted">
                          Girilen <strong className="font-semibold tabular-nums text-v2-fg">{formatCurrency(editPaymentsTotal)}</strong>
                          {" / "}Sipariş toplamı <strong className="font-semibold tabular-nums text-v2-fg">{formatCurrency(editLinesTotalAmount)}</strong>
                        </span>
                        <span className={`font-semibold tabular-nums ${over ? "text-v2-danger-fg" : done ? "text-v2-success-fg" : "text-v2-warning-fg"}`}>
                          {over ? `Fazla ${formatCurrency(-remaining)}` : done ? "Tamamı girildi" : `İndirim ${formatCurrency(remaining)}`}
                        </span>
                      </div>
                      <div role="progressbar" aria-label="Girilen ödeme oranı" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} className="h-1.5 overflow-hidden rounded-full bg-v2-muted">
                        <div className={`h-full rounded-full ${over ? "bg-v2-danger-fg" : done ? "bg-v2-success-fg" : "bg-v2-warning-fg"}`} style={{ width: `${pct}%` }} />
                      </div>
                      {!over && !done && (
                        <p className="text-xs text-v2-fg-muted">
                          Girilen tutar sipariş toplamından az — fark indirim olarak kaydedilir (sipariş detayında “İndirim” görünür).
                        </p>
                      )}
                    </div>
                  );
                })()}
                {editPaymentsTotal > editLinesTotalAmount && (
                  <p className="text-xs text-red-500 mt-1">
                    Sipariş tutarını {formatCurrency(editPaymentsTotal - editLinesTotalAmount)} aşıyor.
                  </p>
                )}
                {editCariAmount > 0 && (
                  <p className="text-xs text-blue-600 mt-1">
                    {formatCurrency(editCariAmount)} tutarı {editCustomerName.trim() || "müşterinin"} cari hesabına borç olarak eklenecek.
                  </p>
                )}
              </section>
            )}

            <section className="rounded-xl border border-v2-line bg-v2-surface shadow-sm grid gap-5 p-5 lg:grid-cols-2">
              <div>
                <label htmlFor="duzelt-notlar" className="mb-2.5 block text-[15px] font-semibold text-v2-fg">Notlar</label>
                <textarea
                  id="duzelt-notlar"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                />
              </div>
              <div>
                <label htmlFor="duzelt-odeme-notu" className="mb-2.5 block text-[15px] font-semibold text-v2-fg">Ödeme Notu</label>
                <textarea
                  id="duzelt-odeme-notu"
                  value={editPaymentNote}
                  onChange={(e) => setEditPaymentNote(e.target.value)}
                  rows={3}
                  placeholder="Örn. fatura numarası"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                />
              </div>
            </section>

            {/* Mobilde iki satır: üstte toplamlar, altta tam genişlik buton(lar) —
                önceden buton yarım genişlikte sola yaslı kalıyordu. */}
            <div className="sticky bottom-3 sm:bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 sm:gap-4 rounded-xl border border-v2-line bg-v2-surface/95 px-4 sm:px-5 py-3 shadow-lg backdrop-blur">
              <div className="flex items-end gap-6 sm:gap-8">
                <div className="flex flex-col">
                  <span className="text-xs text-v2-fg-muted">Toplam Tutar</span>
                  <span className="text-2xl font-bold leading-8 tracking-tight tabular-nums text-v2-fg">{formatCurrency(editLinesTotalAmount)}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-v2-fg-muted">Kâr</span>
                  <span className={`text-xl font-semibold leading-8 tabular-nums ${editKar >= 0 ? "text-v2-success-fg" : "text-v2-danger-fg"}`}>{formatCurrency(editKar)}</span>
                </div>
              </div>
              <div className="flex w-full gap-3 sm:w-auto">
                <button
                  type="button"
                  onClick={() => { void closeEditGuarded(); }}
                  className="h-12 flex-1 sm:flex-none rounded-xl border border-gray-300 px-6 text-[15px] font-medium text-gray-700 hover:bg-gray-50"
                >
                  İptal
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={savingEdit || (editPayments.length > 0 && editPaymentsTotal > editLinesTotalAmount + 0.01)}
                  className="h-12 flex-[2] sm:flex-none rounded-xl bg-blue-600 px-7 text-[15px] font-semibold text-white transition-colors hover:bg-blue-700 disabled:bg-blue-300"
                >
                  {savingEdit ? "Kaydediliyor..." : "Kaydet"}
                </button>
              </div>
            </div>
        </div>
      </div>
    );
  }

  function openPayment() {
    if (!order) return;
    setPaymentEntries([{ payment_type: "Nakit", amount: String(order.total_amount), kasa_id: null }]);
    setShowModal(true);
  }

  return (
    <div className="max-w-6xl">
      <OrderDetailV2
        order={order}
        canEdit={canEdit}
        canApprove={canApprove}
        onPrint={printWorkOrder}
        onEdit={openEdit}
        onPay={openPayment}
      />

      {/* Ödeme Modal */}
      {showModal && (
        <div ref={payDialog} role="dialog" aria-modal="true" aria-label="Ödeme Al" className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Ödeme Al</h2>

            <div className="mb-4 p-3 bg-gray-50 rounded-lg text-sm text-gray-500">
              Sistem fiyatı:{" "}
              <span className="font-semibold text-gray-700">
                {formatCurrency(order.total_amount)}
              </span>
            </div>

            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Ödeme Girişleri <span className="text-red-500">*</span>
              </label>
              <div className="space-y-2">
                {paymentEntries.map((entry, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <PaymentTypeSelect
                      value={entry.payment_type}
                      onChange={(val) => updatePaymentEntry(i, { payment_type: val })}
                      supplierOptions={supplierOptions}
                      paymentOptions={paymentOptions}
                      kasaId={entry.kasa_id}
                      onKasaChange={(kasaId) => updatePaymentEntry(i, { kasa_id: kasaId })}
                      kasaOptions={kasaOptions}
                      selectClassName="flex-1 min-w-0 border border-gray-300 rounded-lg px-2 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                    <TRNumberInput
                      placeholder="Tutar"
                      value={entry.amount}
                      onChange={(raw) => updatePaymentEntry(i, { amount: raw })}
                      className="w-28 border border-gray-300 rounded-lg px-2 py-2 text-sm text-right font-semibold focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                    {paymentEntries.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removePaymentEntry(i)}
                        className="text-red-600 hover:text-red-700 text-xs font-medium shrink-0"
                      >
                        Sil
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addPaymentEntry}
                className="mt-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                + Ödeme Ekle
              </button>

              <div className="mt-3 p-3 bg-gray-50 rounded-lg text-sm flex justify-between">
                <span className="text-gray-500">Girilen Toplam</span>
                <span className={`font-semibold ${paymentEntriesTotal > order.total_amount ? "text-red-600" : "text-gray-800"}`}>
                  {formatCurrency(paymentEntriesTotal)}
                </span>
              </div>
              {paymentEntriesTotal > 0 && paymentEntriesTotal < order.total_amount && (
                <p className="text-xs text-orange-500 mt-1">
                  İndirim: {formatCurrency(order.total_amount - paymentEntriesTotal)}
                </p>
              )}
              {paymentEntriesTotal > order.total_amount && (
                <p className="text-xs text-red-500 mt-1">
                  Sipariş tutarını {formatCurrency(paymentEntriesTotal - order.total_amount)} aşıyor.
                </p>
              )}
              {cariAmount > 0 && (
                <p className="text-xs text-blue-600 mt-1">
                  {formatCurrency(cariAmount)} tutarı {order.customer_name || "müşterinin"} cari hesabına borç olarak eklenecek.
                </p>
              )}
            </div>

            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Ödeme Notu <span className="text-gray-400 font-normal">(opsiyonel)</span>
              </label>
              <textarea
                value={paymentNoteInput}
                onChange={(e) => setPaymentNoteInput(e.target.value)}
                rows={2}
                placeholder="Örn. fatura numarası"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
              />
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
                disabled={closing || paymentEntriesTotal > order.total_amount + 0.01}
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

// Sipariş detayı (eski ve yeni görünümde ortak) — taslaktaki iki sütunlu düzen: solda
// işlem satırları + toplamlar ve notlar, sağda müşteri/araç, ödeme ve
// geçmiş. Sadece mevcut /api/orders/[id] verisini kullanır (ek istek yok);
// Ödeme Al penceresi, İş Emri ve Düzelt eski görünümle ortak.
function OrderDetailV2({ order, canEdit, canApprove, onPrint, onEdit, onPay }: {
  order: OrderDetail;
  canEdit: boolean;
  canApprove: boolean;
  onPrint: () => void;
  onEdit: () => void;
  onPay: () => void;
}) {
  const router = useRouter();
  const done = order.status === "TAMAMLANDI";
  const totalCost = order.services.reduce((sum, s) => sum + Number(s.cost_price || 0), 0);
  const kar = Number(order.total_amount) - totalCost;
  const paymentsSum = order.payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const collected = order.paid_amount != null ? Number(order.paid_amount) : paymentsSum;
  // Eski/içe aktarılmış "Tamamlandı" kayıtlarda ödeme hiç kaydedilmemiş
  // olabilir (paid_amount boş, ödeme kaydı yok) — "₺0 tahsil edildi" gibi
  // yanıltıcı bir tutar yerine bilginin olmadığı söylenir.
  const paymentUnknown = order.paid_amount == null && order.payments.length === 0;
  const discount = done && order.paid_amount != null ? Number(order.total_amount) - Number(order.paid_amount) : 0;
  const collectedPct = order.total_amount > 0 ? Math.min(100, Math.round((collected / Number(order.total_amount)) * 100)) : 0;
  const paymentLabel = order.payment_type ? (PAYMENT_LABELS[order.payment_type] ?? order.payment_type) : null;
  const initials = (order.customer_name || "")
    .split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toLocaleUpperCase("tr-TR")).join("");
  const card = "rounded-xl border border-v2-line bg-v2-surface shadow-sm";
  const btn = "inline-flex h-9 items-center gap-2 rounded-lg border border-v2-line bg-v2-surface px-3.5 text-sm font-medium text-v2-fg hover:bg-v2-muted";
  const orderNo = order.custom_order_no || `#${order.id}`;
  const history = [
    ...(done && order.payment_date
      ? [{ title: `Ödeme alındı ve kapatıldı${paymentLabel ? ` · ${paymentLabel}` : ""}`, at: order.payment_date, tone: "success" as const }]
      : []),
    { title: "Sipariş oluşturuldu", at: order.created_at, tone: "muted" as const },
  ];

  return (
    <>
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {/* Detaya Siparişler dışında Müşteriler, Kasa, Ürünler ve
              Randevular'dan da gelinir — geldiği sayfaya döner. Panel içi
              geçmiş yoksa (yeni sekme/doğrudan link) Siparişler'e gider. */}
          <button
            type="button"
            onClick={() => (canGoBackInApp() ? router.back() : router.push("/admin/orders"))}
            className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-v2-fg-subtle hover:text-v2-fg"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="m15 18-6-6 6-6" /></svg>
            Geri
          </button>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="min-w-0 text-2xl font-semibold tracking-tight text-v2-fg [overflow-wrap:anywhere]">Sipariş {orderNo}</h1>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${done ? "bg-v2-success-bg text-v2-success-fg" : "bg-v2-warning-bg text-v2-warning-fg"}`}>
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
              {done ? "Tamamlandı" : "Beklemede"}
            </span>
            <span className="text-sm text-v2-fg-muted">{formatDate(order.created_at)}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onPrint} className={btn}>İş Emri Yazdır</button>
          <Link prefetch={false} href={`/?copyFrom=${order.id}`} className={btn} title="Aynı müşteri/işlem satırlarıyla, sadece plakayı değiştirerek yeni bir sipariş oluştur">Kopyala</Link>
          {canEdit && <button type="button" onClick={onEdit} className={btn}>Düzelt</button>}
        </div>
      </header>

      {/* grid-cols-1 = minmax(0,1fr): mobilde tek sütun içeriğe göre
          genişlemesin — işlem tablosunun 560px en küçük genişliği aksi
          halde tüm sayfayı ekrandan taşırıyordu (tablo kendi kutusunda kayar). */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          <section aria-labelledby="satirlar" className={card}>
            <div className="flex items-center justify-between border-b border-v2-line px-5 py-4">
              <h2 id="satirlar" className="text-[15px] font-semibold text-v2-fg">İşlem Satırları</h2>
              <span className="text-xs text-v2-fg-muted">{order.services.length} kalem</span>
            </div>
            <StickyScrollX>
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-v2-fg-muted">
                    <th scope="col" className="px-5 py-3">İşlem</th>
                    <th scope="col" className="px-3 py-3">Tedarikçi / Stok</th>
                    <th scope="col" className="px-3 py-3 text-right">Adet</th>
                    <th scope="col" className="px-3 py-3 text-right">Tutar</th>
                    <th scope="col" className="px-5 py-3 text-right">Maliyet</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-v2-line">
                  {order.services.length === 0 && (
                    <tr><td colSpan={5} className="px-5 py-6 text-center text-sm text-v2-fg-muted">Bu siparişte işlem satırı yok.</td></tr>
                  )}
                  {order.services.map((svc) => {
                    const detail = [[svc.brand, svc.model_name].filter(Boolean).join(" "), svc.size_desc].filter(Boolean).join(" · ");
                    return (
                      <tr key={svc.line_id} className="align-top">
                        <td className="px-5 py-3.5">
                          <div className="font-medium text-v2-fg">{svc.name}</div>
                          {detail && <div className="mt-0.5 text-xs text-v2-fg-muted">{detail}</div>}
                          {svc.payment_type && (
                            <span className="mt-1 inline-block rounded-md bg-v2-muted px-1.5 py-0.5 text-[11px] font-medium text-v2-fg-muted">{svc.payment_type}</span>
                          )}
                        </td>
                        <td className="px-3 py-3.5">
                          <div className="text-v2-fg">{svc.supplier || "—"}</div>
                          {svc.stock_code && <div className="mt-0.5 font-v2-mono text-xs text-v2-fg-muted">{svc.stock_code}</div>}
                        </td>
                        <td className="px-3 py-3.5 text-right tabular-nums text-v2-fg">{svc.quantity}</td>
                        <td className="px-3 py-3.5 text-right font-semibold tabular-nums text-v2-fg whitespace-nowrap">{formatCurrency(svc.unit_price)}</td>
                        <td className="px-5 py-3.5 text-right tabular-nums text-v2-fg-muted whitespace-nowrap">{formatCurrency(Number(svc.cost_price || 0))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </StickyScrollX>
            <div className="border-t border-v2-line px-5 py-4">
            <dl className="ml-auto flex max-w-xs flex-col gap-2 text-sm">
              <div className="flex justify-between"><dt className="text-v2-fg-muted">Maliyet</dt><dd className="tabular-nums text-v2-fg">{formatCurrency(totalCost)}</dd></div>
              <div className="flex justify-between"><dt className="text-v2-fg-muted">Kâr</dt><dd className={`font-medium tabular-nums ${kar >= 0 ? "text-v2-success-fg" : "text-v2-danger-fg"}`}>{formatCurrency(kar)}</dd></div>
              <div className="flex justify-between border-t border-v2-line pt-2 text-base"><dt className="font-semibold text-v2-fg">Toplam</dt><dd className="font-semibold tabular-nums text-v2-fg">{formatCurrency(order.total_amount)}</dd></div>
            </dl>
            </div>
          </section>

          {order.notes && (
            <section aria-labelledby="notlar" className={`${card} px-5 py-4`}>
              <h2 id="notlar" className="mb-2 text-[15px] font-semibold text-v2-fg">Notlar</h2>
              <p className="whitespace-pre-line text-sm text-v2-fg-muted [overflow-wrap:anywhere]">{order.notes}</p>
            </section>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <section aria-labelledby="musteri" className={`${card} px-5 py-4`}>
            <h2 id="musteri" className="mb-4 text-[15px] font-semibold text-v2-fg">Müşteri ve Araç</h2>
            {order.customer_name || order.customer_phone ? (
              <div className="mb-4 flex items-center gap-3">
                <div aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-v2-primary-soft text-sm font-semibold text-v2-link">{initials || "?"}</div>
                <div className="min-w-0">
                  <div className="font-medium text-v2-fg [overflow-wrap:anywhere]">{order.customer_name || "İsimsiz müşteri"}</div>
                  {order.customer_phone && <div className="text-sm text-v2-fg-muted">{order.customer_phone}</div>}
                </div>
              </div>
            ) : (
              <p className="mb-4 text-sm text-v2-fg-muted">Müşteri bilgisi girilmemiş.</p>
            )}
            <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm">
              <dt className="text-v2-fg-muted">Plaka</dt>
              <dd className="text-right">
                {order.plate ? (
                  <span className="inline-block rounded-md border border-v2-line-strong bg-v2-surface-2 px-2 py-0.5 font-v2-mono text-[13px] font-medium text-v2-fg">{order.plate}</span>
                ) : <span className="text-v2-fg-muted">Plakasız satış</span>}
              </dd>
            </dl>
          </section>

          <section aria-labelledby="odeme" className={`${card} px-5 py-4`}>
            <div className="mb-4 flex items-center justify-between">
              <h2 id="odeme" className="text-[15px] font-semibold text-v2-fg">Ödeme</h2>
              {paymentLabel && <span className="rounded-md bg-v2-muted px-2 py-0.5 text-xs font-medium text-v2-fg">{paymentLabel}</span>}
            </div>
            {done && paymentUnknown ? (
              <div className="flex flex-col gap-2 text-sm">
                <p className="text-v2-fg-muted">Ödeme bilgisi kaydedilmemiş.</p>
                {order.payment_note && <p className="text-v2-fg-muted [overflow-wrap:anywhere]"><span className="text-v2-fg-subtle">Not:</span> {order.payment_note}</p>}
              </div>
            ) : done ? (
              <div className="flex flex-col gap-2 text-sm">
                <div className="flex justify-between"><span className="text-v2-fg-muted">Tahsil edilen</span><span className="font-semibold tabular-nums text-v2-fg">{formatCurrency(collected)}</span></div>
                <div role="progressbar" aria-label="Tahsilat oranı" aria-valuenow={collectedPct} aria-valuemin={0} aria-valuemax={100} className="h-1.5 overflow-hidden rounded-full bg-v2-muted">
                  <div className="h-full rounded-full bg-v2-success-fg" style={{ width: `${collectedPct}%` }} />
                </div>
                {discount > 0 && (
                  <div className="flex justify-between"><span className="text-v2-fg-muted">İndirim</span><span className="tabular-nums text-v2-warning-fg">{formatCurrency(discount)}</span></div>
                )}
                {order.payments.length > 1 && (
                  <ul className="mt-1 flex flex-col gap-1 border-t border-v2-line pt-2">
                    {order.payments.map((p) => (
                      <li key={p.id} className="flex justify-between text-v2-fg-muted"><span>{p.payment_type}</span><span className="tabular-nums text-v2-fg">{formatCurrency(p.amount)}</span></li>
                    ))}
                  </ul>
                )}
                {order.payment_note && <p className="mt-1 text-v2-fg-muted [overflow-wrap:anywhere]"><span className="text-v2-fg-subtle">Not:</span> {order.payment_note}</p>}
              </div>
            ) : (
              <div className="flex flex-col gap-3 text-sm">
                <div className="flex justify-between"><span className="text-v2-fg-muted">Tahsil edilecek</span><span className="font-semibold tabular-nums text-v2-fg">{formatCurrency(order.total_amount)}</span></div>
                {/* Ödeme Notu bekleyen siparişte de Düzelt'ten girilebiliyor —
                    eski detay ekranı durumdan bağımsız gösteriyordu. */}
                {order.payment_note && <p className="text-v2-fg-muted [overflow-wrap:anywhere]"><span className="text-v2-fg-subtle">Not:</span> {order.payment_note}</p>}
                {canApprove ? (
                  <button type="button" onClick={onPay} className="h-10 w-full rounded-lg bg-v2-primary text-sm font-semibold text-white hover:bg-v2-primary-hover">
                    Ödeme Al & Kapat
                  </button>
                ) : (
                  <p className="text-v2-fg-muted">Ödeme henüz alınmadı.</p>
                )}
              </div>
            )}
          </section>

          <section aria-labelledby="gecmis" className={`${card} px-5 py-4`}>
            <h2 id="gecmis" className="mb-4 text-[15px] font-semibold text-v2-fg">Geçmiş</h2>
            <ol className="flex flex-col gap-4">
              {history.map((h) => (
                <li key={h.title} className="flex gap-3">
                  <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${h.tone === "success" ? "bg-v2-success-fg" : "bg-v2-fg-subtle"}`} />
                  <div className="flex flex-col">
                    <span className="text-sm text-v2-fg">{h.title}</span>
                    <span className="text-xs text-v2-fg-muted">{formatDate(h.at)}</span>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </>
  );
}

export default function OrderDetailPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-gray-400">Yükleniyor...</div>}>
      <OrderDetailPageInner />
    </Suspense>
  );
}
