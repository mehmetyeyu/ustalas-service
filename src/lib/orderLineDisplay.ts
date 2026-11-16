// Sipariş Listesi'nde "Yapılan İşlem" hücresinin alt satırı (ör. "Lastik
// Satışı" altında "235/40R18 Pirelli P Zero 2 adet"). Hangi bilgilerin hangi
// sırayla görüneceği firma tercihi (müşteri isteği: Ebat + Marka + Model) —
// app_settings.order_line_display, Genel Ayarlar > Sipariş Listesi. Varsayılan
// eski görünüm (Ebat + Adet); boş liste alt satırı tamamen gizler.

export const ORDER_LINE_FIELDS = [
  { key: "size", label: "Ebat / Ürün" },
  { key: "brand", label: "Marka" },
  { key: "model", label: "Model" },
  { key: "qty", label: "Adet" },
  { key: "code", label: "Stok Kodu" },
  { key: "supplier", label: "Tedarikçi" },
] as const;

export type OrderLineField = (typeof ORDER_LINE_FIELDS)[number]["key"];

export const DEFAULT_ORDER_LINE_DISPLAY: OrderLineField[] = ["size", "qty"];

const KEYS = new Set<string>(ORDER_LINE_FIELDS.map((f) => f.key));

// İstemciden/DB'den gelen listeyi temizler: bilinmeyen ve tekrar eden alanlar
// atılır, sıra korunur. Dizi değilse null (çağıran varsayılana düşer).
export function sanitizeOrderLineDisplay(raw: unknown): OrderLineField[] | null {
  if (!Array.isArray(raw)) return null;
  const out: OrderLineField[] = [];
  for (const v of raw) {
    if (typeof v === "string" && KEYS.has(v) && !out.includes(v as OrderLineField)) out.push(v as OrderLineField);
  }
  return out;
}

export interface OrderLineValues {
  size_desc: string | null;
  brand: string | null;
  model_name: string | null;
  quantity: number | null;
  stock_code: string | null;
  supplier: string | null;
}

export function formatOrderLine(r: OrderLineValues, fields: readonly OrderLineField[]): string {
  const value: Record<OrderLineField, string | null> = {
    size: r.size_desc,
    brand: r.brand,
    model: r.model_name,
    qty: r.quantity != null ? `${r.quantity} adet` : null,
    code: r.stock_code,
    supplier: r.supplier,
  };
  return fields.map((f) => value[f]?.trim()).filter(Boolean).join(" ");
}
