import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { ParsedOrder } from "@/lib/ordersExcel";
import { resolveServiceIds } from "@/lib/serviceCatalog";
import { upsertDirectoryNames } from "@/lib/directories";

const MAX_BATCH_SIZE = 20;

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });

  try {
    const body = await request.json();
    const orders = body.orders as ParsedOrder[] | undefined;

    if (!Array.isArray(orders) || orders.length === 0) {
      return NextResponse.json({ error: "Aktarılacak sipariş bulunamadı." }, { status: 400 });
    }
    if (orders.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        { error: `Bir seferde en fazla ${MAX_BATCH_SIZE} sipariş gönderilebilir.` },
        { status: 400 }
      );
    }

    const client = await pool.connect();
    let imported = 0;
    let duplicates = 0;
    try {
      const serviceIdByName = await resolveServiceIds(client, orders.flatMap((o) => o.lines));
      await upsertDirectoryNames(client, "customers", orders.map((o) => o.customer_name));
      await upsertDirectoryNames(client, "suppliers", orders.flatMap((o) => o.lines).map((l) => l.supplier));

      for (const order of orders) {
        await client.query("BEGIN");
        try {
          const totalAmount = order.lines.reduce((sum, l) => sum + l.unit_price, 0);

          const orderResult = await client.query<{ id: number }>(
            `INSERT INTO orders
               (plate, customer_name, notes, total_amount, paid_amount, status, payment_type, payment_date, created_at, import_ref)
             VALUES ($1, $2, $3, $4, $4, 'TAMAMLANDI', $5, $6, $6, $7)
             ON CONFLICT (import_ref) DO NOTHING
             RETURNING id`,
            [order.plate, order.customer_name, order.notes, totalAmount, order.payment_type, order.date, order.import_ref]
          );

          if (orderResult.rows.length === 0) {
            duplicates++;
            await client.query("COMMIT");
            continue;
          }

          const orderId = orderResult.rows[0].id;
          for (const line of order.lines) {
            const serviceId = serviceIdByName.get(line.service_name.trim());
            if (!serviceId) continue;
            await client.query(
              `INSERT INTO order_services
                 (order_id, service_id, unit_price, quantity, cost_price, supplier, stock_code, size_desc, payment_type)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
              [orderId, serviceId, line.unit_price, line.quantity, line.cost_price, line.supplier, line.stock_code, line.size_desc, line.payment_type]
            );
          }

          await client.query("COMMIT");
          imported++;
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        }
      }
    } finally {
      client.release();
    }

    return NextResponse.json({ imported, duplicates });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
