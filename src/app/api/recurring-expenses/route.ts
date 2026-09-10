import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { assertKasaBelongsToTenant, InvalidKasaError } from "@/lib/kasalar";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "expenses.view")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const result = await pool.query(
      `SELECT id, category, description, amount::float AS amount, payment_type, is_active, kasa_id
       FROM recurring_expenses
       WHERE tenant_id = $1
       ORDER BY is_active DESC, category`,
      [user.tenantId]
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
  if (!hasPermission(user, "expenses.create")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const { category, description, amount, payment_type, kasa_id } = await request.json();
    if (!category || !String(category).trim()) {
      return NextResponse.json({ error: "Kategori zorunludur." }, { status: 400 });
    }
    const amountValue = Number(amount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      return NextResponse.json({ error: "Geçersiz tutar." }, { status: 400 });
    }
    try {
      await assertKasaBelongsToTenant(pool, kasa_id, user.tenantId!);
    } catch (err) {
      if (err instanceof InvalidKasaError) return NextResponse.json({ error: err.message }, { status: 400 });
      throw err;
    }

    const trimmedPaymentType = payment_type ? String(payment_type).trim() : null;
    const result = await pool.query(
      `INSERT INTO recurring_expenses (tenant_id, category, description, amount, payment_type, kasa_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        user.tenantId,
        String(category).trim(),
        description ? String(description).trim() : null,
        amountValue,
        trimmedPaymentType,
        trimmedPaymentType === "Nakit" ? (kasa_id ?? null) : null,
      ]
    );
    return NextResponse.json({ id: result.rows[0].id }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
