"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getDefaultAdminPath } from "@/lib/permissions";
import { useToast } from "@/components/ToastProvider";
import { formatCurrency } from "@/lib/format";
import { useQueryClient } from "@tanstack/react-query";
import { forgetUiPref, useApplyUi } from "@/lib/uiTheme";
import { AuthProvider, useAuth } from "@/app/admin/AuthContext";
import StandaloneShellV2 from "@/components/v2/StandaloneShellV2";
import { useMe, useServices, useCustomers, useSuppliers, useProductSizes, invalidateAfter } from "@/lib/queries";
import SearchableCombobox from "@/components/order/SearchableCombobox";
import TireBatchPicker, { type StockBatch } from "@/components/order/TireBatchPicker";
import { resolveUiVersion } from "@/lib/uiVersion";

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

interface OrderLine {
  service_name: string;
  supplier: string;
  stock_code: string;
  size_desc: string;
  brand: string;
  model_name: string;
  quantity: string;
  unit_price: string;
  cost_price: string;
  // tracks_size işaretli bir hizmette (bkz. Hizmetler ekranı — Lastik/Jant
  // Satışı, İkinci El Lastik/Jant hepsi aynı şekilde davranır) belirli bir
  // parti seçildiyse doldurulur — o partinin stoğundan Adet kadar düşülür.
  // max_stock, unit_sale_price ve unit_purchase_price sadece istemcide
  // tutulur (API'ye gönderilmez); birim fiyatlar Adet değişince Tutar/
  // Maliyet'i yeniden hesaplamak içindir.
  product_id: number | null;
  max_stock: number | null;
  unit_sale_price: number | null;
  unit_purchase_price: number | null;
}


// Başlangıç tedarikçi listesi — sunucudan gelen dinamik listeyle (daha önce
// girilmiş tedarikçiler) birleştirilir. "Servis İşçiliği" hariç firmaya özel
// tedarikçi isimleri burada tutulmaz (bkz. suppliers tablosu) — bu proje
// başka firmalara da sunulacağından kod içine bir firmanın gerçek tedarikçi
// listesini gömmek yanlış olur.
const TEDARIKCI_SEED = ["Servis İşçiliği"];

// Sorgu verisi henüz yokken kullanılan sabit boş diziler — her render'da yeni
// [] üretilseydi bunlara bağlı memo/effect'ler gereksiz yere yeniden çalışırdı.
const NO_SERVICES: Service[] = [];
const NO_CUSTOMERS: Customer[] = [];
const NO_STRINGS: string[] = [];

const EMPTY_LINE: OrderLine = {
  service_name: "", supplier: "Servis İşçiliği", stock_code: "", size_desc: "",
  brand: "", model_name: "",
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

// Ürünler ekranından (/?product=<id>) gelen bir partinin hangi ürün-satışı
// hizmetine (tracks_size) yazılacağı. Ürün Tipi ("Lastik", "İkinci El
// Lastik"…) hizmet adıyla birebir aynı olmayabilir (ör. hizmet "Lastik
// Satışı") ve çoğu eski üründe hiç girilmemiş — önce tam eşleşme, sonra adı
// Ürün Tipi ile başlayan hizmet, Ürün Tipi yoksa "İkinci El" olmayan ilk
// hizmet denenir. Yanlış tahmin olursa personel İşlem alanından değiştirir.
function pickProductSaleService(saleServices: Service[], productType: string | null): Service | null {
  if (saleServices.length === 0) return null;
  const lower = (s: string) => s.toLocaleLowerCase("tr-TR");
  const type = productType ? lower(productType.trim()) : "";
  if (type) {
    return saleServices.find((s) => lower(s.name) === type)
      ?? saleServices.find((s) => lower(s.name).startsWith(type))
      ?? saleServices[0];
  }
  return saleServices.find((s) => !lower(s.name).startsWith("ikinci el")) ?? saleServices[0];
}

function OrderPageInner() {
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const plateInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  // Hizmet/müşteri/tedarikçi/ebat listeleri TanStack önbelleğinden (bkz.
  // src/lib/queries.ts) — panelde zaten yüklendiyse tekrar çekilmez, sipariş
  // kaydedilince (yeni müşteri/tedarikçi/hizmet adı otomatik kaydedilir)
  // tazelenir. servicesLoaded: istek bitti (başarılı ya da hatalı) — ürün
  // ön doldurma hangi İşlem'e yazacağını bilmek için bunu bekler.
  const servicesQuery = useServices();
  const services: Service[] = servicesQuery.data ?? NO_SERVICES;
  const servicesLoaded = !servicesQuery.isPending;
  // Bir ürün/parça satışı temsil eden işlemler — bunlarda Tedarikçi varsayılan
  // olarak "Servis İşçiliği" gelmez (boş bırakılır, gerçek tedarikçi seçilir),
  // Stok Kodu ve Ebat alanları gösterilir. Diğer (işçilik) işlemlerinde ikisi
  // de gizlenir. Önceden burada sabit, kod içine gömülü bir isim listesi
  // vardı (Hizmetler'den yeni bir ürün-satışı hizmeti eklense kod bilmeden
  // hiç göstermezdi, gerçek bir kullanıcı raporuydu) — artık services.
  // tracks_size'a (bkz. Hizmetler ekranı) bakıyor.
  const productSaleServiceNames = new Set(services.filter((s) => s.tracks_size).map((s) => s.name));
  const [lines, setLines] = useState<OrderLine[]>([{ ...EMPTY_LINE }]);
  const [plate, setPlate] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");
  // Varsayılan bugün — geçmiş bir günü unutup girmeyi hatırlayan personel
  // için geriye dönük tarih seçilebilir (bkz. /api/orders POST: order_date).
  // Raporlar created_at'e göre gruplandığından (payment_date'e göre değil,
  // bkz. src/app/api/reports/route.ts) bu tek başına doğru güne düşmesi
  // için yeterli.
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().slice(0, 10));
  // Genel Ayarlar'dan açılan firmalarda (bkz. /api/auth/me, admin/settings)
  // zorunlu elle Sipariş No — orders.id'ye hiç dokunmaz, ayrı görüntüleme
  // alanıdır (bkz. database/schema.sql).
  const [customOrderNoEnabled, setCustomOrderNoEnabled] = useState(false);
  // Genel Ayarlar'daki "Araç Plakası Zorunlu" (bkz. database/schema.sql
  // plate_required notu) — varsayılan true (tarihsel davranış), ayar hiç
  // çekilmeden önceki ilk render'da bile Plaka zorunlu görünsün diye.
  const [plateRequired, setPlateRequired] = useState(true);
  const [customOrderNo, setCustomOrderNo] = useState("");
  const [loading, setLoading] = useState(false);
  // staff'ın da izinlerine göre panele dönebileceği yol — hiç sayfa izni
  // yoksa null (o zaman sadece çıkış butonu gösterilir, panel linki değil).
  const [panelPath, setPanelPath] = useState<string | null>(null);
  // Bu sayfa panelin (/admin/*) DIŞINDA, kendi layout'una sahip — panelin
  // "+ Sipariş Ekle" butonu buraya yönlendirdiğinde (admin için bile) firma
  // logosu/adı görünmeyip jenerik "Lastik Servis" yazması, panelden tamamen
  // ayrı bir yere gelinmiş hissi veriyordu (gerçek bir kullanıcı geri
  // bildirimiydi). admin/layout.tsx'teki BrandMark ile aynı desen burada da
  // uygulanıyor — aynı /api/auth/me çağrısından geldiği için ekstra istek yok.
  const [businessName, setBusinessName] = useState("");
  const [panelLogoUrl, setPanelLogoUrl] = useState<string | null>(null);
  const customers: Customer[] = useCustomers().data ?? NO_CUSTOMERS;
  const suppliersData = useSuppliers().data;
  const supplierOptions = useMemo(
    () => Array.from(new Set([...TEDARIKCI_SEED, ...(suppliersData ?? []).map((s) => s.name)])).sort((a, b) => a.localeCompare(b, "tr-TR")),
    [suppliersData]
  );
  const sizeOptions = useProductSizes().data ?? NO_STRINGS;

  // Oturum/firma ayarları TanStack önbelleğinden (bkz. useMe) — panelden bu
  // forma (ve geri) geçerken /api/auth/me tekrar çekilmez.
  const { data: me } = useMe();
  // Sipariş formu panel layout'unun dışında — panelde seçilen görünüm/tema
  // (yeni görünüm + koyu/açık) burada da uygulanır, aksi halde koyu temadan
  // forma geçince sayfa beyaz kalıyordu. Formdan çıkınca temizlenir.
  useApplyUi(me ? resolveUiVersion(me.ui_version, me.ui_beta_version ?? null) : null, me?.ui_theme ?? "system");
  // Yeni görünümde form panelin sol menüsü/üst çubuğuyla açılır (bkz.
  // OrderPage → StandaloneShellV2); kendi marka/geri dön/çıkış satırı gizlenir.
  const { isV2: v2 } = useAuth();
  useEffect(() => {
    if (!me) return;
    setPanelPath(getDefaultAdminPath({ role: me.role, permissions: me.permissions ?? [] }));
    setBusinessName(me.business_name || "");
    setPanelLogoUrl(me.panel_logo_url || null);
    setCustomOrderNoEnabled(!!me.custom_order_no_enabled);
    setPlateRequired(me.plate_required !== false);
  }, [me]);

  useEffect(() => {
    if (servicesQuery.isError) toast.error("Hizmetler yüklenemedi.");
  }, [servicesQuery.isError, toast]);

  // "Kopyala" (bkz. Sipariş Detayı) — aynı müşteri altında birden fazla
  // araç için hemen hemen aynı işlem satırlarıyla tekrar tekrar sipariş
  // girilmesi gereken durumlarda (ör. bir filo müşterisi), her seferinde
  // baştan yazmak yerine önceki siparişin satırlarını/müşterisini kopyalar —
  // sadece Plaka BİLEREK boş bırakılır (asıl amaç bu). Stok/parti bağlantısı
  // (product_id) kasıtlı olarak TAŞINMAZ: kopyalanan sipariş bir stok
  // partisine bağlıysa, o partinin miktarı o zamandan beri değişmiş/tükenmiş
  // olabilir — kullanıcı isterse Stok Kodu alanından güncel partiyi yeniden
  // seçer, aksi halde stok sessizce yanlış/eski bir partiden düşerdi.
  useEffect(() => {
    const copyFrom = searchParams.get("copyFrom");
    if (!copyFrom) return;
    fetch(`/api/orders/${copyFrom}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((order: {
        id: number; custom_order_no: string | null; customer_name: string | null; customer_phone: string | null;
        services: { name: string; supplier: string | null; stock_code: string | null; size_desc: string | null; brand: string | null; model_name: string | null; quantity: number; unit_price: number; cost_price: number | null }[];
      }) => {
        setCustomerName(order.customer_name || "");
        setCustomerPhone(order.customer_phone || "");
        setLines(order.services.map((svc) => ({
          service_name: svc.name,
          supplier: svc.supplier || "",
          stock_code: svc.stock_code || "",
          size_desc: svc.size_desc || "",
          brand: svc.brand || "",
          model_name: svc.model_name || "",
          quantity: String(svc.quantity),
          unit_price: String(svc.unit_price),
          cost_price: svc.cost_price != null ? String(svc.cost_price) : "0",
          product_id: null, max_stock: null, unit_sale_price: null, unit_purchase_price: null,
        })));
        toast.success(`Sipariş ${order.custom_order_no || `#${order.id}`} kopyalandı — plakayı girip kaydedin.`);
        plateInputRef.current?.focus();
      })
      .catch(() => toast.error("Kopyalanacak sipariş bulunamadı."))
      .finally(() => router.replace("/"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ürünler ekranındaki "Sipariş" butonu (bkz. admin/products/page.tsx) —
  // seçilen partiyle tek satırlık bir sipariş ön doldurulur, plaka/müşteri
  // burada girilir, gerekirse işçilik satırları eklenir. Satır, parti
  // seçicideki (TireBatchPicker onBatchSelect) ile aynı alanları doldurur ki
  // Adet değişince Tutar/Maliyet yeniden hesaplansın ve stok uyarısı çalışsın.
  // Parti isteği hizmet listesini BEKLEMEDEN, onunla paralel başlar (ikisi
  // ardışık olunca alanlar belirgin geç doluyordu); satır ancak ikisi de
  // gelince yazılır, çünkü hangi İşlem'e yazılacağı hizmet listesine bağlı.
  // Bu sürede İşlem Satırları yerine yükleniyor göstergesi çıkar ve kaydet
  // kilitlenir — yoksa personel boş satırla kaydetmeye çalışabilirdi.
  const [productLoading, setProductLoading] = useState(() => !!searchParams.get("product"));
  const [prefillBatch, setPrefillBatch] = useState<StockBatch | null>(null);
  const productFetchStarted = useRef(false);
  useEffect(() => {
    const productParam = searchParams.get("product");
    if (!productParam || productFetchStarted.current) return;
    productFetchStarted.current = true;
    fetch(`/api/products/stock-batches?id=${encodeURIComponent(productParam)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: StockBatch[]) => {
        const batch = Array.isArray(data) ? data[0] : undefined;
        if (batch) {
          setPrefillBatch(batch);
        } else {
          toast.error("Ürün bulunamadı veya stokta yok.");
          setProductLoading(false);
        }
      })
      .catch(() => {
        toast.error("Ürün bilgisi yüklenemedi.");
        setProductLoading(false);
      })
      .finally(() => router.replace("/"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!prefillBatch || !servicesLoaded) return;
    const batch = prefillBatch;
    setPrefillBatch(null);
    setProductLoading(false);
    const service = pickProductSaleService(services.filter((s) => s.tracks_size), batch.product_type);
    if (!service) {
      toast.error("Hizmetler'de ürün satışı (Ebat takibi açık) bir hizmet yok — önce Hizmetler ekranından ekleyin.");
      return;
    }
    const supplier = batch.supplier || "";
    const salePrice = batch.avg_sale_price != null ? Number(batch.avg_sale_price) : null;
    const purchasePrice = batch.avg_purchase_price != null ? Number(batch.avg_purchase_price) : null;
    setLines([{
      ...EMPTY_LINE,
      service_name: service.name,
      supplier,
      stock_code: batch.code,
      size_desc: batch.size_desc || "",
      brand: batch.brand || "",
      model_name: batch.model_name || "",
      product_id: batch.id,
      max_stock: batch.stock_qty,
      unit_sale_price: salePrice,
      unit_purchase_price: purchasePrice,
      unit_price: amountToStr(salePrice, 1),
      cost_price: amountToStr(purchasePrice, 1) || "0",
    }]);
    toast.success(`${batch.code} siparişe eklendi — plakayı girip kaydedin.`);
    plateInputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillBatch, servicesLoaded]);

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

  function addLine() {
    setLines((prev) => [...prev, { ...EMPTY_LINE }]);
  }

  function removeLine(index: number) {
    setLines((prev) => prev.length === 1 ? prev : prev.filter((_, i) => i !== index));
  }

  // Masaüstü tablosu ve mobil kart görünümü aynı satır mantığını paylaşır.
  function handleSupplierChange(index: number, line: OrderLine, val: string) {
    if (productSaleServiceNames.has(line.service_name.trim())) {
      // Stok Kodu/Ebat yalnızca gerçek bir stok partisine bağlıysa
      // (product_id doluysa) sıfırlanır — o parti eski tedarikçiye
      // ait, artık geçersiz olur.
      if (line.product_id != null) {
        updateLine(index, { supplier: val, stock_code: "", size_desc: "", brand: "", model_name: "", product_id: null, max_stock: null, unit_sale_price: null, unit_purchase_price: null });
      } else {
        updateLine(index, { supplier: val });
      }
    } else {
      updateLine(index, { supplier: val });
    }
  }

  function handleQuantityChange(index: number, line: OrderLine, quantity: string) {
    if (line.product_id != null && (line.unit_sale_price != null || line.unit_purchase_price != null)) {
      const qty = Math.max(1, Math.round(num(quantity)) || 1);
      updateLine(index, {
        quantity,
        unit_price: amountToStr(line.unit_sale_price, qty),
        cost_price: amountToStr(line.unit_purchase_price, qty),
      });
    } else {
      updateLine(index, { quantity });
    }
  }

  const total = lines.reduce((sum, l) => sum + num(l.unit_price), 0);
  const totalKar = lines.reduce((sum, l) => sum + num(l.unit_price) - num(l.cost_price), 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (customOrderNoEnabled && !customOrderNo.trim()) {
      toast.error("Sipariş numarası zorunludur.");
      return;
    }
    // Genel Ayarlar'dan Plaka zorunlu tutuluyorsa (varsayılan/tarihsel
    // davranış) doğrudan Plaka aranır; kapalıysa ikisi BİRDEN boş olmasın
    // yeter — sipariş hiçbir şeyle tanımlanamaz bir kayıt olmasın diye
    // (gerçek bir kullanıcı raporuyla bulundu).
    if (plateRequired && !plate.trim()) {
      toast.error("Araç plakası zorunludur.");
      return;
    }
    if (!plateRequired && !plate.trim() && !customerName.trim()) {
      toast.error("Plaka veya müşteri adından en az biri girilmelidir.");
      return;
    }
    const validLines = lines.filter((l) => l.service_name.trim());
    if (validLines.length === 0) {
      toast.error("En az bir işlem satırı giriniz.");
      return;
    }
    if (validLines.reduce((sum, l) => sum + num(l.unit_price), 0) <= 0) {
      toast.error("Sipariş tutarı 0'dan büyük olmalıdır.");
      return;
    }
    const overStock = validLines.find((l) => l.product_id && l.max_stock != null && Math.round(num(l.quantity)) > l.max_stock);
    if (overStock) {
      toast.error(`Yetersiz stok: "${overStock.stock_code}" için sadece ${overStock.max_stock} adet mevcut.`);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plate: plate.replace(/\s+/g, "").toUpperCase(),
          custom_order_no: customOrderNoEnabled ? customOrderNo.trim() : undefined,
          customer_name: customerName.trim() || null,
          customer_phone: customerPhone.trim() || null,
          notes: notes.trim() || null,
          order_date: orderDate || null,
          lines: validLines.map((l) => ({
            service_name: l.service_name.trim(),
            supplier: l.supplier.trim() || null,
            stock_code: l.stock_code.trim() || null,
            size_desc: l.size_desc.trim() || null,
            brand: l.brand.trim() || null,
            model_name: l.model_name.trim() || null,
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

      toast.success("Sipariş başarıyla kaydedildi!");
      invalidateAfter(queryClient, "order");
      setPlate("");
      setCustomOrderNo("");
      setCustomerName("");
      setCustomerPhone("");
      setNotes("");
      setOrderDate(new Date().toISOString().slice(0, 10));
      setLines([{ ...EMPTY_LINE }]);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Hata oluştu.");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    forgetUiPref();
    window.location.href = "/admin/login";
  }

  return (
    <div className={v2 ? undefined : "min-h-screen bg-gray-50 p-4 sm:p-6 v2:min-h-0 v2:p-0"}>
      <div className="w-full max-w-6xl">
        {/* Her zaman çizilir, eski görünümde gizli (v2: varyantı) — tercih
            yüklenince eklenip formu aşağı itmesin. */}
        <header className={v2 ? "mb-6" : "mb-6 hidden v2:block"}>
          <h1 className="text-2xl font-semibold tracking-tight text-v2-fg">Yeni Sipariş</h1>
        </header>
          <div className={v2 ? "hidden" : "v1-chrome flex items-center justify-between mb-6"}>
            <div>
              {(() => {
                const brand = panelLogoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- Blob URL'i harici bir host, next/image domain izni istiyor
                  <img src={panelLogoUrl} alt={businessName || "Lastik Servis"} className="h-8 max-w-[180px] object-contain mb-1" />
                ) : (
                  <h1 className="text-2xl font-bold text-gray-800">{businessName || "Lastik Servis"}</h1>
                );
                // Panele erişimi olmayan (hiç sayfa izni olmayan) bir staff için
                // tıklanabilir yapılmaz — "Yönetici Paneli" metin linkiyle aynı koşul.
                // <a> değil Link: panele dönüş tam sayfa yenilemesi yapmasın
                // (store/layout korunur, /api/auth/me vb. tekrar çekilmez).
                return panelPath ? <Link prefetch={false} href={panelPath}>{brand}</Link> : brand;
              })()}
              <h2 className="text-black-700 font-bold text-lg mt-1">Yeni Sipariş Oluştur</h2>
            </div>
            <div className="flex items-center gap-3">
              {panelPath && (
                <>
                  <Link
                    prefetch={false}
                    href={panelPath}
                    className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                    </svg>
                    Yönetici Paneli Geri Dön
                  </Link>
                  <span className="text-gray-300">|</span>
                </>
              )}
              <button
                onClick={handleLogout}
                className="text-sm text-gray-400 hover:text-gray-700 transition-colors"
              >
                Çıkış
              </button>
            </div>
          </div>

          {/* Taslaktaki düzen (iki görünümde ortak): Sipariş Bilgileri, İşlem
              Satırları ve Notlar ayrı kartlar; her satır kendi bloğu (masaüstü
              tablo + mobil kart kopyası yerine tek, her genişliğe uyan blok);
              altta yapışık toplam + kâr + Sipariş Oluştur çubuğu. */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <section aria-labelledby="siparis-bilgileri" className="rounded-xl border border-v2-line bg-v2-surface shadow-sm p-5">
              <h2 id="siparis-bilgileri" className="mb-4 text-[15px] font-semibold text-v2-fg">Sipariş Bilgileri</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Araç Plakası {plateRequired
                    ? <span className="text-red-500">*</span>
                    : <span className="text-gray-400 font-normal">(opsiyonel)</span>}
                </label>
                <input
                  ref={plateInputRef}
                  type="text"
                  value={plate}
                  onChange={(e) => setPlate(e.target.value.replace(/\s+/g, ""))}
                  placeholder={plateRequired ? "34 ABC 123" : "Araca bağlı değilse boş bırakın"}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-base font-mono uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {customOrderNoEnabled && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Sipariş No <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={customOrderNo}
                    onChange={(e) => setCustomOrderNo(e.target.value)}
                    placeholder="Kendi sipariş numaranız"
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tarih
                </label>
                <input
                  type="date"
                  value={orderDate}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setOrderDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            </section>

            <section aria-labelledby="islem-satirlari" className="rounded-xl border border-v2-line bg-v2-surface shadow-sm">
              <div className="flex items-center justify-between border-b border-v2-line px-5 py-4">
                <h2 id="islem-satirlari" className="text-[15px] font-semibold text-v2-fg">
                  İşlem Satırları <span className="text-red-500">*</span>
                </h2>
                <span className="text-[13px] text-v2-fg-muted">{lines.length} satır</span>
              </div>
              {productLoading ? (
                <div role="status" className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500">
                  <svg className="w-5 h-5 animate-spin text-blue-600" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={3} />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
                  </svg>
                  Ürün bilgileri yükleniyor...
                </div>
              ) : (<>
              {lines.map((line, i) => {
                const kar = num(line.unit_price) - num(line.cost_price);
                const isProductSale = productSaleServiceNames.has(line.service_name.trim());
                const overStock = line.product_id != null && line.max_stock != null && Math.round(num(line.quantity)) > line.max_stock;
                const name = line.service_name.trim();
                return (
                  <div key={i} className="flex flex-col gap-3.5 border-b border-v2-line px-5 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold uppercase tracking-wider text-v2-fg-muted">
                        Satır {i + 1}{name ? ` · ${name}` : ""}
                      </span>
                      {lines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeLine(i)}
                          aria-label={`Satır ${i + 1}'i sil`}
                          title="Satırı sil"
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-v2-fg-muted hover:bg-v2-danger-bg hover:text-v2-danger-fg"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></svg>
                        </button>
                      )}
                    </div>

                    {/* Tüm alanlar TEK ızgarada ve listede sabit yerlerinde: ürün
                        satışına özel alanlar (Stok Kodu/Ebat/Marka/Model) araya
                        koşullu girer, İşlem/Tedarikçi kutuları hiç taşınmaz. Ayrı
                        kapsayıcılara bölünce ad bir ürün satışı adına dönüştüğü/
                        döndüğü anda kutu yeniden kuruluyor, yazarken odak
                        kayboluyordu. lg'de 24 sütun: normal işlem tek satır
                        (6+6+2+4+3+3), ürün satışı iki satır (İşlem/Tedarikçi/
                        Stok Kodu/Parti 6×4 / Ebat/Marka/Model 4×3 +2+4+3+3). */}
                    <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-[repeat(24,minmax(0,1fr))]">
                      <div className="col-span-2 min-w-0 sm:col-span-1 lg:col-span-6">
                        <label className="block text-[13px] font-medium text-gray-700 mb-1.5">Yapılan İşlem</label>
                        <SearchableCombobox value={line.service_name} onChange={(val) => updateLine(i, { service_name: val })} options={islemOptions} placeholder="İşlem seç veya yaz..." />
                      </div>
                      <div className="col-span-2 min-w-0 sm:col-span-1 lg:col-span-6">
                        <label className="block text-[13px] font-medium text-gray-700 mb-1.5">Tedarikçi</label>
                        <SearchableCombobox value={line.supplier} onChange={(val) => handleSupplierChange(i, line, val)} options={supplierOptions} placeholder="Tedarikçi seç veya yaz..." />
                      </div>
                      {isProductSale && (
                        <TireBatchPicker
                          supplier={line.supplier}
                          code={line.stock_code}
                          productId={line.product_id}
                          onCodeChange={(val) => updateLine(i, { stock_code: val })}
                          onBatchSelect={(batch) => {
                            const qty = Math.max(1, Math.round(num(line.quantity)) || 1);
                            const salePrice = batch?.avg_sale_price != null ? Number(batch.avg_sale_price) : null;
                            const purchasePrice = batch?.avg_purchase_price != null ? Number(batch.avg_purchase_price) : null;
                            updateLine(i, {
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
                        <div className="col-span-2 min-w-0 sm:col-span-1 lg:col-span-4">
                          <label className="block text-[13px] font-medium text-gray-700 mb-1.5">Ebat</label>
                          <SearchableCombobox value={line.size_desc} onChange={(val) => updateLine(i, { size_desc: val })} options={sizeOptions} placeholder="205/60R16" />
                        </div>
                      )}
                      {isProductSale && (
                        <div className="col-span-2 min-w-0 sm:col-span-1 lg:col-span-4">
                          <label className="block text-[13px] font-medium text-gray-700 mb-1.5">Marka</label>
                          <input type="text" value={line.brand} onChange={(e) => updateLine(i, { brand: e.target.value })} placeholder="Marka" className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                      )}
                      {isProductSale && (
                        <div className="col-span-2 min-w-0 sm:col-span-1 lg:col-span-4">
                          <label className="block text-[13px] font-medium text-gray-700 mb-1.5">Model</label>
                          <input type="text" value={line.model_name} onChange={(e) => updateLine(i, { model_name: e.target.value })} placeholder="Model" className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                      )}
                      <div className="lg:col-span-2">
                        {/* Stok sınırı Adet etiketinin yanında rozet — alanın altındaki
                            yazı yalnızca bu satırı uzatıp ızgara hizasını bozuyordu. */}
                        <div className="mb-1.5 flex items-center justify-between gap-1">
                          <label className="block text-[13px] font-medium text-gray-700">Adet</label>
                          {line.product_id != null && line.max_stock != null && (
                            <span
                              title="Seçili partide kalan stok"
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
                          onChange={(e) => handleQuantityChange(i, line, e.target.value)}
                          className={`w-full border rounded-lg px-4 py-2.5 text-base text-right focus:outline-none focus:ring-2 focus:ring-blue-500 ${overStock ? "border-red-400" : "border-gray-300"}`}
                        />
                      </div>
                      <div className="lg:col-span-4">
                        <label className="block text-[13px] font-medium text-gray-700 mb-1.5">Tutar (₺)</label>
                        <input type="number" min="0" step="0.01" value={line.unit_price} onChange={(e) => updateLine(i, { unit_price: e.target.value })} className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 text-right font-semibold" />
                      </div>
                      <div className="lg:col-span-3">
                        <label className="block text-[13px] font-medium text-gray-700 mb-1.5">Maliyet (₺)</label>
                        <input type="number" min="0" step="0.01" value={line.cost_price} onChange={(e) => updateLine(i, { cost_price: e.target.value })} className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 text-right" />
                      </div>
                      <div className="lg:col-span-3">
                        <span className="block text-[13px] font-medium text-gray-700 mb-1.5">Kâr</span>
                        <div className={`flex h-[46px] items-center justify-end text-base font-semibold tabular-nums ${kar >= 0 ? "text-v2-success-fg" : "text-v2-danger-fg"}`}>
                          {formatCurrency(kar)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div className="p-5">
                <button
                  type="button"
                  onClick={addLine}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-v2-line-strong text-sm font-semibold text-v2-link hover:bg-v2-muted"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="M12 5v14M5 12h14" /></svg>
                  Satır Ekle
                </button>
              </div>
              </>)}
            </section>

            <section className="rounded-xl border border-v2-line bg-v2-surface shadow-sm p-5">
              <label htmlFor="siparis-notlar" className="mb-2.5 block text-[15px] font-semibold text-v2-fg">Notlar</label>
              <textarea
                id="siparis-notlar"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ek notlar..."
                rows={3}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
              />
            </section>

            {/* Mobilde iki satır: üstte toplamlar, altta tam genişlik buton(lar) —
                önceden buton yarım genişlikte sola yaslı kalıyordu. */}
            <div className="sticky bottom-3 sm:bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 sm:gap-4 rounded-xl border border-v2-line bg-v2-surface/95 px-4 sm:px-5 py-3 shadow-lg backdrop-blur">
              <div className="flex items-end gap-6 sm:gap-8">
                <div className="flex flex-col">
                  <span className="text-xs text-v2-fg-muted">Toplam Tutar</span>
                  <span className="text-2xl font-bold leading-8 tracking-tight tabular-nums text-v2-fg">{formatCurrency(total)}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-v2-fg-muted">Kâr</span>
                  <span className={`text-xl font-semibold leading-8 tabular-nums ${totalKar >= 0 ? "text-v2-success-fg" : "text-v2-danger-fg"}`}>{formatCurrency(totalKar)}</span>
                </div>
              </div>
              <button
                type="submit"
                disabled={loading || productLoading}
                className="h-12 w-full sm:w-auto rounded-xl bg-blue-600 px-7 text-[15px] font-semibold text-white transition-colors hover:bg-blue-700 disabled:bg-blue-300"
              >
                {loading ? "Kaydediliyor..." : "Sipariş Oluştur"}
              </button>
            </div>
          </form>
      </div>
    </div>
  );
}

export default function OrderPage() {
  return (
    <AuthProvider>
      <StandaloneShellV2 activeHref="/admin/orders">
        <Suspense fallback={null}>
          <OrderPageInner />
        </Suspense>
      </StandaloneShellV2>
    </AuthProvider>
  );
}
