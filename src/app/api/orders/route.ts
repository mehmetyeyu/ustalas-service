import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const plate = searchParams.get("plate");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");

  let query = `
    SELECT
      o.*,
      STRING_AGG(s.name, ', ') AS services
    FROM orders o
    LEFT JOIN order_services os ON o.id = os.order_id
    LEFT JOIN services s ON os.service_id = s.id
    WHERE 1=1
  `;
  let paramCount = 0;
  const values: (string | number)[] = [];

  if (status) {
    paramCount++;
    query += ` AND o.status = $${paramCount}`;
    values.push(status);
  }
  if (plate) {
    paramCount++;
    query += ` AND o.plate LIKE $${paramCount}`;
    values.push(`%${plate}%`);
  }
  if (dateFrom) {
    paramCount++;
    query += ` AND (o.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul')::date >= $${paramCount}`;
    values.push(dateFrom);
  }
  if (dateTo) {
    paramCount++;
    query += ` AND (o.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul')::date <= $${paramCount}`;
    values.push(dateTo);
  }

  query += " GROUP BY o.id ORDER BY o.created_at DESC";

  try {
    const result = await pool.query(query, values);
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { plate, customer_name, customer_phone, notes, service_ids } =
      await request.json();

    if (!plate || !service_ids || service_ids.length === 0) {
      return NextResponse.json(
        { error: "Plaka ve en az bir hizmet zorunludur." },
        { status: 400 }
      );
    }

    const placeholders = service_ids.map((_: number, i: number) => `$${i + 1}`).join(",");
    const serviceResult = await pool.query(
      `SELECT id, price FROM services WHERE id IN (${placeholders})`,
      service_ids
    );
    const serviceRows = serviceResult.rows;

    const totalAmount = serviceRows.reduce(
      (sum: number, s: { price: number }) => sum + Number(s.price),
      0
    );

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const orderResult = await client.query(
        `INSERT INTO orders (plate, customer_name, customer_phone, notes, total_amount, status)
         VALUES ($1, $2, $3, $4, $5, 'BEKLEMEDE') RETURNING id`,
        [plate, customer_name || null, customer_phone || null, notes || null, totalAmount]
      );

      const orderId = orderResult.rows[0].id;

      for (const svc of serviceRows) {
        await client.query(
          "INSERT INTO order_services (order_id, service_id, unit_price) VALUES ($1, $2, $3)",
          [orderId, svc.id, svc.price]
        );
      }

      await client.query("COMMIT");
      return NextResponse.json({ id: orderId, total_amount: totalAmount }, { status: 201 });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
