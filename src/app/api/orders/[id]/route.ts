import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });

  try {
    const { id } = await params;
    const orderResult = await pool.query(
      "SELECT * FROM orders WHERE id = $1",
      [id]
    );
    if (!orderResult.rows[0]) {
      return NextResponse.json({ error: "Sipariş bulunamadı." }, { status: 404 });
    }

    const servicesResult = await pool.query(
      `SELECT s.id, s.name, os.unit_price
       FROM order_services os
       JOIN services s ON os.service_id = s.id
       WHERE os.order_id = $1`,
      [id]
    );

    return NextResponse.json({ ...orderResult.rows[0], services: servicesResult.rows });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });

  try {
    const { id } = await params;
    const result = await pool.query("DELETE FROM orders WHERE id = $1 RETURNING id", [id]);
    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Sipariş bulunamadı." }, { status: 404 });
    }
    return NextResponse.json({ success: true });
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
    const { payment_type, paid_amount } = await request.json();

    if (!["NAKIT", "KREDI_KARTI", "HAVALE"].includes(payment_type)) {
      return NextResponse.json({ error: "Geçersiz ödeme tipi." }, { status: 400 });
    }

    const amount = paid_amount != null ? Number(paid_amount) : null;
    if (amount !== null && (isNaN(amount) || amount < 0)) {
      return NextResponse.json({ error: "Geçersiz tutar." }, { status: 400 });
    }

    await pool.query(
      `UPDATE orders
       SET status = 'TAMAMLANDI', payment_type = $1, payment_date = NOW(),
           paid_amount = COALESCE($3, total_amount)
       WHERE id = $2`,
      [payment_type, id, amount]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
