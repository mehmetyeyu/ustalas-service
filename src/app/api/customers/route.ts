import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

// Sipariş oluşturma ekranındaki Müşteri alanı için dizin listesi.
export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });

  try {
    // order_count: Müşteriler ekranındaki "Siparişler" linkinin hiç siparişi
    // olmayan müşterilerde gösterilmemesi için (bkz. admin/customers/page.tsx).
    const result = await pool.query(
      `SELECT c.id, c.name, c.phone, COUNT(o.id)::int AS order_count
       FROM customers c
       LEFT JOIN orders o ON o.customer_name = c.name
       GROUP BY c.id, c.name, c.phone
       ORDER BY c.name`
    );
    return NextResponse.json(result.rows, {
      headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=60" },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });

  try {
    const { name, phone } = await request.json();
    if (!name || !String(name).trim()) {
      return NextResponse.json({ error: "Müşteri adı zorunludur." }, { status: 400 });
    }

    const result = await pool.query(
      `INSERT INTO customers (name, phone) VALUES ($1, $2)
       ON CONFLICT (name) DO UPDATE SET phone = EXCLUDED.phone
       RETURNING id, name, phone`,
      [String(name).trim(), phone ? String(phone).trim() : null]
    );
    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
