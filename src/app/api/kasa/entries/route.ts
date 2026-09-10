import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { validateManualCashLedgerInput, InvalidCashLedgerInputError } from "@/lib/cashLedger";

// Kasa sayfasındaki "Para Girişi/Çıkışı Ekle" — hiçbir siparişe/masrafa
// bağlı olmayan bağımsız bir nakit hareketi (bkz. src/app/api/kasa/route.ts
// dosya başı yorumu). cash_ledger_entries'teki her satır MANUEL'dir, bu
// yüzden src/lib/customerLedger.ts'teki SIPARIS/MANUEL ayrımı burada yok.
export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "kasa.manage")) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });
  }

  try {
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

    const result = await pool.query<{ id: number }>(
      `INSERT INTO cash_ledger_entries (tenant_id, direction, amount, entry_date, description, created_by)
       VALUES ($1, $2, $3, COALESCE($4::date, CURRENT_DATE), $5, $6)
       RETURNING id`,
      [user.tenantId, input.direction, input.amount, input.entryDate, input.description, user.userId]
    );

    return NextResponse.json({ id: result.rows[0].id }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
