import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { validateManualCashLedgerInput, InvalidCashLedgerInputError } from "@/lib/cashLedger";
import { assertKasaBelongsToTenant, InvalidKasaError } from "@/lib/kasalar";

// Bir manuel kasa hareketini düzenler/siler. cash_ledger_entries'teki her
// satır zaten MANUEL'dir (bkz. src/app/api/kasa/route.ts) — customer_ledger
// _entries'in [entryId] route'undaki SIPARIS/MANUEL ayrım kontrolüne burada
// gerek yok. Kasalar Arası Transfer bacakları (transfer_pair_id dolu) ise
// buradan hiç DÜZENLENEMEZ (bkz. src/app/api/kasa/transfers/route.ts) —
// tutar/tarih değişikliği gerekiyorsa transfer silinip yeniden girilir, bu
// iki bacağın her zaman dengeli kalmasını basitçe garanti eder.
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

    const entryCheck = await pool.query<{ transfer_pair_id: number | null }>(
      "SELECT transfer_pair_id FROM cash_ledger_entries WHERE id = $1 AND tenant_id = $2",
      [id, user.tenantId]
    );
    if (entryCheck.rows.length === 0) {
      return NextResponse.json({ error: "Kayıt bulunamadı." }, { status: 404 });
    }
    if (entryCheck.rows[0].transfer_pair_id !== null) {
      return NextResponse.json({ error: "Transfer kayıtları düzenlenemez, silip yeniden ekleyin." }, { status: 400 });
    }

    let input;
    try {
      input = validateManualCashLedgerInput(body);
      await assertKasaBelongsToTenant(pool, input.kasaId, user.tenantId!);
    } catch (err) {
      if (err instanceof InvalidCashLedgerInputError || err instanceof InvalidKasaError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }

    const result = await pool.query(
      `UPDATE cash_ledger_entries
       SET direction = $1, amount = $2, entry_date = COALESCE($3::date, entry_date), description = $4, kasa_id = $5
       WHERE id = $6 AND tenant_id = $7`,
      [input.direction, input.amount, input.entryDate, input.description, input.kasaId, id, user.tenantId]
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
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Bir transferin (bkz. src/app/api/kasa/transfers/route.ts) sadece
      // yarısını silmek dengesiz bir bakiye bırakırdı — karşı bacak da varsa
      // TEK transaction'da birlikte silinir.
      const entryCheck = await client.query<{ transfer_pair_id: number | null }>(
        "SELECT transfer_pair_id FROM cash_ledger_entries WHERE id = $1 AND tenant_id = $2 FOR UPDATE",
        [id, user.tenantId]
      );
      if (entryCheck.rows.length === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Kayıt bulunamadı." }, { status: 404 });
      }
      const pairId = entryCheck.rows[0].transfer_pair_id;
      // Her iki bacak da kendi transfer_pair_id'siyle diğerine işaret ediyor
      // (self-referencing FK) — ikisi TEK DELETE'te (ANY($1)) silinmeli, aksi
      // halde önce silinen satır hâlâ diğerinden referans alınıyor olur ve
      // RESTRICT FK'sı 23503 ile başarısız olur.
      const ids = pairId !== null ? [Number(id), pairId] : [Number(id)];
      await client.query("DELETE FROM cash_ledger_entries WHERE id = ANY($1) AND tenant_id = $2", [ids, user.tenantId]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
