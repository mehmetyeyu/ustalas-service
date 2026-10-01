"use client";

import { Fragment, useEffect, useState, useRef, type ReactNode } from "react";
import Link from "next/link";
import { formatCurrency } from "@/lib/format";
import { parseProductRows, validateProductRows, chunk, SEASON_OPTIONS, type ParsedProductRow } from "@/lib/productsExcel";
import { PRODUCT_TYPE_OPTIONS, computeCondition, stockLevel, EU_LABEL_CLASSES, EU_NOISE_CLASSES, type ProductType } from "@/lib/productCondition";
import { Tooltip } from "@/components/Tooltip";
import { useViewGuard, usePermission } from "../AuthContext";
import { useToast } from "@/components/ToastProvider";
import { useConfirm } from "@/components/ConfirmProvider";
import { useDebouncedValue } from "@/hooks/useDebounce";

const IMPORT_BATCH_SIZE = 50;

interface ProductBatch {
  id: number;
  code: string;
  barcode: string | null;
  brand: string | null;
  size_desc: string | null;
  season: string | null;
  supplier: string | null;
  location: string | null;
  production_week: number | null;
  production_year: number | null;
  purchase_price: string | number | null;
  avg_purchase_price: string | number | null;
  sale_price: string | number | null;
  avg_sale_price: string | number | null;
  stock_qty: number | null;
  product_type: string | null;
  width_mm: number | null;
  profile_pct: number | null;
  rim_diameter: string | null;
  tread_depth_mm: string | number | null;
  model_name: string | null;
  load_speed_index: string | null;
  eu_fuel_class: string | null;
  eu_wet_grip_class: string | null;
  eu_noise_db: number | null;
  eu_noise_class: number | null;
  rim_size: string | null;
  pcd: string | null;
  offset_et: string | null;
  min_stock_threshold: number | null;
}

interface ProductGroup {
  code: string;
  brand: string | null;
  size_desc: string | null;
  season: string | null;
  barcode: string | null;
  product_type: string | null;
  width_mm: number | null;
  profile_pct: number | null;
  rim_diameter: string | null;
  model_name: string | null;
  load_speed_index: string | null;
  eu_fuel_class: string | null;
  eu_wet_grip_class: string | null;
  eu_noise_db: number | null;
  eu_noise_class: number | null;
  rim_size: string | null;
  pcd: string | null;
  offset_et: string | null;
  min_stock_threshold: number | null;
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

const LOCATION_OPTIONS = ["Mağaza", "Depo"];

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

// Sadece parti (batch) seviyesindeki sütunlar aç/kapa edilebilir VE sıralanabilir
// (Sütunlar menüsünde sürükle-bırak, bkz. moveColumn) — Kod/Marka/Ebat/Toplam
// Stok ürün grubu satırında her zaman en başta, sabit sırada görünür. Her
// sütunun grup (kod) satırında ve parti satırında nasıl render edileceği tek
// bir yerde (group/batch fonksiyonları) tanımlanır — böylece başlık, iskelet,
// grup satırı ve parti satırı hep aynı tanımdan üretilir, 4 ayrı yerde elle
// senkron tutulmaz.
interface BatchColumnDef {
  key: string;
  label: string;
  defaultVisible: boolean;
  // Ürün Kodu/Marka/Ebat/Stok — tablonun ana kimlik sütunları — sürükle-
  // bırakla yeri değiştirilebilir ama Sütunlar menüsünden GİZLENEMEZ
  // (checkbox hiç gösterilmez, bkz. JSX) — yanlışlıkla tabloyu işe yaramaz
  // hale getirme riski olmasın diye kullanıcı isteğiyle böyle karar verildi.
  hideable: boolean;
  align?: "right" | "center";
  headerTitle?: string;
  // Doluysa başlık SortTh (tıklayınca sıralanan) olarak render edilir, boşsa
  // düz <th> — bugüne kadar sadece Kod/Marka/Ebat/Stok sıralanabiliyordu,
  // artık sıralama sütun tanımının bir parçası (istenirse başka sütunlara
  // da eklenebilir).
  sortK?: string;
  // Çoğu satırda "—" gibi kısa bir değer olsa da, bir satırda uzun bir metin
  // (ör. çok kelimeli Model, uzun Ebat) geldiğinde tablo otomatik-genişlik
  // hesabı sütunu dar bırakıp o hücreyi çok satıra böler — bu min-width
  // (whitespace-nowrap ile birlikte) bunu engeller; taşan genişliği zaten
  // sarmalayan overflow-x-auto karşılar.
  minWidth: string;
  skeletonWidth: string;
  // Varsayılan iskelet basit bir çubuktur (skeletonWidth) — Stok gibi farklı
  // bir şekle (yuvarlak rozet) ihtiyaç duyan sütunlar bunu override eder.
  renderSkeleton?: () => ReactNode;
  // group/batch bazı alanlarda (ör. Yük/Hız Endeksi, AB Etiketi, Jant
  // bilgileri) bilinçli olarak null döner — bu alanlar EBADA göre değişebilir,
  // grup satırında tek bir "temsili" değer göstermek yanıltıcı olurdu (bkz.
  // openClone'daki aynı gerekçe). Model ve Min. Stok ise ebattan bağımsız
  // olduğu için grup satırında da gösterilir.
  group: (g: ProductGroup) => ReactNode;
  batch: (b: ProductBatch) => ReactNode;
}

// STATIC_BATCH_COLUMNS: component state'e ihtiyaç duymayan sütunlar — modül
// seviyesinde kalabilir. Ürün Kodu sütunu (aç/kapa oku için expandedCodes/
// toggleExpand'e ihtiyaç duyduğundan) component içinde ayrıca tanımlanıp bu
// listenin BAŞINA eklenir (bkz. aşağıdaki BATCH_COLUMNS = [...]).
const STATIC_BATCH_COLUMNS: BatchColumnDef[] = [
  {
    key: "brand", label: "Marka", defaultVisible: true, hideable: false, sortK: "brand", minWidth: "min-w-[90px]", skeletonWidth: "w-16",
    group: (g) => <span className="text-gray-700">{g.brand || "—"}</span>,
    batch: () => null,
  },
  {
    key: "size_desc", label: "Ebat", defaultVisible: true, hideable: false, sortK: "size_desc", minWidth: "min-w-[150px]", skeletonWidth: "w-24",
    group: (g) => <span className="text-gray-700 whitespace-nowrap">{g.size_desc || "—"}</span>,
    batch: () => null,
  },
  {
    key: "total_stock", label: "Stok", defaultVisible: true, hideable: false, sortK: "total_stock", align: "center", minWidth: "min-w-[70px]", skeletonWidth: "w-10",
    renderSkeleton: () => <div className="h-5 w-10 bg-gray-100 rounded-full animate-pulse mx-auto" />,
    group: (g) => (
      <span className={`inline-block min-w-[2.5rem] px-2 py-1 rounded-full text-sm font-bold ${stockBadgeStyle(g.total_stock, g.min_stock_threshold)}`}>
        {g.total_stock}
      </span>
    ),
    batch: (b) => (
      <span className={`inline-block min-w-[2.5rem] px-2 py-1 rounded-full text-sm font-bold ${stockBadgeStyle(b.stock_qty ?? 0, b.min_stock_threshold)}`}>
        {b.stock_qty ?? 0}
      </span>
    ),
  },
  {
    key: "production_date", label: "Üretim Haftası/Yılı", defaultVisible: true, hideable: true, minWidth: "min-w-[100px]", skeletonWidth: "w-12",
    group: (g) => <span className="text-gray-400 text-xs">{g.batches.length} parti</span>,
    batch: (b) => <span className="text-gray-700 font-mono">{weekYearLabel(b.production_week, b.production_year)}</span>,
  },
  {
    key: "season", label: "Mevsim", defaultVisible: true, hideable: true, minWidth: "min-w-[90px]", skeletonWidth: "w-14",
    group: (g) => seasonBadge(g.season),
    batch: () => null,
  },
  {
    key: "supplier", label: "Tedarikçi", defaultVisible: true, hideable: true, minWidth: "min-w-[120px]", skeletonWidth: "w-16",
    group: () => null,
    batch: (b) => <span className="text-gray-500">{b.supplier ?? "—"}</span>,
  },
  {
    key: "location", label: "Konum", defaultVisible: true, hideable: true, minWidth: "min-w-[90px]", skeletonWidth: "w-14",
    group: () => null,
    batch: (b) => <span className="text-gray-500">{b.location ?? "—"}</span>,
  },
  {
    key: "purchase_price", label: "Alış Maliyeti (Ort.)", defaultVisible: true, hideable: true, align: "right", minWidth: "min-w-[110px]", skeletonWidth: "w-14",
    headerTitle: "Stoktaki tüm girişlerin miktar ağırlıklı ortalaması",
    group: (g) => <span className="text-gray-800 font-medium">{g.avg_purchase_price != null ? formatCurrency(num(g.avg_purchase_price)) : "—"}</span>,
    batch: (b) => <span className="text-gray-700">{formatCurrency(num(b.avg_purchase_price ?? b.purchase_price))}</span>,
  },
  {
    key: "sale_price", label: "Satış Fiyatı (Ort.)", defaultVisible: true, hideable: true, align: "right", minWidth: "min-w-[110px]", skeletonWidth: "w-14",
    headerTitle: "Stoktaki tüm girişlerin miktar ağırlıklı ortalaması",
    group: (g) => <span className="text-gray-800 font-medium">{g.avg_sale_price != null ? formatCurrency(num(g.avg_sale_price)) : "—"}</span>,
    batch: (b) => <span className="text-gray-700 font-medium">{formatCurrency(num(b.avg_sale_price ?? b.sale_price))}</span>,
  },
  {
    key: "product_type", label: "Ürün Tipi", defaultVisible: false, hideable: true, minWidth: "min-w-[90px]", skeletonWidth: "w-16",
    group: (g) => productTypeBadge(g.product_type),
    batch: () => null,
  },
  {
    key: "barcode", label: "Barkod", defaultVisible: false, hideable: true, minWidth: "min-w-[110px]", skeletonWidth: "w-20",
    group: () => null,
    batch: (b) => <span className="text-gray-500 font-mono">{b.barcode ?? "—"}</span>,
  },
  {
    key: "condition", label: "Kondisyon", defaultVisible: false, hideable: true, minWidth: "min-w-[90px]", skeletonWidth: "w-14",
    headerTitle: "Diş Derinliği'nden otomatik hesaplanır",
    group: () => null,
    batch: (b) => conditionBadge(b.tread_depth_mm != null && b.tread_depth_mm !== "" ? computeCondition(Number(b.tread_depth_mm)) : null),
  },
  {
    key: "min_stock", label: "Min. Stok", defaultVisible: false, hideable: true, minWidth: "min-w-[80px]", skeletonWidth: "w-10",
    group: (g) => <span className="text-gray-500">{g.min_stock_threshold ?? "—"}</span>,
    batch: (b) => <span className="text-gray-500">{b.min_stock_threshold ?? "—"}</span>,
  },
  {
    key: "model", label: "Model", defaultVisible: false, hideable: true, minWidth: "min-w-[140px]", skeletonWidth: "w-16",
    group: (g) => <span className="text-gray-500">{g.model_name ?? "—"}</span>,
    batch: (b) => <span className="text-gray-500">{b.model_name ?? "—"}</span>,
  },
  {
    key: "load_speed_index", label: "Yük/Hız Endeksi", defaultVisible: false, hideable: true, minWidth: "min-w-[110px]", skeletonWidth: "w-12",
    group: () => null,
    batch: (b) => <span className="text-gray-500">{b.load_speed_index ?? "—"}</span>,
  },
  {
    key: "eu_fuel_class", label: "Yakıt Sınıfı", defaultVisible: false, hideable: true, minWidth: "min-w-[80px]", skeletonWidth: "w-8",
    group: () => null,
    batch: (b) => <span className="text-gray-500">{b.eu_fuel_class ?? "—"}</span>,
  },
  {
    key: "eu_wet_grip_class", label: "Islak Tutuş", defaultVisible: false, hideable: true, minWidth: "min-w-[80px]", skeletonWidth: "w-8",
    group: () => null,
    batch: (b) => <span className="text-gray-500">{b.eu_wet_grip_class ?? "—"}</span>,
  },
  {
    key: "eu_noise", label: "Gürültü", defaultVisible: false, hideable: true, minWidth: "min-w-[110px]", skeletonWidth: "w-14",
    group: () => null,
    batch: (b) => (
      <span className="text-gray-500">
        {b.eu_noise_db != null ? `${b.eu_noise_db} dB${b.eu_noise_class != null ? ` (Sınıf ${b.eu_noise_class})` : ""}` : "—"}
      </span>
    ),
  },
  {
    key: "rim_size", label: "Jant Ölçüsü", defaultVisible: false, hideable: true, minWidth: "min-w-[100px]", skeletonWidth: "w-14",
    group: () => null,
    batch: (b) => <span className="text-gray-500">{b.rim_size ?? "—"}</span>,
  },
  {
    key: "pcd", label: "PCD", defaultVisible: false, hideable: true, minWidth: "min-w-[80px]", skeletonWidth: "w-14",
    group: () => null,
    batch: (b) => <span className="text-gray-500">{b.pcd ?? "—"}</span>,
  },
  {
    key: "offset_et", label: "ET (Ofset)", defaultVisible: false, hideable: true, minWidth: "min-w-[80px]", skeletonWidth: "w-10",
    group: () => null,
    batch: (b) => <span className="text-gray-500">{b.offset_et ?? "—"}</span>,
  },
];

const SKELETON_ROWS = 8;

const EMPTY_FORM = {
  code: "",
  barcode: "",
  brand: "",
  size_desc: "",
  season: "",
  supplier: "",
  location: "",
  production_week: "",
  production_year: "",
  purchase_price: "",
  markupPercent: "",
  sale_price: "",
  stock_qty: "0",
  product_type: "",
  width_mm: "",
  profile_pct: "",
  rim_diameter: "",
  tread_depth_mm: "",
  model_name: "",
  load_speed_index: "",
  eu_fuel_class: "",
  eu_wet_grip_class: "",
  eu_noise_db: "",
  eu_noise_class: "",
  rim_size: "",
  pcd: "",
  offset_et: "",
  min_stock_threshold: "",
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

// Konum serbest metin (Mağaza/Depo önerilir ama başka değerler de girilebilir)
// — sabit bir renk haritası tutmak yerine değere göre DETERMİNİSTİK bir
// paletten renk seçilir, aynı konum her yerde hep aynı rengi alır.
const LOCATION_BADGE_PALETTE = [
  "bg-sky-100 text-sky-700",
  "bg-purple-100 text-purple-700",
  "bg-teal-100 text-teal-700",
  "bg-rose-100 text-rose-700",
  "bg-lime-100 text-lime-700",
  "bg-orange-100 text-orange-700",
];
function locationBadgeStyle(location: string): string {
  if (location === "Belirtilmemiş") return "bg-gray-100 text-gray-500";
  let hash = 0;
  for (let i = 0; i < location.length; i++) hash = (hash * 31 + location.charCodeAt(i)) >>> 0;
  return LOCATION_BADGE_PALETTE[hash % LOCATION_BADGE_PALETTE.length];
}

// Mağaza Stok / Depo Stok sütunları için — bir ürün kodunun partilerinden
// TAM OLARAK bu konuma sahip olanların stok toplamı. "Şube 2" gibi Mağaza/
// Depo dışında serbest bir konum girilmişse o miktar bu iki sütunda hiç
// görünmez (sadece genel Stok toplamına dahildir) — bkz. Konum sütunu.
function locationQty(batches: ProductBatch[], location: string): number {
  return batches.reduce((sum, b) => sum + (b.location === location ? (b.stock_qty ?? 0) : 0), 0);
}

// "Taşı" hızlı aksiyonu sadece standart Mağaza/Depo ikilisi arasında çalışır
// (bkz. openTransfer) — serbest metin bir konumdan (ör. "Şube 2") taşıma bu
// hızlı yoldan desteklenmez, Düzenle formundan yapılır.
function otherStandardLocation(location: string | null): string | null {
  if (location === "Mağaza") return "Depo";
  if (location === "Depo") return "Mağaza";
  return null;
}

// Mağaza Stok / Depo Stok sütunları arasındaki hızlı ok butonları için — bir
// konumda BİRDEN FAZLA parti varsa (ör. aynı kodun 2 farklı tedarikçiden
// gelen partisi ikisi de Mağaza'da) hangisinden taşınacağı belirsizleşir, bu
// yüzden sadece o konumda TAM OLARAK tek parti varken döner (yoksa null —
// buton hiç gösterilmez, kullanıcı satırı genişletip spesifik partiden taşır).
function singleBatchAtLocation(batches: ProductBatch[], location: string): ProductBatch | null {
  const matches = batches.filter((b) => (b.location ?? "") === location);
  return matches.length === 1 ? matches[0] : null;
}

const PRODUCT_TYPE_BADGE_STYLE: Record<string, string> = {
  "Lastik": "bg-slate-100 text-slate-700",
  "Jant": "bg-purple-100 text-purple-700",
  "İkinci El Lastik": "bg-amber-100 text-amber-700",
  "İkinci El Jant": "bg-amber-100 text-amber-700",
  "Aksesuar": "bg-gray-100 text-gray-600",
};

// Stok rozeti rengi — tükendi (kırmızı) / eşiğin altına düştü (turuncu,
// Faz 2) / stokta var (amber, eski davranış). Eşik tanımlanmamışsa (null)
// "low" hiç dönmez, geriye dönük 2 kademeli davranış korunur.
function stockBadgeStyle(stock: number, minThreshold: number | null): string {
  const level = stockLevel(stock, minThreshold);
  if (level === "out") return "bg-red-100 text-red-600";
  if (level === "low") return "bg-orange-100 text-orange-700";
  return "bg-amber-100 text-amber-800";
}

// Ürün Tipi değişince, artık forma çıkmayan koşullu alanlar (ör. Lastik'ten
// Aksesuar'a geçilince Yük/Hız Endeksi) formda görünmez olsa da state'te
// kalıp Kaydet'te DB'ye yazılmaya devam ediyordu — code review'da bulunan
// bir hata. Bu, hangi alanların temizleneceğine tek bir yerden karar verir.
function clearOrphanedTypeFields(productType: string): Partial<typeof EMPTY_FORM> {
  const isTireType = productType === "Lastik" || productType === "İkinci El Lastik";
  const isRimType = productType === "Jant" || productType === "İkinci El Jant";
  const isUsedTire = productType === "İkinci El Lastik";
  return {
    ...(isUsedTire ? {} : { tread_depth_mm: "" }),
    ...(isTireType ? {} : { load_speed_index: "", eu_fuel_class: "", eu_wet_grip_class: "", eu_noise_db: "", eu_noise_class: "" }),
    ...(isRimType ? {} : { rim_size: "", pcd: "", offset_et: "" }),
  };
}

function productTypeBadge(type: string | null) {
  if (!type) return "—";
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] leading-none font-medium ${PRODUCT_TYPE_BADGE_STYLE[type] ?? "bg-gray-100 text-gray-600"}`}>
      {type}
    </span>
  );
}

function conditionBadge(condition: "Çok İyi" | "İyi" | null) {
  if (!condition) return "—";
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] leading-none font-medium ${condition === "Çok İyi" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
      {condition}
    </span>
  );
}

// Formu doldururken "ürün gerçekte nasıl görünecek" sorusuna anlık cevap —
// kullanıcı isteği: "biraz görsellik katsak, ürünün nasıl görüneceğini
// gösteren bir önizleme gibi". Kaydedilecek veriden TÜRETİLİR, ayrı bir
// state tutmaz — form her değiştiğinde otomatik güncellenir.
function ProductPreviewCard({ f }: { f: typeof EMPTY_FORM }) {
  const hasAnything = f.brand.trim() || f.size_desc.trim() || f.code.trim() || f.product_type.trim();
  if (!hasAnything) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 p-4 text-xs text-gray-400 text-center">
        Doldukça burada görünecek
      </div>
    );
  }

  const condition = f.product_type === "İkinci El Lastik" && f.tread_depth_mm !== ""
    ? computeCondition(Number(f.tread_depth_mm))
    : null;

  return (
    <div className="rounded-xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white p-4">
      <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
        {f.product_type.trim() && productTypeBadge(f.product_type)}
        {f.season.trim() && seasonBadge(f.season)}
        {condition && conditionBadge(condition)}
      </div>
      <div className="text-base font-bold text-gray-800 leading-snug">
        {[[f.brand.trim(), f.model_name.trim()].filter(Boolean).join(" "), f.size_desc.trim()].filter(Boolean).join(" — ") || "Marka / Ebat girilmedi"}
      </div>
      <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
        <div className="flex items-center gap-2 flex-wrap">
          {f.code.trim() && <span className="font-mono">{f.code.trim()}</span>}
          {f.supplier.trim() && <span>· {f.supplier.trim()}</span>}
          {f.location.trim() && <span>· {f.location.trim()}</span>}
        </div>
        {num(f.sale_price) > 0 && (
          <span className="text-sm font-semibold text-gray-800">{formatCurrency(num(f.sale_price))}</span>
        )}
      </div>
    </div>
  );
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
  const toast = useToast();
  const confirm = useConfirm();
  const allowed = useViewGuard("products");
  const canCreate = usePermission("products.create");
  const canEdit = usePermission("products.edit");
  const canDelete = usePermission("products.delete");
  // İşlemler sütunu genişliği görünen buton sayısına göre daralır (parti
  // satırında hep "Fiyat Geçmişi" olduğundan bu sütunu belirleyen hep bu
  // satır tipidir) — aksi halde ör. sadece products.view izni olan bir
  // kullanıcıda sütun gereksiz boş yer kaplardı (özellikle mobilde).
  const productActionCount = 1 + (canCreate ? 1 : 0) + (canEdit ? 1 : 0) + (canDelete ? 1 : 0);
  const PRODUCT_ACTIONS_WIDTH: Record<number, string> = {
    1: "w-[44px] min-w-[44px] max-w-[44px] sm:w-[130px] sm:min-w-[130px] sm:max-w-[130px]",
    2: "w-[70px] min-w-[70px] max-w-[70px] sm:w-[200px] sm:min-w-[200px] sm:max-w-[200px]",
    3: "w-[96px] min-w-[96px] max-w-[96px] sm:w-[260px] sm:min-w-[260px] sm:max-w-[260px]",
    4: "w-[122px] min-w-[122px] max-w-[122px] sm:w-[330px] sm:min-w-[330px] sm:max-w-[330px]",
  };
  const productActionsWidth = PRODUCT_ACTIONS_WIDTH[productActionCount];
  const [items, setItems] = useState<ProductGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  // Hem Ürünler hem Malzeme Hareketleri sekmesinin fetch effect'i aynı
  // debounce'lu değeri kullanır — her tuş vuruşunda sunucuya sorgu atılmasını
  // önlemek için.
  const debouncedSearch = useDebouncedValue(search, 350);
  const [seasonFilter, setSeasonFilter] = useState("");
  const [viewMode, setViewMode] = useState<"products" | "movements">("products");
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [movementsTotal, setMovementsTotal] = useState(0);
  const [movementsPage, setMovementsPage] = useState(1);
  const [movementsLoading, setMovementsLoading] = useState(false);
  const [movementsLimit, setMovementsLimit] = useState(20);
  const [expandedCodes, setExpandedCodes] = useState<Set<string>>(new Set());
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [barcodeChecking, setBarcodeChecking] = useState(false);
  // Kesit/Profil/Jant Çapı bloğu varsayılan kapalı — çoğu kullanıcı doğrudan
  // Ebat'a yazacağından sürekli açık durması gereksiz görsel yoğunluk
  // yaratıyordu. Bu sadece manuel "aç" tıklamasını tutar; alanlardan biri
  // zaten doluysa (Düzenle'de mevcut veri, Kopyala'da taşınan veri) render
  // sırasında ayrıca kontrol edilip otomatik açık gösterilir.
  const [sizeBuilderOpen, setSizeBuilderOpen] = useState(false);
  // Ebat'ın yapılandırılmış alanlardan (Kesit/Profil/Jant Çapı) CANLI
  // olarak yeniden oluşturulmasını, üçü de en az bir kez tam dolduruluncaya
  // kadar ERTELER — aksi hâlde barkoddan/elle gelmiş tam bir Ebat değeri
  // (ör. "225/45R17 XL"), builder'a tek bir karakter yazılır yazılmaz kısmi
  // bir değerle sessizce ezilirdi (gerçek veri kaybı — code review'da 4 ayrı
  // ajanın bağımsız bulduğu hata). Üçü bir kez tam dolunca artık Ebat bu
  // alanların "sahibi" sayılır ve sonraki her tuşta (silme dahil) canlı
  // güncellenir — donma sorunu da böylece çözülmüş olur.
  const [sizeComposedOnce, setSizeComposedOnce] = useState(false);
  const [editItem, setEditItem] = useState<ProductBatch | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [editBarcodeChecking, setEditBarcodeChecking] = useState(false);
  const [editSizeBuilderOpen, setEditSizeBuilderOpen] = useState(false);
  const [editSizeComposedOnce, setEditSizeComposedOnce] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [historyModalProduct, setHistoryModalProduct] = useState<ProductBatch | null>(null);
  // Mağaza ⇄ Depo kısmi stok taşıma — tek partili ürünlerde grup satırından,
  // çok partili ürünlerde genişletilmiş parti satırından tetiklenir (bkz.
  // openTransfer çağrı yerleri). toLocation sabit (butonun kendisi yönü
  // belirtir, ör. "Depo'ya Taşı") — kasıtlı olarak serbest metin değil.
  const [transferBatch, setTransferBatch] = useState<ProductBatch | null>(null);
  const [transferToLocation, setTransferToLocation] = useState("");
  const [transferQty, setTransferQty] = useState("");
  const [transferSaving, setTransferSaving] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<StockEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [editingHistoryEntryId, setEditingHistoryEntryId] = useState<number | null>(null);
  const [historyEditPurchase, setHistoryEditPurchase] = useState("");
  const [historyEditSale, setHistoryEditSale] = useState("");
  const [historyEntrySaving, setHistoryEntrySaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importStage, setImportStage] = useState<"reading" | "uploading" | "">("");
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });

  // Ürün Kodu sütunu, aç/kapa okunun dönüş animasyonu için expandedCodes'a ve
  // tıklama işleyicisi için toggleExpand'e (aşağıda tanımlı — fonksiyon
  // deklarasyonları component gövdesi içinde de hoisted olduğundan, burada
  // henüz "tanımlanmamış" görünse de çağrılabilir) ihtiyaç duyar — bu yüzden
  // STATIC_BATCH_COLUMNS'un aksine modül seviyesinde DEĞİL, component içinde
  // tanımlanır. Diğer 18 sütun component state'ine ihtiyaç duymadığından
  // STATIC_BATCH_COLUMNS'tan (modül seviyesi) aynen alınıp başa eklenir.
  const BATCH_COLUMNS: BatchColumnDef[] = [
    {
      key: "code", label: "Ürün Kodu", defaultVisible: true, hideable: false, sortK: "code", minWidth: "min-w-[130px]", skeletonWidth: "w-16",
      group: (g) => (
        <button onClick={() => toggleExpand(g.code)} className="flex items-center gap-2 font-mono font-semibold text-gray-800 whitespace-nowrap">
          <svg
            className={`w-3.5 h-3.5 text-gray-400 transition-transform ${expandedCodes.has(g.code) ? "rotate-90" : ""}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          {g.code}
        </button>
      ),
      batch: (b) => <span className="pl-10 inline-block text-gray-300 text-xs">#{b.id}</span>,
    },
    // Stok'un hemen ardına eklenir (varsayılan sıradaki eski konumu) — Mağaza
    // Stok/Depo Stok arasındaki ok butonları transferGroup/openTransfer'e
    // ihtiyaç duyduğundan STATIC_BATCH_COLUMNS'ta (modül seviyesi) DEĞİL
    // burada tanımlanır (bkz. "code" sütunundaki aynı gerekçe).
    ...STATIC_BATCH_COLUMNS.slice(0, STATIC_BATCH_COLUMNS.findIndex((c) => c.key === "total_stock") + 1),
    {
      key: "store_stock", label: "Mağaza Stok", defaultVisible: true, hideable: true, align: "center", minWidth: "min-w-[90px]", skeletonWidth: "w-10",
      headerTitle: "Konumu \"Mağaza\" olarak girilen partilerin toplamı",
      group: (g) => {
        const qty = locationQty(g.batches, "Mağaza");
        const magazaBatch = singleBatchAtLocation(g.batches, "Mağaza");
        const depoAmbiguous = g.batches.filter((b) => (b.location ?? "") === "Depo").length > 1;
        const canSend = canEdit && magazaBatch && (magazaBatch.stock_qty ?? 0) > 0 && !depoAmbiguous;
        return (
          <div className="flex items-center justify-center gap-1">
            {qty > 0
              ? <span className={`inline-block min-w-[2rem] px-2 py-0.5 rounded text-xs font-semibold ${locationBadgeStyle("Mağaza")}`}>{qty}</span>
              : <span className="text-gray-300">—</span>}
            {/* Ok her zaman sabit genişlikte bir "slot" kaplar (gösterilmese
                bile) — yoksa varlığı/yokluğu rozeti sağa-sola kaydırıp
                sütunun hiza bozuyordu (kullanıcı bulgusu). */}
            <span className="w-6 h-6 shrink-0">
              {canSend && (
                <button
                  onClick={() => openTransfer(magazaBatch, "Depo")}
                  title="Depo'ya Taşı"
                  aria-label="Depo'ya Taşı"
                  className="text-gray-400 hover:text-blue-600 p-0.5"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </button>
              )}
            </span>
          </div>
        );
      },
      batch: () => null,
    },
    {
      key: "depot_stock", label: "Depo Stok", defaultVisible: true, hideable: true, align: "center", minWidth: "min-w-[90px]", skeletonWidth: "w-10",
      headerTitle: "Konumu \"Depo\" olarak girilen partilerin toplamı",
      group: (g) => {
        const qty = locationQty(g.batches, "Depo");
        const depoBatch = singleBatchAtLocation(g.batches, "Depo");
        const magazaAmbiguous = g.batches.filter((b) => (b.location ?? "") === "Mağaza").length > 1;
        const canSend = canEdit && depoBatch && (depoBatch.stock_qty ?? 0) > 0 && !magazaAmbiguous;
        return (
          <div className="flex items-center justify-center gap-1">
            <span className="w-6 h-6 shrink-0">
              {canSend && (
                <button
                  onClick={() => openTransfer(depoBatch, "Mağaza")}
                  title="Mağaza'ya Taşı"
                  aria-label="Mağaza'ya Taşı"
                  className="text-gray-400 hover:text-blue-600 p-0.5"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5m0 0l5-5m-5 5h12" />
                  </svg>
                </button>
              )}
            </span>
            {qty > 0
              ? <span className={`inline-block min-w-[2rem] px-2 py-0.5 rounded text-xs font-semibold ${locationBadgeStyle("Depo")}`}>{qty}</span>
              : <span className="text-gray-300">—</span>}
          </div>
        );
      },
      batch: () => null,
    },
    ...STATIC_BATCH_COLUMNS.slice(STATIC_BATCH_COLUMNS.findIndex((c) => c.key === "total_stock") + 1),
  ];
  const BATCH_COLUMNS_BY_KEY: Record<string, BatchColumnDef> = Object.fromEntries(
    BATCH_COLUMNS.map((c) => [c.key, c])
  );

  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>(
    () => Object.fromEntries(BATCH_COLUMNS.map((c) => [c.key, c.defaultVisible]))
  );
  // Sütun SIRASI (Sütunlar menüsünde sürükle-bırak) — visibleCols'tan ayrı
  // tutulur çünkü görünürlük bir "hangi anahtarlar true" sözlüğüyken, sıra
  // bir DİZİ (key listesi). Kayıtlı sırada artık var olmayan bir anahtar
  // varsa (ör. bir sütun kaldırılırsa) filtrelenir; BATCH_COLUMNS'a yeni
  // eklenip kayıtlı sırada henüz bulunmayan anahtarlar sona eklenir — bkz.
  // aşağıdaki localStorage yükleme useEffect'i.
  const [colOrder, setColOrder] = useState<string[]>(() => BATCH_COLUMNS.map((c) => c.key));
  const orderedColumns = colOrder.map((k) => BATCH_COLUMNS_BY_KEY[k]).filter((c): c is BatchColumnDef => c != null);
  // Görünür+sıralı sütun listesi TEK sefer hesaplanır (render başına) ve
  // başlık/iskelet/grup satırı/parti satırında aynı referans yeniden
  // kullanılır — her satır için ayrı ayrı filter() çağırmak (N satır × M
  // sütun) gereksiz tekrar iş olurdu, code review'da bulundu.
  const visibleOrderedColumns = orderedColumns.filter((c) => visibleCols[c.key]);

  // Sürükle-bırak CANLI önizleme: colOrder sadece bırakma (drop) anında
  // güncellenir, ama sürükleme SIRASINDA başka bir satırın üzerine gelince
  // liste hemen o hedefe göre yeniden dizilir (bkz. handleColDragOver) — bu
  // sayede kullanıcı bırakacağı yerin nerede açıldığını canlı görür, statik
  // bir listede "nereye bırakacağım belli değil" sorunu (code review'da
  // bulundu) ortadan kalkar. previewOrder null iken menü colOrder'ı gösterir;
  // sürükleme bitince (drop veya iptal) her zaman null'a döner.
  const [dragColKey, setDragColKey] = useState<string | null>(null);
  const [previewColOrder, setPreviewColOrder] = useState<string[] | null>(null);
  const menuColumns = (previewColOrder ?? colOrder)
    .map((k) => BATCH_COLUMNS_BY_KEY[k])
    .filter((c): c is BatchColumnDef => c != null);

  function handleColDragOver(targetKey: string) {
    if (!dragColKey || dragColKey === targetKey) return;
    setPreviewColOrder((prev) => {
      const base = prev ?? colOrder;
      const from = base.indexOf(dragColKey);
      const to = base.indexOf(targetKey);
      if (from === -1 || to === -1 || from === to) return base;
      const next = base.filter((k) => k !== dragColKey);
      next.splice(next.indexOf(targetKey), 0, dragColKey);
      return next;
    });
  }

  function commitColDrag() {
    if (previewColOrder) {
      setColOrder(previewColOrder);
      try { localStorage.setItem("products_col_order_v1", JSON.stringify(previewColOrder)); } catch { }
    }
    setPreviewColOrder(null);
    setDragColKey(null);
  }

  function cancelColDrag() {
    setPreviewColOrder(null);
    setDragColKey(null);
  }

  const [showColPicker, setShowColPicker] = useState(false);
  const [showMobileActions, setShowMobileActions] = useState(false);

  // Sıralama sunucuda yapılır (bkz. /api/products) çünkü liste sayfalanmıştır —
  // yalnızca gruplama sorgusunda doğrudan hesaplanan sütunlar sıralanabilir
  // (Alış/Satış Fiyatı Ort. ayrı bir sorgudan geldiği için tıklanabilir değil).
  const [sortBy, setSortBy] = useState<string | null>("total_stock");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function toggleSort(key: string) {
    if (sortBy === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir("asc");
    }
  }

  function SortTh({ sortK, label, align = "left", minWidth = "" }: { sortK: string; label: string; align?: "left" | "right" | "center"; minWidth?: string }) {
    const active = sortBy === sortK;
    const ALIGN_CLASS = { left: "text-left", right: "text-right", center: "text-center" } as const;
    return (
      <th
        onClick={() => toggleSort(sortK)}
        className={`px-4 py-3 font-medium text-gray-600 whitespace-nowrap cursor-pointer select-none hover:text-gray-900 ${ALIGN_CLASS[align]} ${minWidth}`}
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

  useEffect(() => {
    try {
      const saved = localStorage.getItem("products_visible_cols_v2");
      if (saved) {
        // ÜZERİNE YAZMAK yerine BİRLEŞTİRME: kayıtlı değer bu güncellemeden
        // ÖNCE (Ürün Kodu/Marka/Ebat/Stok henüz BATCH_COLUMNS'a dahil
        // değilken) kaydedilmiş olabilir — o anahtarlar kayıtlı objede hiç
        // yoktur, doğrudan atama yapılsaydı visibleCols[key] undefined
        // (falsy) kalıp bu ana kimlik sütunları YOK OLURDU. Ayrıca
        // hideable:false sütunlar, kayıtlı değerde ne yazarsa yazsın
        // koşulsuz true'ya zorlanır — Sütunlar menüsünde zaten hiç
        // checkbox'ları yok, gizlenmeleri hiçbir zaman istenmez.
        const parsed = JSON.parse(saved);
        setVisibleCols((prev) => {
          const merged = { ...prev, ...parsed };
          for (const c of BATCH_COLUMNS) {
            if (!c.hideable) merged[c.key] = true;
          }
          return merged;
        });
      }
    } catch { }
    try {
      const savedOrder = localStorage.getItem("products_col_order_v1");
      if (savedOrder) {
        const parsed: unknown = JSON.parse(savedOrder);
        if (Array.isArray(parsed)) {
          const allKeys = BATCH_COLUMNS.map((c) => c.key);
          // Set ile tekilleştirme: bozuk/eski bir localStorage içeriğinde aynı
          // anahtar birden fazla kez geçerse, aynı sütun tabloda iki kez
          // render edilip React "duplicate key" uyarısı verirdi.
          const kept = Array.from(new Set(parsed.filter((k): k is string => typeof k === "string" && allKeys.includes(k))));
          const missing = allKeys.filter((k) => !kept.includes(k));
          setColOrder([...kept, ...missing]);
        }
      }
    } catch { }
    // BATCH_COLUMNS her render'da yeniden oluşturulan bir dizi (bkz.
    // yukarıdaki tanım) — bağımlılık olarak eklenirse bu "yalnızca mount'ta
    // çalışsın" efekti her render'da tekrar tetiklenirdi. Sadece anahtar
    // KÜMESİ (üye sayısı/isimleri) önemli, o da uygulama boyunca sabit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (seasonFilter) params.set("season", seasonFilter);
    if (sortBy) { params.set("sortBy", sortBy); params.set("sortDir", sortDir); }
    params.set("page", String(targetPage));
    params.set("limit", String(limit));
    const res = await fetch(`/api/products?${params}`);
    const data = await res.json();
    setItems(data.items ?? []);
    setTotal(data.total ?? 0);
    setLoading(false);
  }

  // Taşıma gibi TEK bir ürün kodunu etkileyen işlemlerden sonra tüm sayfayı
  // (loading=true, iskelet animasyonu, genişletilmiş satırların kapanması)
  // yeniden çekmek yerine sadece o kodu taze sorgulayıp listede yerinde
  // günceller. search ILIKE eşleştirdiğinden (ör. "MICH2" "MICH205"i de
  // bulur) dönen sonuçlar arasından TAM kod eşleşmesi seçilir.
  async function refreshSingleProduct(code: string) {
    const res = await fetch(`/api/products?search=${encodeURIComponent(code)}&limit=500`);
    const data = await res.json();
    const fresh = (data.items ?? []).find((g: ProductGroup) => g.code === code);
    setItems((prev) => {
      if (!fresh) return prev.filter((g) => g.code !== code);
      return prev.some((g) => g.code === code)
        ? prev.map((g) => (g.code === code ? fresh : g))
        : [...prev, fresh];
    });
  }

  useEffect(() => {
    setPage(1);
    fetchItems(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, seasonFilter, sortBy, sortDir, limit]);

  useEffect(() => {
    fetchItems(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  async function fetchMovements(targetPage = movementsPage) {
    setMovementsLoading(true);
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    params.set("page", String(targetPage));
    params.set("limit", String(movementsLimit));
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
  }, [viewMode, debouncedSearch, movementsLimit]);

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

  // Barkod okutulup alandan çıkılınca (Enter/Tab, okuyucular genelde bunu
  // simüle eder) bu firmanın DAHA ÖNCE aynı barkodla kaydettiği bir ürün
  // varsa Marka/Ebat/Mevsim/Tedarikçi otomatik doldurulur — sadece kullanıcı
  // henüz o alanları elle doldurmadıysa (zaten yazılmış bir değerin üzerine
  // sessizce yazılmaz). Fiyat/stok/konum KASITLI olarak doldurulmaz, bunlar
  // her partide yeniden girilir (bkz. /api/products/barcode notu).
  async function handleBarcodeLookup(setter: typeof setForm, current: typeof EMPTY_FORM, setChecking: (v: boolean) => void) {
    const barcode = current.barcode.trim();
    if (!barcode) return;
    setChecking(true);
    try {
      const res = await fetch(`/api/products/barcode?barcode=${encodeURIComponent(barcode)}`);
      const data = await res.json();
      if (!data.found) return;
      setter((prev) => ({
        ...prev,
        code: prev.code.trim() ? prev.code : data.code ?? prev.code,
        brand: prev.brand.trim() ? prev.brand : data.brand ?? prev.brand,
        size_desc: prev.size_desc.trim() ? prev.size_desc : data.size_desc ?? prev.size_desc,
        season: prev.season.trim() ? prev.season : data.season ?? prev.season,
        supplier: prev.supplier.trim() ? prev.supplier : data.supplier ?? prev.supplier,
        product_type: prev.product_type.trim() ? prev.product_type : data.product_type ?? prev.product_type,
        width_mm: prev.width_mm.trim() ? prev.width_mm : data.width_mm != null ? String(data.width_mm) : prev.width_mm,
        profile_pct: prev.profile_pct.trim() ? prev.profile_pct : data.profile_pct != null ? String(data.profile_pct) : prev.profile_pct,
        rim_diameter: prev.rim_diameter.trim() ? prev.rim_diameter : data.rim_diameter ?? prev.rim_diameter,
        model_name: prev.model_name.trim() ? prev.model_name : data.model_name ?? prev.model_name,
        load_speed_index: prev.load_speed_index.trim() ? prev.load_speed_index : data.load_speed_index ?? prev.load_speed_index,
        eu_fuel_class: prev.eu_fuel_class.trim() ? prev.eu_fuel_class : data.eu_fuel_class ?? prev.eu_fuel_class,
        eu_wet_grip_class: prev.eu_wet_grip_class.trim() ? prev.eu_wet_grip_class : data.eu_wet_grip_class ?? prev.eu_wet_grip_class,
        eu_noise_db: prev.eu_noise_db.trim() ? prev.eu_noise_db : data.eu_noise_db != null ? String(data.eu_noise_db) : prev.eu_noise_db,
        eu_noise_class: prev.eu_noise_class.trim() ? prev.eu_noise_class : data.eu_noise_class != null ? String(data.eu_noise_class) : prev.eu_noise_class,
        rim_size: prev.rim_size.trim() ? prev.rim_size : data.rim_size ?? prev.rim_size,
        pcd: prev.pcd.trim() ? prev.pcd : data.pcd ?? prev.pcd,
        offset_et: prev.offset_et.trim() ? prev.offset_et : data.offset_et ?? prev.offset_et,
        min_stock_threshold: prev.min_stock_threshold.trim() ? prev.min_stock_threshold : data.min_stock_threshold != null ? String(data.min_stock_threshold) : prev.min_stock_threshold,
      }));
      toast.success("Barkod eşleşti, bilinen bilgiler dolduruldu.");
    } catch {
      // sessizce yoksay — barkod alanı yine de elle girilmiş değeriyle kalır
    } finally {
      setChecking(false);
    }
  }

  function buildPayload(f: typeof EMPTY_FORM) {
    return {
      code: f.code.trim(),
      barcode: f.barcode.trim() || null,
      brand: f.brand.trim() || null,
      size_desc: f.size_desc.trim() || null,
      season: f.season.trim() || null,
      supplier: f.supplier.trim() || null,
      location: f.location.trim() || null,
      production_week: f.production_week === "" ? null : Number(f.production_week),
      production_year: f.production_year === "" ? null : Number(f.production_year),
      purchase_price: f.purchase_price === "" ? null : Number(f.purchase_price),
      sale_price: f.sale_price === "" ? null : Number(f.sale_price),
      stock_qty: Number(f.stock_qty) || 0,
      product_type: f.product_type.trim() || null,
      width_mm: f.width_mm === "" ? null : Number(f.width_mm),
      profile_pct: f.profile_pct === "" ? null : Number(f.profile_pct),
      rim_diameter: f.rim_diameter.trim() || null,
      tread_depth_mm: f.tread_depth_mm === "" ? null : Number(f.tread_depth_mm),
      model_name: f.model_name.trim() || null,
      load_speed_index: f.load_speed_index.trim() || null,
      eu_fuel_class: f.eu_fuel_class.trim() || null,
      eu_wet_grip_class: f.eu_wet_grip_class.trim() || null,
      eu_noise_db: f.eu_noise_db === "" ? null : Number(f.eu_noise_db),
      eu_noise_class: f.eu_noise_class === "" ? null : Number(f.eu_noise_class),
      rim_size: f.rim_size.trim() || null,
      pcd: f.pcd.trim() || null,
      offset_et: f.offset_et.trim() || null,
      min_stock_threshold: f.min_stock_threshold === "" ? null : Number(f.min_stock_threshold),
    };
  }

  // Ebat'ı (size_desc) üç yapılandırılmış alana (Kesit Genişliği, Profil,
  // Jant Çapı) bölme taslağı — size_desc'in YERİNE değil, YANINA (bkz. plan,
  // 23 dosyada kullanıldığından TEK yetkili görüntüleme/arama alanı olarak
  // kalıyor). Üçü de doluysa Ebat alanını otomatik "205 / 55 / R16"
  // biçiminde oluşturup doldurur — kullanıcı isterse yine elle düzeltebilir,
  // sessizce bir daha ezilmez (sadece bu üç alan değiştiğinde tetiklenir).
  function handleStructuredSizeChange(
    setter: typeof setForm,
    current: typeof EMPTY_FORM,
    patch: Partial<Pick<typeof EMPTY_FORM, "width_mm" | "profile_pct" | "rim_diameter">>,
    composedOnce: boolean,
    setComposedOnce: (v: boolean) => void
  ) {
    const next = { ...current, ...patch };
    const allThreeFilled = !!(next.width_mm.trim() && next.profile_pct.trim() && next.rim_diameter.trim());
    if (allThreeFilled) setComposedOnce(true);
    // Üçü daha önce bir kez tam dolmadıysa (composedOnce=false) VE şu an da
    // tam değilse, Ebat'a dokunulmaz — barkoddan/elle gelmiş tam bir Ebat
    // değerinin, builder'a atılan ilk (tek) karakterle sessizce ezilmesini
    // önler. Üçü bir kez tam dolduktan SONRA (composedOnce=true) artık Ebat
    // bu alanların sahibi sayılır — her tuşta (silme dahil) canlı güncellenir,
    // aksi hâlde biri boşalınca Ebat'ın güncellenmeyi durdurduğu (donduğu)
    // eski hata geri gelir.
    if (!composedOnce && !allThreeFilled) {
      setter((prev) => ({ ...prev, ...patch }));
      return;
    }
    const composed = [next.width_mm.trim(), next.profile_pct.trim(), next.rim_diameter.trim()]
      .filter(Boolean)
      .join(" / ");
    setter((prev) => ({ ...prev, ...patch, size_desc: composed }));
  }

  async function handleSave() {
    if (!form.code.trim()) {
      toast.error("Ürün kodu zorunludur.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(form)),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "Hata oluştu.");
        return;
      }
      setShowAddModal(false);
      setForm(EMPTY_FORM);
      await fetchItems(page);
    } finally {
      setSaving(false);
    }
  }

  // "Stok Girişi" — var olan bir kod için yeni parti eklerken (openClone'un
  // aksine) kod SABİT kalır, ama müşteri isteğiyle (bkz. bu değişikliğin
  // commit mesajı) diğer tüm alanlar da boş gelmek yerine o kodun EN SON
  // partisinden (group.batches sırası production_year/week'e göre artan,
  // bkz. /api/products route'u — son eleman en güncel parti) dolduruluyor:
  // bir ürün kodu zaten tek bir "tip" ürünü temsil eder, her stok girişinde
  // Marka/Model/Mevsim/Tedarikçi vb.'yi yeniden yazmaya gerek yok.
  // Yeni (hiç partisi olmayan) bir kod için çağrılınca (lastBatch yok)
  // davranış eskisi gibi tamamen boş kalır.
  function openAdd(prefillCode?: string, lastBatch?: ProductBatch | null, groupThreshold: number | null = null) {
    setForm({
      ...EMPTY_FORM,
      code: prefillCode ?? "",
      brand: lastBatch?.brand ?? "",
      size_desc: lastBatch?.size_desc ?? "",
      season: lastBatch?.season ?? "",
      supplier: lastBatch?.supplier ?? "",
      location: lastBatch?.location ?? "",
      purchase_price: lastBatch?.purchase_price != null ? String(num(lastBatch.purchase_price)) : "",
      sale_price: lastBatch?.sale_price != null ? String(num(lastBatch.sale_price)) : "",
      product_type: lastBatch?.product_type ?? "",
      width_mm: lastBatch?.width_mm != null ? String(lastBatch.width_mm) : "",
      profile_pct: lastBatch?.profile_pct != null ? String(lastBatch.profile_pct) : "",
      rim_diameter: lastBatch?.rim_diameter ?? "",
      model_name: lastBatch?.model_name ?? "",
      min_stock_threshold: groupThreshold != null ? String(groupThreshold) : "",
    });
    setSizeBuilderOpen(false);
    setSizeComposedOnce(!!(lastBatch?.width_mm && lastBatch?.profile_pct && lastBatch?.rim_diameter));
    setShowAddModal(true);
  }

  // "Benzer Üründen Kopyala" — aynı model, farklı ebat gibi çok benzer bir
  // ürün eklerken her alanı sıfırdan yazmak yerine mevcut bir partiden
  // başlanır (bkz. plan, rakip POS/envanter yazılımlarında yaygın "Duplicate
  // Product" kalıbı). Kod/Barkod/Üretim Haftası-Yılı/Stok KASITLI olarak
  // KOPYALANMAZ — bunlar partiye özgüdür, aynen kopyalanırsa kullanıcı fark
  // etmeden aynı barkod/kodu iki kez kaydedebilir. Fiyatlar kopyalanır (çoğu
  // zaman yakın bir başlangıç noktasıdır), kullanıcı isterse düzeltir.
  //
  // Yük/Hız Endeksi, AB Lastik Etiketi (Yakıt/Islak Tutuş/Gürültü) ve Jant
  // Ölçüsü/PCD/ET de KASITLI kopyalanmaz — tread_depth_mm gibi bunlar da
  // EBADA göre değişir (aynı "model" farklı ebatta farklı yük endeksine,
  // farklı gürültü değerine, farklı PCD/ET'ye sahip olabilir); code review'da
  // bulundu — eski Ebat'ın değerlerini yeni ebada aynen taşımak yanlış veri
  // üretirdi. Model/Ürün Hattı ve Minimum Stok Eşiği ise ebattan bağımsız
  // (kod/politika düzeyinde) oldukları için kopyalanmaya devam eder.
  function openClone(batch: ProductBatch, groupThreshold: number | null = batch.min_stock_threshold) {
    setForm({
      ...EMPTY_FORM,
      brand: batch.brand ?? "",
      size_desc: batch.size_desc ?? "",
      season: batch.season ?? "",
      supplier: batch.supplier ?? "",
      location: batch.location ?? "",
      purchase_price: batch.purchase_price != null ? String(num(batch.purchase_price)) : "",
      sale_price: batch.sale_price != null ? String(num(batch.sale_price)) : "",
      product_type: batch.product_type ?? "",
      width_mm: batch.width_mm != null ? String(batch.width_mm) : "",
      profile_pct: batch.profile_pct != null ? String(batch.profile_pct) : "",
      rim_diameter: batch.rim_diameter ?? "",
      model_name: batch.model_name ?? "",
      // Kodun GRUP (aggregate) eşiği kullanılır, tıklanan partinin kendi
      // ham sütun değeri DEĞİL — bir partinin kendi değeri null olabilir
      // (ör. eşiksiz eklenmiş yeni bir parti, bkz. POST route'taki
      // syncMinStockThreshold null-guard'ı) ve o zaman gerçek politika
      // değerini yanlışlıkla boşaltırdı.
      min_stock_threshold: groupThreshold != null ? String(groupThreshold) : "",
      // tread_depth_mm, load_speed_index, eu_fuel_class, eu_wet_grip_class,
      // eu_noise_db, eu_noise_class, rim_size, pcd, offset_et KASITLI
      // kopyalanmaz — yukarıdaki nota bkz.
    });
    setSizeBuilderOpen(false);
    setSizeComposedOnce(!!(batch.width_mm && batch.profile_pct && batch.rim_diameter));
    setShowAddModal(true);
    toast.success("Bilgiler kopyalandı — Ürün Kodu'nu (ve varsa Barkod'u) girip kaydedin.");
  }

  // Mağaza ⇄ Depo taşıma — hedef, tıklanan butonun kendisiyle sabitlenir
  // (bkz. yukarıdaki transferToLocation notu).
  function openTransfer(batch: ProductBatch, toLocation: string) {
    setTransferBatch(batch);
    setTransferToLocation(toLocation);
    setTransferQty("");
  }

  async function submitTransfer() {
    if (!transferBatch) return;
    const qty = Number(transferQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error("Geçerli bir miktar girin.");
      return;
    }
    if (qty > (transferBatch.stock_qty ?? 0)) {
      toast.error(`Yetersiz stok — mevcut: ${transferBatch.stock_qty ?? 0}.`);
      return;
    }
    setTransferSaving(true);
    try {
      const res = await fetch(`/api/products/${transferBatch.id}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: qty, to_location: transferToLocation }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Taşıma başarısız.");
      toast.success(`${qty} adet ${transferToLocation}'ya taşındı.`);
      const code = transferBatch.code;
      setTransferBatch(null);
      await refreshSingleProduct(code);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Hata oluştu.");
    } finally {
      setTransferSaving(false);
    }
  }

  function openEdit(item: ProductBatch, groupThreshold: number | null = item.min_stock_threshold) {
    setEditItem(item);
    setEditSizeBuilderOpen(false);
    setEditSizeComposedOnce(!!(item.width_mm && item.profile_pct && item.rim_diameter));
    setEditForm({
      ...EMPTY_FORM,
      code: item.code ?? "",
      barcode: item.barcode ?? "",
      brand: item.brand ?? "",
      size_desc: item.size_desc ?? "",
      season: item.season ?? "",
      supplier: item.supplier ?? "",
      location: item.location ?? "",
      production_week: item.production_week != null ? String(item.production_week) : "",
      production_year: item.production_year != null ? String(item.production_year) : "",
      purchase_price: item.purchase_price != null ? String(num(item.purchase_price)) : "",
      markupPercent: "",
      sale_price: item.sale_price != null ? String(num(item.sale_price)) : "",
      stock_qty: String(item.stock_qty ?? 0),
      product_type: item.product_type ?? "",
      width_mm: item.width_mm != null ? String(item.width_mm) : "",
      profile_pct: item.profile_pct != null ? String(item.profile_pct) : "",
      rim_diameter: item.rim_diameter ?? "",
      tread_depth_mm: item.tread_depth_mm != null ? String(num(item.tread_depth_mm)) : "",
      model_name: item.model_name ?? "",
      load_speed_index: item.load_speed_index ?? "",
      eu_fuel_class: item.eu_fuel_class ?? "",
      eu_wet_grip_class: item.eu_wet_grip_class ?? "",
      eu_noise_db: item.eu_noise_db != null ? String(item.eu_noise_db) : "",
      eu_noise_class: item.eu_noise_class != null ? String(item.eu_noise_class) : "",
      rim_size: item.rim_size ?? "",
      pcd: item.pcd ?? "",
      offset_et: item.offset_et ?? "",
      // Kodun GRUP eşiği kullanılır (openClone'daki aynı gerekçeyle) — bu
      // partinin kendi ham sütun değeri null olabilir ("eşiksiz eklenmiş
      // yeni bir parti"), o zaman diğer partilerdeki gerçek eşiği Düzenle
      // formunda yokmuş gibi göstermek, dokunulmamış bir alanın kaydedilince
      // TÜM partileri sessizce sıfırlamasına yol açardı.
      min_stock_threshold: groupThreshold != null ? String(groupThreshold) : "",
    });
  }

  async function handleUpdate() {
    if (!editItem) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/products/${editItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(editForm)),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Hata oluştu.");
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
    setEditingHistoryEntryId(null);
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/products/${item.id}/history`);
      const data = await res.json();
      setHistoryEntries(data.items ?? []);
    } finally {
      setHistoryLoading(false);
    }
  }

  function startEditHistoryEntry(entry: StockEntry) {
    setEditingHistoryEntryId(entry.id);
    setHistoryEditPurchase(entry.purchase_price != null ? String(entry.purchase_price) : "");
    setHistoryEditSale(entry.sale_price != null ? String(entry.sale_price) : "");
  }

  // "Stok Girişi" sırasında birim fiyat yerine yanlışlıkla toplam tutar
  // girilmiş bir kaydı sonradan düzeltebilmek için — sadece bu geçmiş
  // satırının fiyatını değiştirir, ürünün güncel fiyatına dokunmaz (bkz.
  // src/app/api/products/[id]/history/[entryId]/route.ts).
  async function handleSaveHistoryEntry(entryId: number) {
    if (!historyModalProduct) return;
    setHistoryEntrySaving(true);
    try {
      const res = await fetch(`/api/products/${historyModalProduct.id}/history/${entryId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purchase_price: historyEditPurchase.trim() ? Number(historyEditPurchase) : null,
          sale_price: historyEditSale.trim() ? Number(historyEditSale) : null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Kaydetme başarısız.");
      setHistoryEntries((prev) => prev.map((e) => e.id === entryId
        ? { ...e, purchase_price: historyEditPurchase.trim() ? Number(historyEditPurchase) : null, sale_price: historyEditSale.trim() ? Number(historyEditSale) : null }
        : e));
      setEditingHistoryEntryId(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Hata oluştu.");
    } finally {
      setHistoryEntrySaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!(await confirm({ message: "Bu partiyi silmek istediğinize emin misiniz?\nPartiye ait tüm stok girişi / fiyat geçmişi de kalıcı olarak silinecek.", confirmText: "Sil", variant: "danger" }))) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/products/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Parti silinemedi.");
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
        toast.error(err instanceof Error ? err.message : "Dosya okunamadı.");
        return;
      }

      if (parsed.rows.length === 0) {
        toast.error("Aktarılacak ürün bulunamadı.");
        return;
      }

      // Excel'in kendisine açılır liste/doğrulama koyamadığımızdan (bkz.
      // src/lib/productsExcel.ts validateProductRows notu), yükleme
      // BAŞLAMADAN önce burada gösterilir — kullanıcı ya kaynak dosyayı
      // düzeltip yeniden seçer ya da bilerek "yine de devam et" der.
      const warnings = validateProductRows(parsed.rows);
      if (warnings.length > 0) {
        const preview = warnings.slice(0, 8)
          .map((w) => `Satır ${w.row} (${w.code}): ${w.message}`)
          .join("\n");
        const more = warnings.length > 8 ? `\n...ve ${warnings.length - 8} satır daha.` : "";
        const proceed = await confirm({
          title: "Tanınmayan değerler bulundu",
          message: `${preview}${more}\n\nBu satırlar yine de girdiğiniz değerle kaydedilecek. Devam edilsin mi, yoksa dosyayı düzeltip tekrar mı deneyeceksiniz?`,
          confirmText: "Yine de Devam Et",
          cancelText: "Vazgeç, Dosyayı Düzelteyim",
          variant: "danger",
        });
        if (!proceed) return;
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
          toast.error(
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

      toast.success(
        `${imported} parti içe aktarıldı.` +
        (skipped ? ` ${skipped} satır ürün kodu olmadığı için atlandı.` : "")
      );
      setPage(1);
      await fetchItems(1);
    } catch {
      toast.error("Dosya işlenirken hata oluştu.");
    } finally {
      setImporting(false);
      setImportStage("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // 4 sabit sütun (Ürün Kodu/Marka/Ebat/Stok) + görünür parti sütunları + işlemler.
  const visibleColCount = BATCH_COLUMNS.filter((c) => visibleCols[c.key]).length + 1;

  // Ürün Tipi'ne göre koşullu alan görünürlüğü (bkz. plan) — Jant/İkinci El
  // Jant/Aksesuar'da Mevsim+Üretim Haftası/Yılı (lastiğe özel) anlamsız;
  // sadece İkinci El Lastik'te Diş Derinliği/Kondisyon gösterilir. Boş/NULL
  // product_type için bugünkü davranış (hep Mevsim/Üretim görünür, Diş
  // Derinliği hiç görünmez) korunur.
  const hideSeasonProduction = form.product_type === "Jant" || form.product_type === "İkinci El Jant" || form.product_type === "Aksesuar";
  const isUsedTire = form.product_type === "İkinci El Lastik";
  const editHideSeasonProduction = editForm.product_type === "Jant" || editForm.product_type === "İkinci El Jant" || editForm.product_type === "Aksesuar";
  const editIsUsedTire = editForm.product_type === "İkinci El Lastik";
  // Faz 2 (Model, Yük/Hız Endeksi, AB Lastik Etiketi, Jant Ölçü/PCD/ET) —
  // isUsedTire gibi tek bir değere değil, İkinci El dahil HER İKİ lastik/jant
  // varyantına bağlı olduğundan ayrı bir bayrak (bkz. plan).
  const isTireType = form.product_type === "Lastik" || form.product_type === "İkinci El Lastik";
  const isRimType = form.product_type === "Jant" || form.product_type === "İkinci El Jant";
  const editIsTireType = editForm.product_type === "Lastik" || editForm.product_type === "İkinci El Lastik";
  const editIsRimType = editForm.product_type === "Jant" || editForm.product_type === "İkinci El Jant";

  if (!allowed) return null;

  return (
    <div onClick={() => { setShowColPicker(false); setShowMobileActions(false); }}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Ürün Kataloğu</h1>
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
            <button
              onClick={() => { window.location.href = "/api/products/import/template"; }}
              className="shrink-0 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-50 flex items-center gap-1 whitespace-nowrap"
            >
              Şablon İndir
              <Tooltip text="Sadece Ürün Kodu zorunludur, diğer sütunlar isteğe bağlıdır.">
                <span className="text-gray-400 hover:text-gray-600 cursor-help">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
                  </svg>
                </span>
              </Tooltip>
            </button>
            <button
              onClick={() => { window.location.href = "/api/products/export"; }}
              className="shrink-0 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 whitespace-nowrap"
            >
              Dışa Aktar
            </button>
            {canCreate && (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                className="shrink-0 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 whitespace-nowrap"
              >
                {importing ? "İçe Aktarılıyor..." : "İçeri Aktar"}
              </button>
            )}
            {canCreate && (
              <button
                onClick={() => openAdd()}
                className="shrink-0 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium whitespace-nowrap"
              >
                + Yeni Ürün
              </button>
            )}
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
                <button
                  onClick={() => { setShowMobileActions(false); window.location.href = "/api/products/import/template"; }}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Şablon İndir
                </button>
                <button
                  onClick={() => { setShowMobileActions(false); window.location.href = "/api/products/export"; }}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Dışa Aktar
                </button>
                {canCreate && (
                  <button
                    onClick={() => { setShowMobileActions(false); fileInputRef.current?.click(); }}
                    disabled={importing}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {importing ? "İçe Aktarılıyor..." : "İçeri Aktar"}
                  </button>
                )}
                {canCreate && (
                  <button
                    onClick={() => { setShowMobileActions(false); openAdd(); }}
                    className="w-full text-left px-4 py-2.5 text-sm font-medium text-blue-600 hover:bg-blue-50"
                  >
                    + Yeni Ürün
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

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
      <div className="bg-white rounded-xl shadow-sm p-4 mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={viewMode === "products" ? "Ürün kodu, marka, ebat veya tedarikçi ara..." : "Ürün kodu, marka, ebat, tedarikçi, müşteri veya plaka ara..."}
          className="w-full sm:w-72 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {viewMode === "products" && (
          <div className="flex items-center gap-3">
            <select
              value={seasonFilter}
              onChange={(e) => setSeasonFilter(e.target.value)}
              className="flex-1 min-w-0 sm:flex-none border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Tüm Mevsimler</option>
              {SEASON_OPTIONS.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
            <div className="relative shrink-0">
              <button
                onClick={(e) => { e.stopPropagation(); setShowColPicker((v) => !v); }}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 flex items-center gap-2 whitespace-nowrap"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
                </svg>
                Sütunlar
              </button>
              {showColPicker && (
                <div className="absolute right-0 top-10 z-30 bg-white border border-gray-200 rounded-xl shadow-lg p-3 w-56" onClick={(e) => e.stopPropagation()}>
                  <p className="text-xs text-gray-400 px-2 mb-1">Sütunlar — sürükleyerek sırala</p>
                  {menuColumns.map((col) => (
                    <div
                      key={col.key}
                      draggable
                      onDragStart={() => setDragColKey(col.key)}
                      onDragOver={(e) => { e.preventDefault(); handleColDragOver(col.key); }}
                      onDrop={commitColDrag}
                      onDragEnd={cancelColDrag}
                      className={`group flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-gray-50 cursor-grab active:cursor-grabbing ${dragColKey === col.key ? "opacity-40" : ""}`}
                    >
                      <svg className="w-3.5 h-3.5 text-gray-400 group-hover:text-gray-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M7 4a1 1 0 11-2 0 1 1 0 012 0zM7 10a1 1 0 11-2 0 1 1 0 012 0zM7 16a1 1 0 11-2 0 1 1 0 012 0zM15 4a1 1 0 11-2 0 1 1 0 012 0zM15 10a1 1 0 11-2 0 1 1 0 012 0zM15 16a1 1 0 11-2 0 1 1 0 012 0z" />
                      </svg>
                      {col.hideable ? (
                        <label className="flex items-center gap-2 flex-1 cursor-pointer text-sm text-gray-700 select-none">
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
                      ) : (
                        // Ürün Kodu/Marka/Ebat/Stok — ana kimlik sütunları, kasıtlı
                        // olarak gizlenemez (bkz. BatchColumnDef.hideable notu);
                        // sadece sürükleyerek yerleri değiştirilebilir.
                        <span className="flex-1 flex items-center gap-1.5 text-sm text-gray-700 select-none">
                          {col.label}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {viewMode === "movements" ? (
        <>
          {/* Malzeme Hareketleri Tablosu */}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs sm:text-sm">
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
                  {movementsLoading ? (
                    Array.from({ length: SKELETON_ROWS }).map((_, i) => (
                      <tr key={`skeleton-${i}`}>
                        <td className="px-4 py-3"><div className="h-4 w-16 bg-gray-100 rounded animate-pulse" /></td>
                        <td className="px-4 py-3"><div className="h-5 w-12 bg-gray-100 rounded-full animate-pulse" /></td>
                        <td className="px-4 py-3"><div className="h-4 w-16 bg-gray-100 rounded animate-pulse" /></td>
                        <td className="px-4 py-3"><div className="h-4 w-16 bg-gray-100 rounded animate-pulse" /></td>
                        <td className="px-4 py-3"><div className="h-4 w-20 bg-gray-100 rounded animate-pulse" /></td>
                        <td className="px-4 py-3"><div className="h-4 w-16 bg-gray-100 rounded animate-pulse" /></td>
                        <td className="px-4 py-3"><div className="h-4 w-12 bg-gray-100 rounded animate-pulse" /></td>
                        <td className="px-4 py-3"><div className="h-4 w-24 bg-gray-100 rounded animate-pulse" /></td>
                        <td className="px-4 py-3 text-center"><div className="h-4 w-8 bg-gray-100 rounded animate-pulse mx-auto" /></td>
                        <td className="px-4 py-3 text-right"><div className="h-4 w-14 bg-gray-100 rounded animate-pulse ml-auto" /></td>
                        <td className="px-4 py-3 text-right"><div className="h-4 w-14 bg-gray-100 rounded animate-pulse ml-auto" /></td>
                        <td className="px-4 py-3 text-center"><div className="h-5 w-10 bg-gray-100 rounded-full animate-pulse mx-auto" /></td>
                      </tr>
                    ))
                  ) : movements.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="p-12 text-center text-gray-400">Kayıt bulunamadı.</td>
                    </tr>
                  ) : (
                    movements.map((m) => (
                      <tr key={`${m.type}-${m.entry_id}`} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{new Date(m.event_date).toLocaleDateString("tr-TR")}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${m.type === "in" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                            {m.type === "in" ? "Giriş" : "Çıkış"}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono font-semibold text-gray-800 whitespace-nowrap">{m.code}</td>
                        <td className="px-4 py-3 text-gray-700">{m.brand ?? "—"}</td>
                        <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{m.size_desc ?? "—"}</td>
                        <td className="px-4 py-3 text-gray-700">
                          <div className="line-clamp-2 max-w-[160px]">{m.supplier ?? "—"}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-700 font-mono">{weekYearLabel(m.production_week, m.production_year)}</td>
                        <td className="px-4 py-3 text-gray-700">
                          {m.type === "out" ? (
                            <div className="flex flex-col">
                              <span className="whitespace-nowrap">{m.customer_name ?? "—"}</span>
                              {(m.plate || m.order_id != null) && (
                                <span className="whitespace-nowrap text-gray-400 text-xs">
                                  {m.plate}
                                  {m.order_id != null && (
                                    <Link href={`/admin/orders/${m.order_id}`} className="ml-1 text-blue-600 hover:text-blue-800 font-mono">
                                      #{m.order_id}
                                    </Link>
                                  )}
                                </span>
                              )}
                            </div>
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
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm text-gray-600">
            <div className="flex items-center gap-3">
              <span>
                {movementsTotal === 0 ? 0 : (movementsPage - 1) * movementsLimit + 1}–{Math.min(movementsPage * movementsLimit, movementsTotal)} / {movementsTotal} hareket
              </span>
              <label className="flex items-center gap-1.5 text-xs text-gray-500">
                Sayfa başına
                <select
                  value={movementsLimit}
                  onChange={(e) => setMovementsLimit(Number(e.target.value))}
                  className="border border-gray-300 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {[20, 50, 100, 200, 500].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            </div>
            {movementsTotal > movementsLimit && (
              <div className="flex gap-1 overflow-x-auto">
                <button
                  onClick={() => setMovementsPage((p) => Math.max(1, p - 1))}
                  disabled={movementsPage === 1}
                  className="px-3 py-1 rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ‹
                </button>
                <span className="px-3 py-1">{movementsPage} / {Math.ceil(movementsTotal / movementsLimit)}</span>
                <button
                  onClick={() => setMovementsPage((p) => p + 1)}
                  disabled={movementsPage * movementsLimit >= movementsTotal}
                  className="px-3 py-1 rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ›
                </button>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          {/* Tablo */}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs sm:text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {visibleOrderedColumns.map((c) =>
                      c.sortK ? (
                        <SortTh key={c.key} sortK={c.sortK} label={c.label} align={c.align ?? "left"} minWidth={c.minWidth} />
                      ) : (
                        <th
                          key={c.key}
                          className={`px-4 py-3 font-medium text-gray-600 whitespace-nowrap ${c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left"} ${c.minWidth}`}
                          title={c.headerTitle}
                        >
                          {c.label}
                        </th>
                      )
                    )}
                    <th className={`sticky right-0 z-20 bg-gray-50 border-l border-gray-200 px-2 sm:px-3 py-3 ${productActionsWidth}`}></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading ? (
                    Array.from({ length: SKELETON_ROWS }).map((_, i) => (
                      <tr key={`skeleton-${i}`}>
                        {visibleOrderedColumns.map((c) => (
                          <td key={c.key} className={`px-4 py-3 ${c.align === "center" ? "text-center" : ""} ${c.minWidth}`}>
                            {c.renderSkeleton ? c.renderSkeleton() : <div className={`h-4 ${c.skeletonWidth} bg-gray-100 rounded animate-pulse`} />}
                          </td>
                        ))}
                        <td className="px-4 py-3">
                          <div className="h-4 w-24 bg-gray-100 rounded animate-pulse ml-auto" />
                        </td>
                      </tr>
                    ))
                  ) : items.length === 0 ? (
                    <tr>
                      <td colSpan={visibleColCount} className="p-12 text-center text-gray-400">Ürün bulunamadı.</td>
                    </tr>
                  ) : (
                    items.map((group) => {
                      const expanded = expandedCodes.has(group.code);
                      return (
                        <Fragment key={group.code}>
                          <tr className="group hover:bg-gray-50 transition-colors bg-gray-50/40">
                            {visibleOrderedColumns.map((c) => (
                              <td key={c.key} className={`px-4 py-3 whitespace-nowrap ${c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : ""} ${c.minWidth}`}>
                                {c.group(group)}
                              </td>
                            ))}
                            <td className={`sticky right-0 z-10 bg-gray-50 group-hover:bg-gray-100 border-l border-gray-100 px-2 sm:px-3 py-3 text-right ${productActionsWidth}`}>
                              <div className="flex items-center justify-end gap-0.5 sm:gap-3 whitespace-nowrap">
                                {canCreate && (
                                  <button
                                    onClick={() => openAdd(group.code, group.batches[group.batches.length - 1] ?? null, group.min_stock_threshold)}
                                    title="Stok Girişi"
                                    aria-label="Stok Girişi"
                                    className="flex items-center gap-1 p-1 sm:p-0 rounded text-blue-600 hover:bg-blue-50 sm:hover:bg-transparent hover:text-blue-800 text-xs font-medium whitespace-nowrap"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <span className="hidden sm:inline">Stok Girişi</span>
                                  </button>
                                )}
                                {canEdit && (
                                  <button
                                    onClick={() => group.batches.length === 1 ? openEdit(group.batches[0], group.min_stock_threshold) : toggleExpand(group.code)}
                                    title="Düzenle"
                                    aria-label="Düzenle"
                                    className="flex items-center gap-1 p-1 sm:p-0 rounded text-gray-500 hover:bg-gray-100 sm:hover:bg-transparent hover:text-gray-700 text-xs font-medium whitespace-nowrap"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.5 19.5H4.5" />
                                    </svg>
                                    <span className="hidden sm:inline">Düzenle</span>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                          {expanded && group.batches.map((batch) => (
                            <tr key={batch.id} className="group hover:bg-gray-50 transition-colors">
                              {visibleOrderedColumns.map((c) => (
                                <td key={c.key} className={`px-4 py-3 whitespace-nowrap ${c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : ""} ${c.minWidth}`}>
                                  {c.batch(batch)}
                                </td>
                              ))}
                              <td className={`sticky right-0 z-10 bg-white group-hover:bg-gray-50 border-l border-gray-100 px-2 sm:px-3 py-3 ${productActionsWidth}`}>
                                <div className="flex items-center justify-end gap-0.5 sm:gap-3 whitespace-nowrap">
                                  <button
                                    onClick={() => openHistoryModal(batch)}
                                    title="Fiyat Geçmişi"
                                    aria-label="Fiyat Geçmişi"
                                    className="flex items-center gap-1 p-1 sm:p-0 rounded text-blue-600 hover:bg-blue-50 sm:hover:bg-transparent hover:text-blue-800 text-xs font-medium"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <span className="hidden sm:inline">Fiyat Geçmişi</span>
                                  </button>
                                  {/* Mağaza Stok/Depo Stok sütunlarındaki ok butonları (bkz. BATCH_COLUMNS)
                                      sadece o konumda TEK parti varken görünür — bu buton SADECE o
                                      okun gösterilmediği, yani bu partinin konumunda birden fazla
                                      parti olduğu (hangisinden taşınacağı ancak burada, spesifik
                                      partiyi seçerek netleşen) durumda gösterilir. Tek partili
                                      ürünlerde (ör. KUMHO205) grup satırındaki ok zaten yeterli —
                                      burada tekrar göstermek gereksiz/kafa karıştırıcı olurdu. */}
                                  {canEdit && otherStandardLocation(batch.location) &&
                                    group.batches.filter((b) => (b.location ?? "") === (batch.location ?? "")).length > 1 && (
                                    <button
                                      onClick={() => openTransfer(batch, otherStandardLocation(batch.location)!)}
                                      title={`${otherStandardLocation(batch.location)}'ya Taşı`}
                                      aria-label={`${otherStandardLocation(batch.location)}'ya Taşı`}
                                      className="flex items-center gap-1 p-1 sm:p-0 rounded text-gray-500 hover:bg-gray-100 sm:hover:bg-transparent hover:text-gray-700 text-xs font-medium"
                                    >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                                      </svg>
                                      <span className="hidden sm:inline">{otherStandardLocation(batch.location)}&apos;ya Taşı</span>
                                    </button>
                                  )}
                                  {canCreate && (
                                    <button
                                      onClick={() => openClone(batch, group.min_stock_threshold)}
                                      title="Benzer Üründen Kopyala"
                                      aria-label="Benzer Üründen Kopyala"
                                      className="flex items-center gap-1 p-1 sm:p-0 rounded text-gray-500 hover:bg-gray-100 sm:hover:bg-transparent hover:text-gray-700 text-xs font-medium"
                                    >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
                                      </svg>
                                      <span className="hidden sm:inline">Kopyala</span>
                                    </button>
                                  )}
                                  {canEdit && (
                                    <button
                                      onClick={() => openEdit(batch, group.min_stock_threshold)}
                                      title="Düzenle"
                                      aria-label="Düzenle"
                                      className="flex items-center gap-1 p-1 sm:p-0 rounded text-gray-500 hover:bg-gray-100 sm:hover:bg-transparent hover:text-gray-700 text-xs font-medium"
                                    >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.5 19.5H4.5" />
                                      </svg>
                                      <span className="hidden sm:inline">Düzenle</span>
                                    </button>
                                  )}
                                  {canDelete && (
                                    <button
                                      onClick={() => handleDelete(batch.id)}
                                      disabled={deletingId === batch.id}
                                      title="Sil"
                                      aria-label="Sil"
                                      className="flex items-center gap-1 p-1 sm:p-0 rounded text-red-500 hover:bg-red-50 sm:hover:bg-transparent hover:text-red-700 disabled:opacity-40 text-xs font-medium"
                                    >
                                      {deletingId === batch.id ? (
                                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={3} />
                                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
                                        </svg>
                                      ) : (
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                        </svg>
                                      )}
                                      <span className="hidden sm:inline">{deletingId === batch.id ? "Siliniyor..." : "Sil"}</span>
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </Fragment>
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
                {total === 0 ? 0 : (page - 1) * limit + 1}–{Math.min(page * limit, total)} / {total} ürün kodu
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
        </>
      )}

      {/* Yeni Ürün / Parti Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col">
            <div className="p-6 pb-4">
            <h2 className="text-xl font-bold text-gray-800 mb-1">Yeni Ürün / Parti</h2>
            <p className="text-xs text-gray-400 mb-5">Aynı Ürün Kodu zaten varsa, farklı bir Üretim Haftası/Yılı ve/veya Tedarikçi girerek o koda yeni bir parti eklemiş olursunuz. Kod+Hafta/Yılı+Tedarikçi mevcut bir partiyle birebir eşleşirse, girdiğiniz miktar o partinin stoğuna eklenir ve fiyat geçmişine yeni bir satır düşer.</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2 flex gap-2">
                <div className="w-1/3">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Ürün Tipi</label>
                  <select value={form.product_type} onChange={(e) => setForm({ ...form, product_type: e.target.value, ...clearOrphanedTypeFields(e.target.value) })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Seçilmedi</option>
                    {PRODUCT_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="w-1/3">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Barkod</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={form.barcode}
                      onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                      onBlur={() => handleBarcodeLookup(setForm, form, setBarcodeChecking)}
                      placeholder="Okutun veya yazın..."
                      className="w-full border border-gray-300 rounded-lg pl-3 pr-9 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {barcodeChecking && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <svg className="w-4 h-4 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={3} />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
                        </svg>
                      </div>
                    )}
                  </div>
                </div>
                <div className="w-1/3">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Ürün Kodu <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                    className="w-full border border-gray-400 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="sm:col-span-2 flex gap-2">
                <div className="w-1/3">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Marka</label>
                  <SearchableCombobox value={form.brand} onChange={(val) => setForm({ ...form, brand: val })} options={brandOptions} placeholder="Marka seç veya yaz..." />
                </div>
                <div className="w-1/3">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Model / Ürün Hattı</label>
                  <input type="text" value={form.model_name} onChange={(e) => setForm({ ...form, model_name: e.target.value })}
                    placeholder="ör. PremiumContact 6"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="w-1/3">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Ebat</label>
                  <input type="text" value={form.size_desc} onChange={(e) => {
                      const size_desc = e.target.value;
                      // Ebat tamamen silinirse yapılandırılmış 3 alan da
                      // temizlenir — aksi hâlde eski Kesit/Profil/Jant Çapı
                      // ilk tuşta Ebat'ı sessizce yeniden doldurup dururdu.
                      // composedOnce de sıfırlanır — Ebat artık bu 3 alandan
                      // türetilmiyor, bir daha "tek tuş ezer" koruması devreye girsin.
                      if (size_desc === "") setSizeComposedOnce(false);
                      setForm((prev) => ({ ...prev, size_desc, ...(size_desc === "" ? { width_mm: "", profile_pct: "", rim_diameter: "" } : {}) }));
                    }}
                    placeholder="205/60R16"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div className="sm:col-span-2">
                {(sizeBuilderOpen || form.width_mm || form.profile_pct || form.rim_diameter) ? (
                  <>
                    <label className="block text-xs font-medium text-gray-400 mb-1">
                      veya yapılandırılmış girin <span className="font-normal">(doldurunca Ebat&apos;ı otomatik oluşturur)</span>
                    </label>
                    <div className="flex gap-2">
                      <input type="number" placeholder="Kesit (ör. 205)" value={form.width_mm}
                        onChange={(e) => handleStructuredSizeChange(setForm, form, { width_mm: e.target.value }, sizeComposedOnce, setSizeComposedOnce)}
                        className="w-1/3 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      <input type="number" placeholder="Profil (ör. 55)" value={form.profile_pct}
                        onChange={(e) => handleStructuredSizeChange(setForm, form, { profile_pct: e.target.value }, sizeComposedOnce, setSizeComposedOnce)}
                        className="w-1/3 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      <input type="text" placeholder="Jant Çapı (ör. R16)" value={form.rim_diameter}
                        onChange={(e) => handleStructuredSizeChange(setForm, form, { rim_diameter: e.target.value }, sizeComposedOnce, setSizeComposedOnce)}
                        className="w-1/3 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </>
                ) : (
                  <button type="button" onClick={() => setSizeBuilderOpen(true)}
                    className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2">
                    Ebat&apos;ı parçalara bölerek de girebilirsiniz
                  </button>
                )}
              </div>
              <div className="sm:col-span-2 border-t border-gray-100 pt-4 flex gap-2">
                {!hideSeasonProduction && (
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Mevsim</label>
                    <SearchableCombobox value={form.season} onChange={(val) => setForm({ ...form, season: val })} options={SEASON_OPTIONS} placeholder="Mevsim seç veya yaz..." />
                  </div>
                )}
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tedarikçi</label>
                  <SearchableCombobox value={form.supplier} onChange={(val) => setForm({ ...form, supplier: val })} options={supplierOptions} placeholder="Tedarikçi seç veya yaz..." />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Konum</label>
                  <SearchableCombobox value={form.location} onChange={(val) => setForm({ ...form, location: val })} options={LOCATION_OPTIONS} placeholder="Mağaza, Depo..." />
                </div>
              </div>
              {!hideSeasonProduction && (
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Üretim Haftası / Yılı</label>
                  <div className="flex gap-2">
                    <input type="number" min="1" max="53" placeholder="Hafta" value={form.production_week}
                      onChange={(e) => setForm({ ...form, production_week: e.target.value })}
                      className="w-1/2 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <input type="number" min="2000" max="2100" placeholder="Yıl" value={form.production_year}
                      onChange={(e) => setForm({ ...form, production_year: e.target.value })}
                      className="w-1/2 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Stok Miktarı / Min. Eşik</label>
                <div className="flex gap-2">
                  <input type="number" placeholder="Adet" value={form.stock_qty}
                    onChange={(e) => setForm({ ...form, stock_qty: e.target.value })}
                    className="w-1/2 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <input type="number" min="0" placeholder="Min. Eşik" value={form.min_stock_threshold}
                    onChange={(e) => setForm({ ...form, min_stock_threshold: e.target.value })}
                    className="w-1/2 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div className="sm:col-span-2 border-t border-gray-100 pt-4">
                <label className="block text-xs font-medium text-gray-400 mb-1">Alış Maliyeti / Kâr Yüzdesi / Satış Fiyatı</label>
                <div className="flex gap-2">
                  <input type="number" step="0.01" placeholder="Alış (₺)" value={form.purchase_price}
                    onChange={(e) => {
                      const purchase_price = e.target.value;
                      setForm((prev) => ({ ...prev, purchase_price, sale_price: calcSalePrice(purchase_price, prev.markupPercent, prev.sale_price) }));
                    }}
                    className="w-1/3 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <input type="number" step="0.01" min="0" placeholder="Kâr %" value={form.markupPercent}
                    onChange={(e) => {
                      const markupPercent = e.target.value;
                      setForm((prev) => ({ ...prev, markupPercent, sale_price: calcSalePrice(prev.purchase_price, markupPercent, prev.sale_price) }));
                    }}
                    className="w-1/3 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <input type="number" step="0.01" placeholder="Satış (₺)" value={form.sale_price} onChange={(e) => setForm({ ...form, sale_price: e.target.value })}
                    className="w-1/3 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              {isUsedTire && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Diş Derinliği (mm)</label>
                  <input type="number" step="0.1" min="0" value={form.tread_depth_mm}
                    onChange={(e) => setForm({ ...form, tread_depth_mm: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              )}
              {isUsedTire && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Kondisyon</label>
                  <div className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-600">
                    {computeCondition(form.tread_depth_mm === "" ? null : Number(form.tread_depth_mm)) ?? "Diş Derinliği girin"}
                  </div>
                </div>
              )}
              {isTireType && (
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-400 mb-1">Yük/Hız Endeksi ve AB Lastik Etiketi</label>
                  <div className="flex gap-2">
                    <input type="text" placeholder="ör. 91H" value={form.load_speed_index}
                      onChange={(e) => setForm({ ...form, load_speed_index: e.target.value })}
                      className="w-1/5 border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <select value={form.eu_fuel_class} onChange={(e) => setForm({ ...form, eu_fuel_class: e.target.value })}
                      className="w-1/5 border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">Yakıt</option>
                      {EU_LABEL_CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select value={form.eu_wet_grip_class} onChange={(e) => setForm({ ...form, eu_wet_grip_class: e.target.value })}
                      className="w-1/5 border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">Islak Tutuş</option>
                      {EU_LABEL_CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <input type="number" placeholder="Gürültü (dB)" value={form.eu_noise_db}
                      onChange={(e) => setForm({ ...form, eu_noise_db: e.target.value })}
                      className="w-1/5 border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <select value={form.eu_noise_class} onChange={(e) => setForm({ ...form, eu_noise_class: e.target.value })}
                      className="w-1/5 border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">Ses Sınıfı</option>
                      {EU_NOISE_CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
              )}
              {isRimType && (
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-400 mb-1">Jant Bilgileri</label>
                  <div className="flex gap-2">
                    <input type="text" placeholder="Ölçü (ör. 17x7.5)" value={form.rim_size}
                      onChange={(e) => setForm({ ...form, rim_size: e.target.value })}
                      className="w-1/3 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <input type="text" placeholder="PCD (ör. 5x114.3)" value={form.pcd}
                      onChange={(e) => setForm({ ...form, pcd: e.target.value })}
                      className="w-1/3 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <input type="text" placeholder="ET (ör. +40)" value={form.offset_et}
                      onChange={(e) => setForm({ ...form, offset_et: e.target.value })}
                      className="w-1/3 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
              )}
              {num(form.stock_qty) > 0 && (num(form.purchase_price) > 0 || num(form.sale_price) > 0) && (
                <div className="sm:col-span-2 text-xs text-gray-500 -mt-1">
                  Toplam ({form.stock_qty} adet): Alış {formatCurrency(num(form.purchase_price) * num(form.stock_qty))} · Satış {formatCurrency(num(form.sale_price) * num(form.stock_qty))}
                </div>
              )}
            </div>
            <div className="mt-5">
              <p className="text-xs font-medium text-gray-500 mb-2">Ön İzleme</p>
              <ProductPreviewCard f={form} />
            </div>
            </div>

            <div className="sticky bottom-0 sm:static bg-white border-t border-gray-100 sm:border-t-0 px-6 py-4 sm:pt-0 sm:pb-6 flex gap-3">
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
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col">
            <div className="p-6 pb-4">
            <h2 className="text-xl font-bold text-gray-800 mb-5">Partiyi Düzenle</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2 flex gap-2">
                <div className="w-1/3">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Ürün Tipi</label>
                  <select value={editForm.product_type} onChange={(e) => setEditForm({ ...editForm, product_type: e.target.value, ...clearOrphanedTypeFields(e.target.value) })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Seçilmedi</option>
                    {PRODUCT_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="w-1/3">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Ürün Kodu</label>
                  <input type="text" value={editForm.code} onChange={(e) => setEditForm({ ...editForm, code: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="w-1/3">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Barkod</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={editForm.barcode}
                      onChange={(e) => setEditForm({ ...editForm, barcode: e.target.value })}
                      onBlur={() => handleBarcodeLookup(setEditForm, editForm, setEditBarcodeChecking)}
                      className="w-full border border-gray-300 rounded-lg pl-3 pr-9 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {editBarcodeChecking && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <svg className="w-4 h-4 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={3} />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
                        </svg>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="sm:col-span-2 flex gap-2">
                <div className="w-1/3">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Marka</label>
                  <SearchableCombobox value={editForm.brand} onChange={(val) => setEditForm({ ...editForm, brand: val })} options={brandOptions} placeholder="Marka seç veya yaz..." />
                </div>
                <div className="w-1/3">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Model / Ürün Hattı</label>
                  <input type="text" value={editForm.model_name} onChange={(e) => setEditForm({ ...editForm, model_name: e.target.value })}
                    placeholder="ör. PremiumContact 6"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="w-1/3">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Ebat</label>
                  <input type="text" value={editForm.size_desc} onChange={(e) => {
                      const size_desc = e.target.value;
                      if (size_desc === "") setEditSizeComposedOnce(false);
                      setEditForm((prev) => ({ ...prev, size_desc, ...(size_desc === "" ? { width_mm: "", profile_pct: "", rim_diameter: "" } : {}) }));
                    }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div className="sm:col-span-2">
                {(editSizeBuilderOpen || editForm.width_mm || editForm.profile_pct || editForm.rim_diameter) ? (
                  <>
                    <label className="block text-xs font-medium text-gray-400 mb-1">
                      veya yapılandırılmış girin <span className="font-normal">(doldurunca Ebat&apos;ı otomatik oluşturur)</span>
                    </label>
                    <div className="flex gap-2">
                      <input type="number" placeholder="Kesit (ör. 205)" value={editForm.width_mm}
                        onChange={(e) => handleStructuredSizeChange(setEditForm, editForm, { width_mm: e.target.value }, editSizeComposedOnce, setEditSizeComposedOnce)}
                        className="w-1/3 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      <input type="number" placeholder="Profil (ör. 55)" value={editForm.profile_pct}
                        onChange={(e) => handleStructuredSizeChange(setEditForm, editForm, { profile_pct: e.target.value }, editSizeComposedOnce, setEditSizeComposedOnce)}
                        className="w-1/3 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      <input type="text" placeholder="Jant Çapı (ör. R16)" value={editForm.rim_diameter}
                        onChange={(e) => handleStructuredSizeChange(setEditForm, editForm, { rim_diameter: e.target.value }, editSizeComposedOnce, setEditSizeComposedOnce)}
                        className="w-1/3 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </>
                ) : (
                  <button type="button" onClick={() => setEditSizeBuilderOpen(true)}
                    className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2">
                    Ebat&apos;ı parçalara bölerek de girebilirsiniz
                  </button>
                )}
              </div>
              <div className="sm:col-span-2 border-t border-gray-100 pt-4 flex gap-2">
                {!editHideSeasonProduction && (
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Mevsim</label>
                    <SearchableCombobox value={editForm.season} onChange={(val) => setEditForm({ ...editForm, season: val })} options={SEASON_OPTIONS} placeholder="Mevsim seç veya yaz..." />
                  </div>
                )}
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tedarikçi</label>
                  <SearchableCombobox value={editForm.supplier} onChange={(val) => setEditForm({ ...editForm, supplier: val })} options={supplierOptions} placeholder="Tedarikçi seç veya yaz..." />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Konum</label>
                  <SearchableCombobox value={editForm.location} onChange={(val) => setEditForm({ ...editForm, location: val })} options={LOCATION_OPTIONS} placeholder="Mağaza, Depo..." />
                </div>
              </div>
              {!editHideSeasonProduction && (
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Üretim Haftası / Yılı</label>
                  <div className="flex gap-2">
                    <input type="number" min="1" max="53" placeholder="Hafta" value={editForm.production_week}
                      onChange={(e) => setEditForm({ ...editForm, production_week: e.target.value })}
                      className="w-1/2 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <input type="number" min="2000" max="2100" placeholder="Yıl" value={editForm.production_year}
                      onChange={(e) => setEditForm({ ...editForm, production_year: e.target.value })}
                      className="w-1/2 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Stok Miktarı / Min. Eşik</label>
                <div className="flex gap-2">
                  <input type="number" placeholder="Adet" value={editForm.stock_qty}
                    onChange={(e) => setEditForm({ ...editForm, stock_qty: e.target.value })}
                    className="w-1/2 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <input type="number" min="0" placeholder="Min. Eşik" value={editForm.min_stock_threshold}
                    onChange={(e) => setEditForm({ ...editForm, min_stock_threshold: e.target.value })}
                    className="w-1/2 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div className="sm:col-span-2 border-t border-gray-100 pt-4">
                <label className="block text-xs font-medium text-gray-400 mb-1">Alış Maliyeti / Kâr Yüzdesi / Satış Fiyatı</label>
                <div className="flex gap-2">
                  <input type="number" step="0.01" placeholder="Alış (₺)" value={editForm.purchase_price}
                    onChange={(e) => {
                      const purchase_price = e.target.value;
                      setEditForm((prev) => ({ ...prev, purchase_price, sale_price: calcSalePrice(purchase_price, prev.markupPercent, prev.sale_price) }));
                    }}
                    className="w-1/3 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <input type="number" step="0.01" min="0" placeholder="Kâr %" value={editForm.markupPercent}
                    onChange={(e) => {
                      const markupPercent = e.target.value;
                      setEditForm((prev) => ({ ...prev, markupPercent, sale_price: calcSalePrice(prev.purchase_price, markupPercent, prev.sale_price) }));
                    }}
                    className="w-1/3 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <input type="number" step="0.01" placeholder="Satış (₺)" value={editForm.sale_price} onChange={(e) => setEditForm({ ...editForm, sale_price: e.target.value })}
                    className="w-1/3 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              {editIsUsedTire && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Diş Derinliği (mm)</label>
                  <input type="number" step="0.1" min="0" value={editForm.tread_depth_mm}
                    onChange={(e) => setEditForm({ ...editForm, tread_depth_mm: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              )}
              {editIsUsedTire && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Kondisyon</label>
                  <div className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-600">
                    {computeCondition(editForm.tread_depth_mm === "" ? null : Number(editForm.tread_depth_mm)) ?? "Diş Derinliği girin"}
                  </div>
                </div>
              )}
              {editIsTireType && (
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-400 mb-1">Yük/Hız Endeksi ve AB Lastik Etiketi</label>
                  <div className="flex gap-2">
                    <input type="text" placeholder="ör. 91H" value={editForm.load_speed_index}
                      onChange={(e) => setEditForm({ ...editForm, load_speed_index: e.target.value })}
                      className="w-1/5 border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <select value={editForm.eu_fuel_class} onChange={(e) => setEditForm({ ...editForm, eu_fuel_class: e.target.value })}
                      className="w-1/5 border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">Yakıt</option>
                      {EU_LABEL_CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select value={editForm.eu_wet_grip_class} onChange={(e) => setEditForm({ ...editForm, eu_wet_grip_class: e.target.value })}
                      className="w-1/5 border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">Islak Tutuş</option>
                      {EU_LABEL_CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <input type="number" placeholder="Gürültü (dB)" value={editForm.eu_noise_db}
                      onChange={(e) => setEditForm({ ...editForm, eu_noise_db: e.target.value })}
                      className="w-1/5 border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <select value={editForm.eu_noise_class} onChange={(e) => setEditForm({ ...editForm, eu_noise_class: e.target.value })}
                      className="w-1/5 border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">Ses Sınıfı</option>
                      {EU_NOISE_CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
              )}
              {editIsRimType && (
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-400 mb-1">Jant Bilgileri</label>
                  <div className="flex gap-2">
                    <input type="text" placeholder="Ölçü (ör. 17x7.5)" value={editForm.rim_size}
                      onChange={(e) => setEditForm({ ...editForm, rim_size: e.target.value })}
                      className="w-1/3 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <input type="text" placeholder="PCD (ör. 5x114.3)" value={editForm.pcd}
                      onChange={(e) => setEditForm({ ...editForm, pcd: e.target.value })}
                      className="w-1/3 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <input type="text" placeholder="ET (ör. +40)" value={editForm.offset_et}
                      onChange={(e) => setEditForm({ ...editForm, offset_et: e.target.value })}
                      className="w-1/3 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
              )}
              {num(editForm.stock_qty) > 0 && (num(editForm.purchase_price) > 0 || num(editForm.sale_price) > 0) && (
                <div className="sm:col-span-2 text-xs text-gray-500 -mt-1">
                  Toplam ({editForm.stock_qty} adet): Alış {formatCurrency(num(editForm.purchase_price) * num(editForm.stock_qty))} · Satış {formatCurrency(num(editForm.sale_price) * num(editForm.stock_qty))}
                </div>
              )}
            </div>
            <div className="mt-5">
              <p className="text-xs font-medium text-gray-500 mb-2">Ön İzleme</p>
              <ProductPreviewCard f={editForm} />
            </div>
            </div>

            <div className="sticky bottom-0 sm:static bg-white border-t border-gray-100 sm:border-t-0 px-6 py-4 sm:pt-0 sm:pb-6 flex gap-3">
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

            {historyEntries.length === 0 && !historyLoading ? (
              <div className="py-8 text-center text-gray-400 text-sm">Henüz stok girişi kaydı yok.</div>
            ) : (
              <div className="overflow-x-auto border border-gray-100 rounded-lg">
                <table className="w-full text-xs sm:text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-gray-600 whitespace-nowrap">Tarih</th>
                      <th className="text-center px-3 py-2 font-medium text-gray-600 whitespace-nowrap">Miktar</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600 whitespace-nowrap">Alış Fiyatı (Birim)</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600 whitespace-nowrap">Satış Fiyatı (Birim)</th>
                      {canEdit && <th className="px-3 py-2 whitespace-nowrap" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {historyLoading ? (
                      Array.from({ length: 4 }).map((_, i) => (
                        <tr key={`skeleton-${i}`}>
                          <td className="px-3 py-2"><div className="h-4 w-16 bg-gray-100 rounded animate-pulse" /></td>
                          <td className="px-3 py-2 text-center"><div className="h-4 w-6 bg-gray-100 rounded animate-pulse mx-auto" /></td>
                          <td className="px-3 py-2 text-right"><div className="h-4 w-14 bg-gray-100 rounded animate-pulse ml-auto" /></td>
                          <td className="px-3 py-2 text-right"><div className="h-4 w-14 bg-gray-100 rounded animate-pulse ml-auto" /></td>
                          {canEdit && <td className="px-3 py-2" />}
                        </tr>
                      ))
                    ) : (
                      historyEntries.map((e) => (
                        <tr key={e.id}>
                          <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{new Date(e.entry_date).toLocaleDateString("tr-TR")}</td>
                          <td className="px-3 py-2 text-center text-gray-700">{e.quantity}</td>
                          {editingHistoryEntryId === e.id ? (
                            <>
                              <td className="px-2 py-1.5">
                                <input
                                  type="number" step="0.01" value={historyEditPurchase}
                                  onChange={(ev) => setHistoryEditPurchase(ev.target.value)}
                                  className="w-24 border border-gray-300 rounded-lg px-2 py-1 text-xs sm:text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <input
                                  type="number" step="0.01" value={historyEditSale}
                                  onChange={(ev) => setHistoryEditSale(ev.target.value)}
                                  className="w-24 border border-gray-300 rounded-lg px-2 py-1 text-xs sm:text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                              </td>
                              <td className="px-3 py-2 text-right whitespace-nowrap">
                                <button
                                  onClick={() => handleSaveHistoryEntry(e.id)}
                                  disabled={historyEntrySaving}
                                  className="text-blue-600 hover:text-blue-800 text-xs font-medium mr-2"
                                >
                                  Kaydet
                                </button>
                                <button
                                  onClick={() => setEditingHistoryEntryId(null)}
                                  className="text-gray-400 hover:text-gray-600 text-xs font-medium"
                                >
                                  Vazgeç
                                </button>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-3 py-2 text-right text-gray-700">{e.purchase_price != null ? formatCurrency(num(e.purchase_price)) : "—"}</td>
                              <td className="px-3 py-2 text-right text-gray-700">{e.sale_price != null ? formatCurrency(num(e.sale_price)) : "—"}</td>
                              {canEdit && (
                                <td className="px-3 py-2 text-right whitespace-nowrap">
                                  <button
                                    onClick={() => startEditHistoryEntry(e)}
                                    className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                                  >
                                    Düzenle
                                  </button>
                                </td>
                              )}
                            </>
                          )}
                        </tr>
                      ))
                    )}
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

      {/* Mağaza ⇄ Depo Taşı */}
      {transferBatch && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4" onClick={() => !transferSaving && setTransferBatch(null)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-gray-800 mb-1">{transferToLocation}&apos;ya Taşı</h2>
            <p className="text-xs text-gray-400 mb-4">
              {batchLabel(transferBatch)} — {transferBatch.location ?? "—"}&apos;da {transferBatch.stock_qty ?? 0} adet
            </p>
            <label className="block text-xs font-medium text-gray-600 mb-1">Taşınacak Miktar</label>
            <input
              type="number"
              min={1}
              max={transferBatch.stock_qty ?? undefined}
              autoFocus
              value={transferQty}
              onChange={(e) => setTransferQty(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !transferSaving && submitTransfer()}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setTransferBatch(null)}
                disabled={transferSaving}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-40"
              >
                Vazgeç
              </button>
              <button
                onClick={submitTransfer}
                disabled={transferSaving || !transferQty}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-40"
              >
                {transferSaving ? "Taşınıyor..." : "Taşı"}
              </button>
            </div>
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
