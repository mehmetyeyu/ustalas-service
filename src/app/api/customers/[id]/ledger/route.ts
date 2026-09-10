import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

// Müşteriler ekranındaki "Cari Hareketleri" görünümü — customer_id ile
// customer_ledger_entries üzerinden gerçek FK, isim eşleşmesi yok (bkz.
// src/lib/customerLedger.ts). Bakiye her zaman hareketlerin CANLI toplamıdır
// (cache kolonu yok), pencere fonksiyonuyla kümülatif olarak hesaplanır.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  // /orders ucundaki aynı gerekçeyle (finansal veri) ikisi de gerekli.
  if (!hasPermission(user, "customers.view") || !hasPermission(user, "orders.view")) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });
  }

  try {
    const { id } = await params;
    const customerResult = await pool.query<{ id: number }>(
      "SELECT id FROM customers WHERE id = $1 AND tenant_id = $2",
      [id, user.tenantId]
    );
    if (customerResult.rows.length === 0) {
      return NextResponse.json({ error: "Müşteri bulunamadı." }, { status: 404 });
    }

    const entriesResult = await pool.query(
      `SELECT cle.id, cle.entry_type, cle.direction, cle.amount::float AS amount, cle.payment_type,
              cle.entry_date::text AS entry_date, cle.note, cle.order_id, cle.kasa_id,
              SUM(cle.amount * cle.direction) OVER (ORDER BY cle.entry_date, cle.id)::float AS running_balance
       FROM customer_ledger_entries cle
       WHERE cle.customer_id = $1 AND cle.tenant_id = $2
       ORDER BY cle.entry_date, cle.id`,
      [id, user.tenantId]
    );

    const balance = entriesResult.rows.length > 0
      ? (entriesResult.rows[entriesResult.rows.length - 1] as { running_balance: number }).running_balance
      : 0;

    return NextResponse.json({ balance, entries: entriesResult.rows });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
