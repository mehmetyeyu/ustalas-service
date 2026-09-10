import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

// Kasa (fiziksel nakit kasa) — tüm nakit hareketlerini tek kronolojik
// listede, canlı bir bakiye sütunuyla gösterir. Beş kaynak UNION ALL ile
// birleştirilir: nakit sipariş tahsilatları (order_payments + order_services
// fallback — src/app/api/reports/route.ts'teki cashRegisterResult ile
// BİREBİR aynı kaynak/filtre), Cari'den nakit tahsilat (bkz.
// src/lib/customerLedger.ts), nakit masraflar, ve serbest manuel hareketler
// (cash_ledger_entries — hiçbir siparişe/masrafa bağlı olmayan, ör. "Yavuz
// Abiye Gönderildi", ya da Kasalar Arası Transfer bacakları). Bakiye her
// zaman canlı SUM()'dır, cache kolonu yok.
//
// ?kasaId= — sayısal bir kasa id'si, "unassigned" (kasa_id IS NULL — hiç
// kasa seçilmemiş eski/manuel hareketler), ya da yok (tüm kasalar, varsayılan).
// ÖNEMLİ: filtre pencere fonksiyonundan ÖNCE uygulanır (filtered CTE) — aksi
// halde tek bir kasanın kümülatif bakiyesi tüm kasaların toplamı üzerinden
// yanlış hesaplanırdı.
export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "kasa.view")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const rawKasaId = request.nextUrl.searchParams.get("kasaId");
    // Geçersiz/bozuk bir değer (ör. elle değiştirilmiş URL) sorguyu 500'e
    // düşürmesin diye — "unassigned" veya tam sayı DIŞINDAKİ her şey
    // filtresiz (Tüm Kasalar) davranışa sessizce düşer.
    const kasaIdParam = rawKasaId === "unassigned" || (rawKasaId != null && /^\d+$/.test(rawKasaId))
      ? rawKasaId
      : null;

    const result = await pool.query(
      `WITH combined AS (
         SELECT
           'SIPARIS'::text AS entry_type, 1 AS source_rank, op.id AS source_id,
           o.id AS ref_id, 1::smallint AS kasa_direction, op.amount::float AS amount,
           op.created_at::date AS entry_date, op.created_at AS sort_ts,
           COALESCE(o.customer_name, o.plate) AS related_account,
           ('Sipariş #' || o.id || ' Nakit Tahsilatı') AS description,
           op.kasa_id, NULL::int AS transfer_pair_id
         FROM order_payments op
         JOIN orders o ON o.id = op.order_id
         WHERE op.payment_type = 'Nakit' AND o.tenant_id = $1

         UNION ALL

         SELECT
           'SIPARIS', 2, os.id,
           o.id, 1, os.unit_price::float,
           o.created_at::date, o.created_at,
           COALESCE(o.customer_name, o.plate),
           ('Sipariş #' || o.id || ' Nakit Tahsilatı'),
           os.kasa_id, NULL
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
           COALESCE(cle.note, 'Cari Tahsilatı'),
           cle.kasa_id, NULL
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
           COALESCE(e.description, ''),
           e.kasa_id, NULL
         FROM expenses e
         WHERE e.payment_type = 'Nakit' AND e.tenant_id = $1

         UNION ALL

         SELECT
           'MANUEL', 5, m.id,
           m.id, m.direction, m.amount::float,
           m.entry_date, m.created_at,
           NULL,
           COALESCE(m.description, ''),
           m.kasa_id, m.transfer_pair_id
         FROM cash_ledger_entries m
         WHERE m.tenant_id = $1
       ),
       filtered AS (
         SELECT * FROM combined
         WHERE $2::text IS NULL
            OR ($2::text = 'unassigned' AND kasa_id IS NULL)
            OR (kasa_id = NULLIF($2, 'unassigned')::int)
       )
       SELECT filtered.*, k.name AS kasa_name, pk.name AS transfer_pair_kasa_name,
         SUM(filtered.amount * filtered.kasa_direction) OVER (ORDER BY filtered.entry_date, filtered.sort_ts, filtered.source_rank, filtered.source_id)::float AS running_balance
       FROM filtered
       LEFT JOIN kasalar k ON k.id = filtered.kasa_id AND k.tenant_id = $1
       LEFT JOIN cash_ledger_entries pair_entry ON pair_entry.id = filtered.transfer_pair_id AND pair_entry.tenant_id = $1
       LEFT JOIN kasalar pk ON pk.id = pair_entry.kasa_id AND pk.tenant_id = $1
       ORDER BY filtered.entry_date, filtered.sort_ts, filtered.source_rank, filtered.source_id`,
      [user.tenantId, kasaIdParam]
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
