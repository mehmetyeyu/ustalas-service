// GET /api/orders (liste) ve GET /api/orders/export (Excel dışa aktarma) aynı
// filtreleri aynı şekilde uygulamalı — bu yüzden WHERE/ORDER BY inşası burada
// tek bir yerde toplanır, iki route de aynı fonksiyonu çağırır.

import { escapeLike } from "@/lib/sqlSafety";
import { effectivePaymentType, isCariSettled, type OrderLedgerStatus } from "@/lib/cariStatus";

// Türkiye sabit UTC+3 kullanır (2016'dan beri yaz saati yok), bu yüzden
// "YYYY-MM-DD" filtre değerinin Europe/Istanbul gece yarısı sınırı burada
// bir kez UTC timestamp'e çevrilip düz aralık karşılaştırması (created_at
// >= $1) olarak kullanılır.
function istanbulDayStartUTC(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, -3, 0, 0));
}
function istanbulNextDayStartUTC(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1, -3, 0, 0));
}

const SORTABLE_COLUMNS: Record<string, string> = {
  order_no: "o.id",
  date: "o.created_at",
  customer_name: "o.customer_name",
  plate: "o.plate",
  service_name: "s.name",
  supplier: "os.supplier",
  stock_code: "os.stock_code",
  size_desc: "os.size_desc",
  brand: "os.brand",
  model_name: "os.model_name",
  quantity: "os.quantity",
  unit_price: "os.unit_price",
  cost_price: "os.cost_price",
  kar: "(COALESCE(os.unit_price, 0) - COALESCE(os.cost_price, 0))",
  payment_type: "COALESCE(os.payment_type, o.payment_type)", // cari durumu yüklüyse aşağıda değişir
  notes: "o.notes",
  payment_note: "o.payment_note",
  status: "o.status",
};

export interface OrderQuery {
  // FROM'daki join'lerden sonra eklenir (ör. kapanmış cari siparişler).
  joins: string;
  where: string;
  values: (string | number | string[] | number[] | Date)[];
  orderBy: string;
  // Sayfalı listede sıralama anahtarları iç sorgudan sort_1/sort_2(/sort_3) olarak
  // taşınır, dış sorgu sırayı bunlarla korur (bkz. GET /api/orders).
  pageSort: { select: string; outer: string };
}

// Ödeme Şekli filtresi ya da sıralaması, kapanmış cari siparişleri borcu
// kapatan yöntemle değerlendirir (effectivePaymentType). Bunun için çağıran
// önce loadOrderLedgerStatuses(…, null) ile firmanın cari durumunu yükleyip
// cariStatuses olarak verir; ne zaman gerektiğini needsCariStatuses söyler.
export function needsCariStatuses(searchParams: URLSearchParams): boolean {
  return searchParams.getAll("payment_type").length > 0 || searchParams.get("sortBy") === "payment_type";
}

export function buildOrderQuery(
  tenantId: number,
  searchParams: URLSearchParams,
  cariStatuses?: Map<number, OrderLedgerStatus>
): OrderQuery {
  const status = searchParams.get("status");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const search = searchParams.get("search");
  const customerName = searchParams.get("customer_name");
  const plate = searchParams.get("plate");
  const serviceNames = searchParams.getAll("service_name");
  const suppliers = searchParams.getAll("supplier");
  const stockCode = searchParams.get("stock_code");
  const sizeDesc = searchParams.get("size_desc");
  const brand = searchParams.get("brand");
  const modelName = searchParams.get("model_name");
  const paymentTypes = searchParams.getAll("payment_type");
  const sortBy = searchParams.get("sortBy");
  const sortDir = searchParams.get("sortDir") === "desc" ? "DESC" : "ASC";

  const conditions: string[] = ["o.tenant_id = $1"];
  const values: (string | number | string[] | number[] | Date)[] = [tenantId];

  // Kapanmış cari siparişler (order_id → borcu kapatan yöntem) hash join ile
  // bağlanır; listede görünen Ödeme Şekli ile filtre/sıralama aynı olur.
  let joins = "";
  let paymentTypeExpr = "COALESCE(os.payment_type, o.payment_type)";
  if (cariStatuses) {
    const settled = Array.from(cariStatuses).filter(([, st]) => isCariSettled(st));
    values.push(settled.map(([id]) => id), settled.map(([, st]) => effectivePaymentType("Cari", st)!));
    joins = `LEFT JOIN unnest($${values.length - 1}::int[], $${values.length}::text[]) AS cari_paid(order_id, paid_via) ON cari_paid.order_id = o.id`;
    paymentTypeExpr = `CASE WHEN COALESCE(os.payment_type, o.payment_type) = 'Cari' AND cari_paid.paid_via IS NOT NULL
      THEN cari_paid.paid_via ELSE COALESCE(os.payment_type, o.payment_type) END`;
  }

  if (status) {
    values.push(status);
    conditions.push(`o.status = $${values.length}`);
  }
  if (dateFrom) {
    values.push(istanbulDayStartUTC(dateFrom));
    conditions.push(`o.created_at >= $${values.length}`);
  }
  if (dateTo) {
    values.push(istanbulNextDayStartUTC(dateTo));
    conditions.push(`o.created_at < $${values.length}`);
  }
  if (customerName) {
    values.push(`%${escapeLike(customerName)}%`);
    conditions.push(`o.customer_name ILIKE $${values.length}`);
  }
  if (plate) {
    values.push(`%${escapeLike(plate)}%`);
    conditions.push(`o.plate ILIKE $${values.length}`);
  }
  if (serviceNames.length > 0) {
    values.push(serviceNames);
    conditions.push(`s.name = ANY($${values.length})`);
  }
  if (suppliers.length > 0) {
    values.push(suppliers);
    conditions.push(`os.supplier = ANY($${values.length})`);
  }
  if (stockCode) {
    values.push(`%${escapeLike(stockCode)}%`);
    conditions.push(`os.stock_code ILIKE $${values.length}`);
  }
  if (sizeDesc) {
    values.push(`%${escapeLike(sizeDesc)}%`, `%${escapeLike(sizeDesc.replace(/\//g, ""))}%`);
    conditions.push(`(os.size_desc ILIKE $${values.length - 1} OR REPLACE(os.size_desc, '/', '') ILIKE $${values.length})`);
  }
  if (brand) {
    values.push(`%${escapeLike(brand)}%`);
    conditions.push(`os.brand ILIKE $${values.length}`);
  }
  if (modelName) {
    values.push(`%${escapeLike(modelName)}%`);
    conditions.push(`os.model_name ILIKE $${values.length}`);
  }
  if (paymentTypes.length > 0) {
    values.push(paymentTypes);
    let condition = `${paymentTypeExpr} = ANY($${values.length})`;
    // Parçalı ödenmiş ("Karışık") siparişin cari kısmı hâlâ açıksa "Cari"
    // filtresinde de çıkar (kullanıcı kararı 2026-11-18) — hücrede
    // "Karışık (₺X cari kaldı)" yazar. Satır bazlı "Karışık" yalnızca
    // order_payments kırılımından gelir (satır tipleri boş).
    if (cariStatuses && paymentTypes.includes("Cari")) {
      const openIds = Array.from(cariStatuses).filter(([, st]) => !isCariSettled(st)).map(([id]) => id);
      values.push(openIds);
      condition = `(${condition} OR (COALESCE(os.payment_type, o.payment_type) = 'Karışık' AND o.id = ANY($${values.length}::int[])))`;
    }
    conditions.push(condition);
  }
  if (search) {
    values.push(`%${escapeLike(search)}%`, `%${escapeLike(search.replace(/\//g, ""))}%`);
    conditions.push(
      `(o.plate ILIKE $${values.length - 1} OR o.customer_name ILIKE $${values.length - 1} OR os.supplier ILIKE $${values.length - 1} OR os.stock_code ILIKE $${values.length - 1} OR os.size_desc ILIKE $${values.length - 1} OR REPLACE(os.size_desc, '/', '') ILIKE $${values.length} OR os.brand ILIKE $${values.length - 1} OR os.model_name ILIKE $${values.length - 1})`
    );
  }

  const where = conditions.length > 0 ? " WHERE " + conditions.join(" AND ") : "";
  const sortColumn = sortBy === "payment_type" ? paymentTypeExpr : sortBy ? SORTABLE_COLUMNS[sortBy] : undefined;
  // Eşitlik satır düzeyinde de bozulur (o.id, os.id): liste satır (line)
  // bazlı — yalnızca o.id ile çok satırlı bir siparişin satırlarının sırası
  // belirsiz kalır, sayfalar arasında bir satır tekrarlanıp bir başkası
  // atlanabiliyordu. Varsayılan sıra zaten os.id ile biter.
  const orderBy = sortColumn
    ? `${sortColumn} ${sortDir} NULLS LAST, o.id ASC, os.id ASC`
    : "o.created_at DESC, os.id ASC";
  const pageSort = sortColumn
    ? { select: `${sortColumn} AS sort_1, o.id AS sort_2, os.id AS sort_3`, outer: `x.sort_1 ${sortDir} NULLS LAST, x.sort_2 ASC, x.sort_3 ASC` }
    : { select: "o.created_at AS sort_1, os.id AS sort_2", outer: "x.sort_1 DESC, x.sort_2 ASC" };

  return { joins, where, values, orderBy, pageSort };
}
