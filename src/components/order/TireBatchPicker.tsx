"use client";

import { useEffect, useRef, useState } from "react";
import { useStockCodes } from "@/lib/queries";
import { weekYearLabel } from "@/lib/weekYear";
import SearchableCombobox from "./SearchableCombobox";

// /api/products/stock-batches'in döndürdüğü parti.
export interface StockBatch {
  id: number;
  code: string;
  supplier: string | null;
  product_type: string | null;
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

// tracks_size işaretli bir satırdaki (bkz. Hizmetler ekranı) Stok Kodu
// hücresi: kod seçilir/yazılır (seçilen tedarikçide stoğu olan kodlar
// önerilir), kod bir partiyle eşleşince altında
// Üretim Haftası/Yılı seçici belirir — seçilen parti product_id + Ebat + o
// partinin mevcut stoğunu (max_stock, sipariş ekranında anlık uyarı için) üst
// bileşene bildirir.
const NO_CODES: string[] = [];

// Stok Kodu ve Parti, satır ızgarasında İKİ AYRI hücre olarak çizilir
// (fragment döner; hücre/etiket sınıfları çağırandan gelir). Parti seçimi
// eskiden kod kutusunun altına küçük bir listeyle sıkışıyor, satırı
// hizasız uzatıyordu; marka/model ön yazısı da Marka/Model alanlarını
// tekrarlıyordu (seçilince zaten oralara dolar).
export default function TireBatchPicker({
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

