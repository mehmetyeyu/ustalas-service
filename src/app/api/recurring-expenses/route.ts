import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const result = await pool.query(
      `SELECT id, category, description, amount::float AS amount, payment_type, is_active
       FROM recurring_expenses
       ORDER BY is_active DESC, category`
    );
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const { category, description, amount, payment_type } = await request.json();
    if (!category || !String(category).trim()) {
      return NextResponse.json({ error: "Kategori zorunludur." }, { status: 400 });
    }
    const amountValue = Number(amount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      return NextResponse.json({ error: "Geçersiz tutar." }, { status: 400 });
    }

    const result = await pool.query(
      `INSERT INTO recurring_expenses (category, description, amount, payment_type)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [
        String(category).trim(),
        description ? String(description).trim() : null,
        amountValue,
        payment_type ? String(payment_type).trim() : null,
      ]
    );
    return NextResponse.json({ id: result.rows[0].id }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
