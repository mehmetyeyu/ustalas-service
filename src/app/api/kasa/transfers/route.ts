import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { assertKasaBelongsToTenant, InvalidKasaError } from "@/lib/kasalar";

// Kasa sayfasındaki "Kasalar Arası Transfer" — bir kasadan diğerine para
// aktarımı, TEK işlemle, birbirine bağlı (cash_ledger_entries.transfer_pair_id)
// ve her zaman dengeli (aynı tutar, iki tarafta) iki satır olarak yazılır.
// Bu satırlar PUT ile düzenlenemez, sadece birlikte silinebilir (bkz.
// src/app/api/kasa/entries/[id]/route.ts).
export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "kasa.manage")) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });
  }

  try {
    const body = await request.json();
    const fromKasaId = Number(body.from_kasa_id);
    const toKasaId = Number(body.to_kasa_id);
    const amount = Number(body.amount);
    const entryDate = body.entry_date ? String(body.entry_date).trim() : null;
    const description = body.description ? String(body.description).trim() : null;

    if (!Number.isFinite(fromKasaId) || !Number.isFinite(toKasaId)) {
      return NextResponse.json({ error: "Kaynak ve hedef kasa zorunludur." }, { status: 400 });
    }
    if (fromKasaId === toKasaId) {
      return NextResponse.json({ error: "Kaynak ve hedef kasa aynı olamaz." }, { status: 400 });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Geçersiz tutar." }, { status: 400 });
    }

    try {
      await assertKasaBelongsToTenant(pool, fromKasaId, user.tenantId!);
      await assertKasaBelongsToTenant(pool, toKasaId, user.tenantId!);
    } catch (err) {
      if (err instanceof InvalidKasaError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }

    // Farklı para birimindeki kasalar arası transfer, döviz bozdurma
    // anlamına gelirdi (ör. 500 TL'nin 500 USD'ye eşit sayılması) — kapsam
    // dışı, tamamen engellenir (bkz. plan: "Kasalara Para Birimi Desteği").
    const currencies = await pool.query<{ id: number; currency: string }>(
      "SELECT id, currency FROM kasalar WHERE id = ANY($1) AND tenant_id = $2",
      [[fromKasaId, toKasaId], user.tenantId]
    );
    const currencyById = new Map(currencies.rows.map((r) => [r.id, r.currency]));
    if (currencyById.get(fromKasaId) !== currencyById.get(toKasaId)) {
      return NextResponse.json({ error: "Farklı para birimindeki kasalar arasında transfer yapılamaz." }, { status: 400 });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const fromRow = await client.query<{ id: number }>(
        `INSERT INTO cash_ledger_entries (tenant_id, kasa_id, direction, amount, entry_date, description, created_by)
         VALUES ($1, $2, -1, $3, COALESCE($4::date, CURRENT_DATE), $5, $6)
         RETURNING id`,
        [user.tenantId, fromKasaId, amount, entryDate, description, user.userId]
      );
      const toRow = await client.query<{ id: number }>(
        `INSERT INTO cash_ledger_entries (tenant_id, kasa_id, direction, amount, entry_date, description, created_by)
         VALUES ($1, $2, 1, $3, COALESCE($4::date, CURRENT_DATE), $5, $6)
         RETURNING id`,
        [user.tenantId, toKasaId, amount, entryDate, description, user.userId]
      );
      const fromId = fromRow.rows[0].id;
      const toId = toRow.rows[0].id;
      await client.query("UPDATE cash_ledger_entries SET transfer_pair_id = $1 WHERE id = $2", [toId, fromId]);
      await client.query("UPDATE cash_ledger_entries SET transfer_pair_id = $1 WHERE id = $2", [fromId, toId]);
      await client.query("COMMIT");
      return NextResponse.json({ from_id: fromId, to_id: toId }, { status: 201 });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
