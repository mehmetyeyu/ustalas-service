// GET /api/orders (liste) ve GET /api/orders/export (Excel dışa aktarma) aynı
// filtreleri aynı şekilde uygulamalı — bu yüzden WHERE/ORDER BY inşası burada
// tek bir yerde toplanır, iki route de aynı fonksiyonu çağırır.

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

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
  quantity: "os.quantity",
  unit_price: "os.unit_price",
  cost_price: "os.cost_price",
  kar: "(COALESCE(os.unit_price, 0) - COALESCE(os.cost_price, 0))",
  payment_type: "COALESCE(os.payment_type, o.payment_type)",
  notes: "o.notes",
  status: "o.status",
};

export interface OrderQuery {
  where: string;
  values: (string | number | string[] | Date)[];
  orderBy: string;
}

export function buildOrderQuery(searchParams: URLSearchParams): OrderQuery {
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
  const paymentTypes = searchParams.getAll("payment_type");
  const sortBy = searchParams.get("sortBy");
  const sortDir = searchParams.get("sortDir") === "desc" ? "DESC" : "ASC";

  const conditions: string[] = [];
  const values: (string | number | string[] | Date)[] = [];

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
  if (paymentTypes.length > 0) {
    values.push(paymentTypes);
    conditions.push(`COALESCE(os.payment_type, o.payment_type) = ANY($${values.length})`);
  }
  if (search) {
    values.push(`%${escapeLike(search)}%`, `%${escapeLike(search.replace(/\//g, ""))}%`);
    conditions.push(
      `(o.plate ILIKE $${values.length - 1} OR o.customer_name ILIKE $${values.length - 1} OR os.supplier ILIKE $${values.length - 1} OR os.stock_code ILIKE $${values.length - 1} OR os.size_desc ILIKE $${values.length - 1} OR REPLACE(os.size_desc, '/', '') ILIKE $${values.length})`
    );
  }

  const where = conditions.length > 0 ? " WHERE " + conditions.join(" AND ") : "";
  const orderBy = sortBy && SORTABLE_COLUMNS[sortBy]
    ? `${SORTABLE_COLUMNS[sortBy]} ${sortDir} NULLS LAST, o.id ASC`
    : "o.created_at DESC, os.id ASC";

  return { where, values, orderBy };
}
