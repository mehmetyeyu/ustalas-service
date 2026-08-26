import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { resolveServiceIds } from "@/lib/serviceCatalog";
import { upsertDirectoryNames } from "@/lib/directories";
import { deductStock, InsufficientStockError } from "@/lib/productStock";
import { buildOrderQuery } from "@/lib/orderQuery";
import { hasPermission } from "@/lib/permissions";
import { getAutoRegisterCustomers } from "@/lib/settings";

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

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  // Sipariş listesi (müşteri/finansal veriler dahil) yalnızca yönetici panelinde
  // gösterilir — Karşılama Görevlisi yalnızca sipariş oluşturabilir (aşağıdaki
  // POST), listeyi görememeli (ayrı bir orders.view izni olmadıkça).
  if (!hasPermission(user, "orders.view")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(500, Math.max(1, parseInt(searchParams.get("limit") ?? "20")));
  const offset = (page - 1) * limit;

  const { where, values, orderBy } = buildOrderQuery(user.tenantId!, searchParams);

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
         COALESCE(os.payment_type, o.payment_type) AS payment_type
       ${fromClause}
       ORDER BY ${orderBy}
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset]
    );
    // Aynı WHERE ile tek sorguda hem toplam satır sayısı hem toplam tutar/kâr —
    // ekstra bir tam tarama gerektirmez, mevcut COUNT sorgusuna eklenir.
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total,
              COALESCE(SUM(os.unit_price), 0)::float AS total_amount,
              COALESCE(SUM(os.unit_price - os.cost_price), 0)::float AS total_kar
       ${fromClause}`,
      values
    );
    const total: number = countResult.rows[0].total;
    const totalAmount: number = countResult.rows[0].total_amount;
    const totalKar: number = countResult.rows[0].total_kar;

    return NextResponse.json({ items: result.rows, total, totalAmount, totalKar, page, limit });
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

    const autoRegisterCustomers = await getAutoRegisterCustomers(user.tenantId!);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const serviceIdByName = await resolveServiceIds(client, user.tenantId!, lines as OrderLineInput[]);
      await upsertDirectoryNames(client, "suppliers", user.tenantId!, (lines as OrderLineInput[]).map((l) => l.supplier));
      if (autoRegisterCustomers && customer_name && String(customer_name).trim()) {
        await client.query(
          `INSERT INTO customers (tenant_id, name, phone) VALUES ($1, $2, $3)
           ON CONFLICT (tenant_id, name) DO UPDATE SET phone = COALESCE(customers.phone, EXCLUDED.phone)`,
          [user.tenantId, String(customer_name).trim(), customer_phone || null]
        );
      }

      const orderResult = await client.query(
        `INSERT INTO orders (tenant_id, plate, customer_name, customer_phone, notes, total_amount, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'BEKLEMEDE') RETURNING id`,
        [user.tenantId, plate, customer_name || null, customer_phone || null, notes || null, totalAmount]
      );

      const orderId = orderResult.rows[0].id;

      for (const l of lines as OrderLineInput[]) {
        const serviceId = serviceIdByName.get(String(l.service_name).trim());
        if (!serviceId) continue;
        const quantity = Math.max(1, Math.round(Number(l.quantity) || 1));
        if (l.product_id) await deductStock(client, user.tenantId!, l.product_id, quantity);
        await client.query(
          `INSERT INTO order_services
             (tenant_id, order_id, service_id, unit_price, quantity, cost_price, supplier, stock_code, size_desc, product_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            user.tenantId,
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
