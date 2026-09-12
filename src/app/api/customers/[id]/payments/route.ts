import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { validateManualLedgerInput, InvalidLedgerInputError } from "@/lib/customerLedger";
import { resolveKasaId, InvalidKasaError } from "@/lib/kasalar";

// Müşteriler ekranındaki "Tahsilat Al / Borç Ekle" — bağımsız bir cari
// hareketi (herhangi bir siparişe bağlı DEĞİL, bkz. src/lib/customerLedger.ts
// dosya başı yorumu: KOBİ muhasebe pratiğinde tahsilat belirli bir faturaya
// değil genel bakiyeye karşı düşer). Doğrulama kuralları (yön/tutar/ödeme
// şekli) src/lib/customerLedger.ts'teki validateManualLedgerInput'ta — bu
// dosyanın kardeşi [entryId]/route.ts (PUT/DELETE) ile TEK ortak kaynak.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "customers.manage_balance")) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await request.json();

    let input;
    let kasaId: number | null;
    try {
      input = await validateManualLedgerInput(body, user.tenantId!);
      kasaId = await resolveKasaId(pool, user.tenantId!, input.paymentType, input.kasaId);
    } catch (err) {
      if (err instanceof InvalidLedgerInputError || err instanceof InvalidKasaError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }

    const customerResult = await pool.query<{ id: number }>(
      "SELECT id FROM customers WHERE id = $1 AND tenant_id = $2",
      [id, user.tenantId]
    );
    if (customerResult.rows.length === 0) {
      return NextResponse.json({ error: "Müşteri bulunamadı." }, { status: 404 });
    }

    const result = await pool.query<{ id: number }>(
      `INSERT INTO customer_ledger_entries
         (tenant_id, customer_id, entry_type, direction, amount, payment_type, entry_date, note, created_by, kasa_id)
       VALUES ($1, $2, 'MANUEL', $3, $4, $5, COALESCE($6::date, CURRENT_DATE), $7, $8, $9)
       RETURNING id`,
      [
        user.tenantId, id, input.direction, input.amount,
        input.paymentType, input.entryDate, input.note, user.userId, kasaId,
      ]
    );

    return NextResponse.json({ id: result.rows[0].id }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
