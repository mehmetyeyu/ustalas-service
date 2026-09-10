import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { validateManualLedgerInput, InvalidLedgerInputError } from "@/lib/customerLedger";
import { assertKasaBelongsToTenant, InvalidKasaError } from "@/lib/kasalar";

// Bir "Tahsilat Al / Borç Ekle" (MANUEL) kaydını düzeltir/siler — SIPARIS
// tipi kayıtlar buradan asla elle değiştirilemez, onlar syncOrderLedger
// tarafından ilgili siparişin kendisi düzenlenince/silinince otomatik
// yönetilir (bkz. src/lib/customerLedger.ts). Doğrulama kuralları kardeş
// POST route'uyla (../route.ts) validateManualLedgerInput üzerinden ortak.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "customers.manage_balance")) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });
  }

  try {
    const { id, entryId } = await params;
    const body = await request.json();

    const entryCheck = await pool.query<{ entry_type: string; payment_type: string | null }>(
      "SELECT entry_type, payment_type FROM customer_ledger_entries WHERE id = $1 AND customer_id = $2 AND tenant_id = $3",
      [entryId, id, user.tenantId]
    );
    if (entryCheck.rows.length === 0) {
      return NextResponse.json({ error: "Kayıt bulunamadı." }, { status: 404 });
    }
    if (entryCheck.rows[0].entry_type !== "MANUEL") {
      return NextResponse.json({ error: "Sipariş kaynaklı kayıtlar buradan düzenlenemez." }, { status: 400 });
    }

    let input;
    try {
      input = await validateManualLedgerInput(body, user.tenantId!, entryCheck.rows[0].payment_type);
      await assertKasaBelongsToTenant(pool, input.kasaId, user.tenantId!);
    } catch (err) {
      if (err instanceof InvalidLedgerInputError || err instanceof InvalidKasaError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }

    await pool.query(
      `UPDATE customer_ledger_entries
       SET direction = $1, amount = $2, payment_type = $3, entry_date = COALESCE($4::date, entry_date), note = $5, kasa_id = $6
       WHERE id = $7 AND customer_id = $8 AND tenant_id = $9`,
      [input.direction, input.amount, input.paymentType, input.entryDate, input.note, input.kasaId, entryId, id, user.tenantId]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "customers.manage_balance")) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });
  }

  try {
    const { id, entryId } = await params;

    const entryCheck = await pool.query<{ entry_type: string }>(
      "SELECT entry_type FROM customer_ledger_entries WHERE id = $1 AND customer_id = $2 AND tenant_id = $3",
      [entryId, id, user.tenantId]
    );
    if (entryCheck.rows.length === 0) {
      return NextResponse.json({ error: "Kayıt bulunamadı." }, { status: 404 });
    }
    if (entryCheck.rows[0].entry_type !== "MANUEL") {
      return NextResponse.json({ error: "Sipariş kaynaklı kayıtlar buradan silinemez." }, { status: 400 });
    }

    await pool.query(
      "DELETE FROM customer_ledger_entries WHERE id = $1 AND customer_id = $2 AND tenant_id = $3",
      [entryId, id, user.tenantId]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
