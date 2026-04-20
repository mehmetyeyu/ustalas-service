import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { RowDataPacket } from "mysql2";

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
}

interface ServiceRow extends RowDataPacket {
  id: number;
  name: string;
  unit_price: number;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });

  try {
    const { id } = await params;
    const [orders] = await pool.query<OrderRow[]>(
      "SELECT * FROM orders WHERE id = ?",
      [id]
    );
    if (!orders[0]) {
      return NextResponse.json({ error: "Sipariş bulunamadı." }, { status: 404 });
    }

    const [services] = await pool.query<ServiceRow[]>(
      `SELECT s.id, s.name, os.unit_price
       FROM order_services os
       JOIN services s ON os.service_id = s.id
       WHERE os.order_id = ?`,
      [id]
    );

    return NextResponse.json({ ...orders[0], services });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });

  try {
    const { id } = await params;
    const { payment_type } = await request.json();

    if (!["NAKIT", "KREDI_KARTI", "HAVALE"].includes(payment_type)) {
      return NextResponse.json({ error: "Geçersiz ödeme tipi." }, { status: 400 });
    }

    await pool.query(
      `UPDATE orders
       SET status = 'TAMAMLANDI', payment_type = ?, payment_date = NOW()
       WHERE id = ?`,
      [payment_type, id]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
