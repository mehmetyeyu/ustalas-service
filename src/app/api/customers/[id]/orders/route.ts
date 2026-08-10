import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

// Müşteriler ekranındaki "Siparişler" görünümü için — orders.customer_name
// serbest metin olduğundan (FK değil) müşterinin adıyla eşleştirilir. Liste
// sipariş bazlıdır (order_services satır bazlı değil) — her sipariş tek satır.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const { id } = await params;
    const customerResult = await pool.query<{ name: string }>(
      "SELECT name FROM customers WHERE id = $1",
      [id]
    );
    if (customerResult.rows.length === 0) {
      return NextResponse.json({ error: "Müşteri bulunamadı." }, { status: 404 });
    }

    const ordersResult = await pool.query(
      `SELECT id, plate, total_amount, paid_amount, status, payment_type, created_at
       FROM orders WHERE customer_name = $1
       ORDER BY created_at DESC`,
      [customerResult.rows[0].name]
    );

    return NextResponse.json(ordersResult.rows);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
