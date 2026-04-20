import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { RowDataPacket, ResultSetHeader } from "mysql2";

interface OrderRow extends RowDataPacket {
  id: number;
  plate: string;
  customer_name: string | null;
  customer_phone: string | null;
  notes: string | null;
  total_amount: number;
  status: string;
  payment_type: string | null;
  payment_date: string | null;
  created_at: string;
  services: string;
}

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
      GROUP_CONCAT(s.name SEPARATOR ', ') AS services
    FROM orders o
    LEFT JOIN order_services os ON o.id = os.order_id
    LEFT JOIN services s ON os.service_id = s.id
    WHERE 1=1
  `;
  const values: (string | number)[] = [];

  if (status) {
    query += " AND o.status = ?";
    values.push(status);
  }
  if (plate) {
    query += " AND o.plate LIKE ?";
    values.push(`%${plate}%`);
  }
  if (dateFrom) {
    query += " AND DATE(o.created_at) >= ?";
    values.push(dateFrom);
  }
  if (dateTo) {
    query += " AND DATE(o.created_at) <= ?";
    values.push(dateTo);
  }

  query += " GROUP BY o.id ORDER BY o.created_at DESC";

  try {
    const [rows] = await pool.query<OrderRow[]>(query, values);
    return NextResponse.json(rows);
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

    // Hizmet fiyatlarını al
    const placeholders = service_ids.map(() => "?").join(",");
    const [serviceRows] = await pool.query<RowDataPacket[]>(
      `SELECT id, price FROM services WHERE id IN (${placeholders})`,
      service_ids
    );

    const totalAmount = serviceRows.reduce(
      (sum: number, s: RowDataPacket) => sum + Number(s.price),
      0
    );

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [orderResult] = await conn.query<ResultSetHeader>(
        `INSERT INTO orders (plate, customer_name, customer_phone, notes, total_amount, status)
         VALUES (?, ?, ?, ?, ?, 'BEKLEMEDE')`,
        [plate, customer_name || null, customer_phone || null, notes || null, totalAmount]
      );

      const orderId = orderResult.insertId;

      for (const svc of serviceRows) {
        await conn.query(
          "INSERT INTO order_services (order_id, service_id, unit_price) VALUES (?, ?, ?)",
          [orderId, svc.id, svc.price]
        );
      }

      await conn.commit();
      return NextResponse.json({ id: orderId, total_amount: totalAmount }, { status: 201 });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
