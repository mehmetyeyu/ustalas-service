export interface ParsedOrderLine {
  service_name: string;
  quantity: number;
  unit_price: number;
  cost_price: number;
  supplier: string | null;
  stock_code: string | null;
  size_desc: string | null;
  payment_type: string | null;
}

export interface ParsedOrder {
  import_ref: string;
  date: string;
  plate: string;
  customer_name: string | null;
  payment_type: string | null;
  notes: string | null;
  lines: ParsedOrderLine[];
}

// Muhasebe programındaki bazı satırlarda Ödeme Şekli hücresine doğrudan bir
// tedarikçi adı yazılmış olabilir (ör. "FB Lastik") — bilinen (Genel
// Ayarlar'daki ödeme şekilleri listesindeki, "Mail Order" hariç) sabit ödeme
// tiplerinden biri değilse ve zaten " Mail Order" ile bitmiyorsa, "<Tedarikçi>
// Mail Order" anlamına geldiği kabul edilip öyle normalize edilir.
function normalizePaymentType(raw: string, flatTypes: Set<string>): string {
  if (!raw || flatTypes.has(raw) || raw.endsWith(" Mail Order")) return raw;
  return `${raw} Mail Order`;
}

const HEADER_MAP: Record<string, string> = {
  "tarih": "date",
  "müşteri": "customer_name",
  "plaka": "plate",
  "yapılan işlem": "service_name",
  "tedarikçi": "supplier",
  "stok kodu": "stock_code",
  "ebat": "size_desc",
  "adet": "quantity",
  "tutar": "amount",
  "maliyet": "cost_price",
  "ödeme şekli": "payment_type",
  "açıklama": "note",
};

function normalizeHeader(h: unknown): string {
  return String(h ?? "")
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/\s+/g, " ");
}

function toNumber(val: unknown): number {
  if (val == null || val === "") return 0;
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

function toText(val: unknown): string {
  return val == null ? "" : String(val).trim();
}

// Kaynak dosyadaki tarihler Excel seri numarası olarak gelir (ör. 46235 = 2026-08-01).
// 25569, 1899-12-30 (Excel epoch) ile 1970-01-01 (Unix epoch) arasındaki gün sayısıdır.
function excelSerialToISODate(serial: number): string {
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  return new Date(ms).toISOString().split("T")[0];
}

// Genel/anonim satırlar (ör. "Perakende Müşteri" + "34??" gibi belirsiz plaka) aynı
// gün içinde birden çok farklı, birbiriyle ilgisiz işlemi temsil edebilir — bunlar
// tek siparişte gruplanmaz, her satır kendi başına bir sipariş olur.
function isAnonymous(customerName: string, plate: string): boolean {
  const custNorm = customerName.toLocaleLowerCase("tr-TR");
  if (!custNorm || custNorm === "perakende müşteri") return true;
  if (!plate || plate.includes("?")) return true;
  return false;
}

// XLSX.utils.sheet_to_json(sheet, { header: 1 }) çıktısını alır. paymentTypes,
// Genel Ayarlar'daki ödeme şekilleri listesidir ("Mail Order" dahil) —
// normalizasyon için "Mail Order" hariç geri kalanı kullanılır.
export function parseOrderRows(
  rows: unknown[][],
  paymentTypes: string[]
): { orders: ParsedOrder[]; skipped: number } {
  if (rows.length === 0) return { orders: [], skipped: 0 };

  const flatPaymentTypes = new Set(paymentTypes.filter((t) => t !== "Mail Order"));

  const headerRow = rows[0] as unknown[];
  const colIndex: Record<string, number> = {};
  headerRow.forEach((h, i) => {
    const key = HEADER_MAP[normalizeHeader(h)];
    if (key) colIndex[key] = i;
  });

  if (colIndex.date === undefined || colIndex.plate === undefined) {
    throw new Error('"Tarih" ve/veya "Plaka" sütunu bulunamadı.');
  }

  const groups = new Map<string, ParsedOrder>();
  let skipped = 0;

  for (let rowIdx = 0; rowIdx < rows.length - 1; rowIdx++) {
    const r = rows[rowIdx + 1] as unknown[];
    const isBlank = r.every((c) => c === null || c === undefined || c === "");
    if (isBlank) continue;

    const dateSerial = colIndex.date !== undefined ? toNumber(r[colIndex.date]) : 0;
    const plate = colIndex.plate !== undefined ? toText(r[colIndex.plate]) : "";
    const customerName = colIndex.customer_name !== undefined ? toText(r[colIndex.customer_name]) : "";
    const serviceName = colIndex.service_name !== undefined ? toText(r[colIndex.service_name]) : "";
    const amount = colIndex.amount !== undefined ? toNumber(r[colIndex.amount]) : 0;

    if (!dateSerial || !serviceName) { skipped++; continue; }

    const date = excelSerialToISODate(dateSerial);
    const anonymous = isAnonymous(customerName, plate);
    const groupKey = anonymous
      ? `anon:${date}|${customerName}|${plate}|${rowIdx}`
      : `named:${date}|${customerName.toLocaleLowerCase("tr-TR")}|${plate.toLocaleLowerCase("tr-TR")}`;

    const note = colIndex.note !== undefined ? toText(r[colIndex.note]) : "";
    const paymentType = normalizePaymentType(colIndex.payment_type !== undefined ? toText(r[colIndex.payment_type]) : "", flatPaymentTypes);

    let order = groups.get(groupKey);
    if (!order) {
      order = {
        import_ref: `satis-listesi:${groupKey}`,
        date,
        plate: plate || "??",
        customer_name: customerName || null,
        payment_type: null,
        notes: null,
        lines: [],
      };
      groups.set(groupKey, order);
    }

    if (note) {
      order.notes = order.notes ? `${order.notes}; ${note}` : note;
    }

    order.lines.push({
      service_name: serviceName,
      quantity: Math.round(toNumber(colIndex.quantity !== undefined ? r[colIndex.quantity] : 1)) || 1,
      unit_price: amount,
      cost_price: colIndex.cost_price !== undefined ? toNumber(r[colIndex.cost_price]) : 0,
      supplier: colIndex.supplier !== undefined ? toText(r[colIndex.supplier]) || null : null,
      stock_code: colIndex.stock_code !== undefined ? toText(r[colIndex.stock_code]) || null : null,
      size_desc: colIndex.size_desc !== undefined ? toText(r[colIndex.size_desc]) || null : null,
      payment_type: paymentType || null,
    });
  }

  // Sipariş seviyesindeki payment_type bir özet değeridir: tüm satırlar aynı
  // ödeme tipini kullanıyorsa o değer, karışıksa 'Karışık' olarak işaretlenir.
  // Asıl ödeme bilgisi satır (order_services.payment_type) seviyesinde tutulur.
  for (const order of Array.from(groups.values())) {
    const distinct = Array.from(new Set(order.lines.map((l) => l.payment_type).filter((p): p is string => !!p)));
    order.payment_type = distinct.length === 1 ? distinct[0] : distinct.length > 1 ? "Karışık" : null;
  }

  return { orders: Array.from(groups.values()), skipped };
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
