import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { resolveServiceIds } from "@/lib/serviceCatalog";
import { upsertDirectoryNames } from "@/lib/directories";
import { deductStock, InsufficientStockError } from "@/lib/productStock";

interface OrderLineInput {
  service_name: string;
  supplier?: string | null;
  stock_code?: string | null;
  size_desc?: string | null;
  quantity?: number | null;
  unit_price: number;
  cost_price?: number | null;
  product_id?: number | null;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

// Sıralama, sonucun geneline (WHERE ile filtrelenmiş TÜM satırlara) uygulanmalı
// — bu yüzden sunucu tarafında, sayfalamayla birlikte yapılır (Ürünler
// sayfasındaki whitelist deseniyle aynı: sortBy doğrudan sorguya değil, bu
// haritadan geçerek eklenir).
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
  payment_type: "os.payment_type",
  notes: "o.notes",
  status: "o.status",
};

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  // Sipariş listesi (müşteri/finansal veriler dahil) yalnızca yönetici panelinde
  // gösterilir — Karşılama Görevlisi yalnızca sipariş oluşturabilir (aşağıdaki
  // POST), listeyi görememeli.
  if (user.role !== "admin") return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  const { searchParams } = new URL(request.url);
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
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(500, Math.max(1, parseInt(searchParams.get("limit") ?? "20")));
  const offset = (page - 1) * limit;
  const sortBy = searchParams.get("sortBy");
  const sortDir = searchParams.get("sortDir") === "desc" ? "DESC" : "ASC";

  const conditions: string[] = [];
  const values: (string | number | string[])[] = [];

  if (status) {
    values.push(status);
    conditions.push(`o.status = $${values.length}`);
  }
  if (dateFrom) {
    values.push(dateFrom);
    conditions.push(`(o.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul')::date >= $${values.length}`);
  }
  if (dateTo) {
    values.push(dateTo);
    conditions.push(`(o.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul')::date <= $${values.length}`);
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
    // Çoklu seçim: bilinen (katalogdaki) değerlerden birebir eşleşme, kendi
    // içinde VEYA — ILIKE değil, checkbox listesi zaten tam adları sunuyor.
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
    // Ebat aramasında "/" zorunlu olmasın diye ("205/45R19" yerine "20545R19" de
    // yazılabilsin) hem arama metninden hem size_desc'ten "/" çıkarılıp da ayrıca
    // karşılaştırılır.
    values.push(`%${escapeLike(sizeDesc)}%`, `%${escapeLike(sizeDesc.replace(/\//g, ""))}%`);
    conditions.push(`(os.size_desc ILIKE $${values.length - 1} OR REPLACE(os.size_desc, '/', '') ILIKE $${values.length})`);
  }
  if (paymentTypes.length > 0) {
    values.push(paymentTypes);
    conditions.push(`os.payment_type = ANY($${values.length})`);
  }
  if (search) {
    // Filtrele modalındaki alan bazlı (VE) filtrelerden ayrı, hızlı bir arama:
    // tek bir metni birden çok alanda (VEYA) arar.
    values.push(`%${escapeLike(search)}%`, `%${escapeLike(search.replace(/\//g, ""))}%`);
    conditions.push(
      `(o.plate ILIKE $${values.length - 1} OR o.customer_name ILIKE $${values.length - 1} OR os.supplier ILIKE $${values.length - 1} OR os.stock_code ILIKE $${values.length - 1} OR os.size_desc ILIKE $${values.length - 1} OR REPLACE(os.size_desc, '/', '') ILIKE $${values.length})`
    );
  }

  const where = conditions.length > 0 ? " WHERE " + conditions.join(" AND ") : "";
  const orderBy = sortBy && SORTABLE_COLUMNS[sortBy]
    ? `${SORTABLE_COLUMNS[sortBy]} ${sortDir} NULLS LAST, o.id ASC`
    : "o.created_at DESC, os.id ASC";

  const fromClause = `
    FROM orders o
    LEFT JOIN order_services os ON o.id = os.order_id
    LEFT JOIN services s ON os.service_id = s.id
    ${where}
  `;

  try {
    const result = await pool.query(
      `SELECT
         o.id, o.plate, o.customer_name, o.notes, o.status, o.created_at,
         os.id AS line_id, s.name AS service_name,
         os.supplier, os.stock_code, os.size_desc, os.quantity, os.unit_price, os.cost_price,
         os.payment_type
       ${fromClause}
       ORDER BY ${orderBy}
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset]
    );
    // Aynı WHERE ile tek sorguda hem toplam satır sayısı hem toplam tutar —
    // ekstra bir tam tarama gerektirmez, mevcut COUNT sorgusuna eklenir.
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total, COALESCE(SUM(os.unit_price), 0)::float AS total_amount ${fromClause}`,
      values
    );
    const total: number = countResult.rows[0].total;
    const totalAmount: number = countResult.rows[0].total_amount;

    return NextResponse.json({ items: result.rows, total, totalAmount, page, limit });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });

  try {
    const { plate, customer_name, customer_phone, notes, lines } = await request.json();

    if (!plate || !Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json(
        { error: "Plaka ve en az bir satır zorunludur." },
        { status: 400 }
      );
    }
    for (const l of lines as OrderLineInput[]) {
      if (!l.service_name || !String(l.service_name).trim()) {
        return NextResponse.json({ error: "Her satır için işlem adı zorunludur." }, { status: 400 });
      }
    }

    const totalAmount = (lines as OrderLineInput[]).reduce(
      (sum, l) => sum + Number(l.unit_price || 0),
      0
    );

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const serviceIdByName = await resolveServiceIds(client, lines as OrderLineInput[]);
      await upsertDirectoryNames(client, "suppliers", (lines as OrderLineInput[]).map((l) => l.supplier));
      if (customer_name && String(customer_name).trim()) {
        await client.query(
          `INSERT INTO customers (name, phone) VALUES ($1, $2)
           ON CONFLICT (name) DO UPDATE SET phone = COALESCE(customers.phone, EXCLUDED.phone)`,
          [String(customer_name).trim(), customer_phone || null]
        );
      }

      const orderResult = await client.query(
        `INSERT INTO orders (plate, customer_name, customer_phone, notes, total_amount, status)
         VALUES ($1, $2, $3, $4, $5, 'BEKLEMEDE') RETURNING id`,
        [plate, customer_name || null, customer_phone || null, notes || null, totalAmount]
      );

      const orderId = orderResult.rows[0].id;

      for (const l of lines as OrderLineInput[]) {
        const serviceId = serviceIdByName.get(String(l.service_name).trim());
        if (!serviceId) continue;
        const quantity = Math.max(1, Math.round(Number(l.quantity) || 1));
        if (l.product_id) await deductStock(client, l.product_id, quantity);
        await client.query(
          `INSERT INTO order_services
             (order_id, service_id, unit_price, quantity, cost_price, supplier, stock_code, size_desc, product_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            orderId,
            serviceId,
            Number(l.unit_price) || 0,
            quantity,
            l.cost_price != null ? Number(l.cost_price) : null,
            l.supplier || null,
            l.stock_code || null,
            l.size_desc || null,
            l.product_id || null,
          ]
        );
      }

      await client.query("COMMIT");
      return NextResponse.json({ id: orderId, total_amount: totalAmount }, { status: 201 });
    } catch (err) {
      await client.query("ROLLBACK");
      if (err instanceof InsufficientStockError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
