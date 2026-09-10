import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

// Kasa (fiziksel nakit kasa) — tüm nakit hareketlerini tek kronolojik
// listede, canlı bir bakiye sütunuyla gösterir. Dört kaynak UNION ALL ile
// birleştirilir: nakit sipariş tahsilatları (order_payments + order_services
// fallback — src/app/api/reports/route.ts'teki cashRegisterResult ile
// BİREBİR aynı kaynak/filtre), Cari'den nakit tahsilat (bkz.
// src/lib/customerLedger.ts), nakit masraflar, ve serbest manuel hareketler
// (cash_ledger_entries — hiçbir siparişe/masrafa bağlı olmayan, ör. "Yavuz
// Abiye Gönderildi"). Bakiye her zaman canlı SUM()'dır, cache kolonu yok.
export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "kasa.view")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const result = await pool.query(
      `WITH combined AS (
         SELECT
           'SIPARIS'::text AS entry_type, 1 AS source_rank, op.id AS source_id,
           o.id AS ref_id, 1::smallint AS kasa_direction, op.amount::float AS amount,
           op.created_at::date AS entry_date, op.created_at AS sort_ts,
           COALESCE(o.customer_name, o.plate) AS related_account,
           ('Sipariş #' || o.id || ' Nakit Tahsilatı') AS description
         FROM order_payments op
         JOIN orders o ON o.id = op.order_id
         WHERE op.payment_type = 'Nakit' AND o.tenant_id = $1

         UNION ALL

         SELECT
           'SIPARIS', 2, os.id,
           o.id, 1, os.unit_price::float,
           o.created_at::date, o.created_at,
           COALESCE(o.customer_name, o.plate),
           ('Sipariş #' || o.id || ' Nakit Tahsilatı')
         FROM order_services os
         JOIN orders o ON os.order_id = o.id
         WHERE os.payment_type = 'Nakit' AND os.tenant_id = $1
           AND NOT EXISTS (SELECT 1 FROM order_payments op2 WHERE op2.order_id = o.id AND op2.tenant_id = o.tenant_id)

         UNION ALL

         SELECT
           'CARI_TAHSILAT', 3, cle.id,
           cle.customer_id, 1, cle.amount::float,
           cle.entry_date, cle.created_at,
           c.name,
           COALESCE(cle.note, 'Cari Tahsilatı')
         FROM customer_ledger_entries cle
         JOIN customers c ON c.id = cle.customer_id AND c.tenant_id = cle.tenant_id
         WHERE cle.entry_type = 'MANUEL' AND cle.direction = -1
           AND cle.payment_type = 'Nakit' AND cle.tenant_id = $1

         UNION ALL

         SELECT
           'MASRAF', 4, e.id,
           e.id, -1, e.amount::float,
           e.expense_date, e.created_at,
           e.category,
           COALESCE(e.description, '')
         FROM expenses e
         WHERE e.payment_type = 'Nakit' AND e.tenant_id = $1

         UNION ALL

         SELECT
           'MANUEL', 5, m.id,
           m.id, m.direction, m.amount::float,
           m.entry_date, m.created_at,
           NULL,
           COALESCE(m.description, '')
         FROM cash_ledger_entries m
         WHERE m.tenant_id = $1
       )
       SELECT *,
         SUM(amount * kasa_direction) OVER (ORDER BY entry_date, sort_ts, source_rank, source_id)::float AS running_balance
       FROM combined
       ORDER BY entry_date, sort_ts, source_rank, source_id`,
      [user.tenantId]
    );

    const balance = result.rows.length > 0
      ? (result.rows[result.rows.length - 1] as { running_balance: number }).running_balance
      : 0;

    return NextResponse.json({ balance, entries: result.rows });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
