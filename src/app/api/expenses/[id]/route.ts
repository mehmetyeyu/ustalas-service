import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { assertKasaBelongsToTenant, InvalidKasaError } from "@/lib/kasalar";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "expenses.edit")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const { id } = await params;
    const { expense_date, category, description, amount, payment_type, kasa_id } = await request.json();

    if (!expense_date || !String(expense_date).trim()) {
      return NextResponse.json({ error: "Tarih zorunludur." }, { status: 400 });
    }
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
      `UPDATE expenses SET expense_date = $1, category = $2, description = $3, amount = $4, payment_type = $5, kasa_id = $6
       WHERE id = $7 AND tenant_id = $8`,
      [
        expense_date,
        String(category).trim(),
        description ? String(description).trim() : null,
        amountValue,
        trimmedPaymentType,
        trimmedPaymentType === "Nakit" ? (kasa_id ?? null) : null,
        id,
        user.tenantId,
      ]
    );
    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Masraf bulunamadı." }, { status: 404 });
    }
    return NextResponse.json({ success: true });
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
  if (!hasPermission(user, "expenses.delete")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const { id } = await params;
    const result = await pool.query("DELETE FROM expenses WHERE id = $1 AND tenant_id = $2", [id, user.tenantId]);
    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Masraf bulunamadı." }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
