import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { validateManualCashLedgerInput, InvalidCashLedgerInputError } from "@/lib/cashLedger";

// Bir manuel kasa hareketini düzenler/siler. cash_ledger_entries'teki her
// satır zaten MANUEL'dir (bkz. src/app/api/kasa/route.ts) — customer_ledger
// _entries'in [entryId] route'undaki SIPARIS/MANUEL ayrım kontrolüne burada
// gerek yok.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "kasa.manage")) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await request.json();

    let input;
    try {
      input = validateManualCashLedgerInput(body);
    } catch (err) {
      if (err instanceof InvalidCashLedgerInputError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }

    const result = await pool.query(
      `UPDATE cash_ledger_entries
       SET direction = $1, amount = $2, entry_date = COALESCE($3::date, entry_date), description = $4
       WHERE id = $5 AND tenant_id = $6`,
      [input.direction, input.amount, input.entryDate, input.description, id, user.tenantId]
    );
    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Kayıt bulunamadı." }, { status: 404 });
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
  if (!hasPermission(user, "kasa.manage")) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });
  }

  try {
    const { id } = await params;
    const result = await pool.query(
      "DELETE FROM cash_ledger_entries WHERE id = $1 AND tenant_id = $2",
      [id, user.tenantId]
    );
    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Kayıt bulunamadı." }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
