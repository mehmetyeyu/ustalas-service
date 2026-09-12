import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

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
// payment_type = 'Nakit' OLMASA bile kasa_id dolu olan satırlar da dahil
// edilir — bir ödeme tipi (ör. "Nazım Hesap") Kasaları Yönet'ten bir kasaya
// BAĞLANMIŞSA (bkz. src/lib/kasalar.ts: resolveKasaId), o tipteki işlemler
// otomatik kasa_id alır ve buraya, o kasanın gerçek bir hareketiymiş gibi
// dahil olur. Açıklama metni de gerçek payment_type'ı yansıtır (sadece
// "Nakit" değil).
//
// ?kasaId= — sayısal bir kasa id'si, "unassigned" (kasa_id IS NULL — hiç
// kasa seçilmemiş eski/manuel hareketler), ya da yok (tüm kasalar, varsayılan).
// ÖNEMLİ: filtre pencere fonksiyonundan ÖNCE uygulanır (filtered CTE) — aksi
// halde tek bir kasanın kümülatif bakiyesi tüm kasaların toplamı üzerinden
// yanlış hesaplanırdı.
//
// ?from=&to= (ikisi de YYYY-MM-DD, ikisi de verilmeli) — opsiyonel tarih
// aralığı. Verilmezse (varsayılan) tüm geçmiş taranır, bugüne kadar birebir
// eski davranış. Aralık verildiğinde SADECE o aralıktaki satırlar
// pencerelenir (gerçek performans kazancı), aralıktan ÖNCEKİ toplam
// ("opening" CTE) tek bir ucuz agregat sorguyla hesaplanıp her satırın
// kümülatif bakiyesine eklenir; böylece "1 Mart'taki bakiye" hâlâ o tarihe
// kadarki TÜM geçmişi doğru yansıtır, sadece Şubat ve öncesi satırlar tek
// tek pencereye dahil edilmez.
//
// ?limit=&offset= — sayfalama (varsayılan limit 50, en fazla 200). Satırlar
// en yeniden en eskiye döner (entry_date/sort_ts/source_rank/source_id DESC)
// — "Daha Fazla Yükle" ile eski satırlara doğru ilerlenir. running_balance
// yine de TÜM (from/to ile sınırlı) kayıt kümesi üzerinden doğru hesaplanır,
// sadece döndürülen SAYFA sınırlanır. `total`, aynı filtrelerle eşleşen
// TOPLAM satır sayısıdır (istemci "daha fazla var mı" diye bunu kullanır).
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

    const fromRaw = request.nextUrl.searchParams.get("from");
    const toRaw = request.nextUrl.searchParams.get("to");
    const hasDateRange = !!fromRaw && !!toRaw && ISO_DATE_RE.test(fromRaw) && ISO_DATE_RE.test(toRaw);
    const fromParam = hasDateRange ? fromRaw : null;
    const toParam = hasDateRange ? toRaw : null;

    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(request.nextUrl.searchParams.get("limit") ?? "") || DEFAULT_LIMIT));
    const offset = Math.max(0, parseInt(request.nextUrl.searchParams.get("offset") ?? "") || 0);

    const baseCte = `
      WITH combined AS (
        SELECT
          'SIPARIS'::text AS entry_type, 1 AS source_rank, op.id AS source_id,
          o.id AS ref_id, 1::smallint AS kasa_direction, op.amount::float AS amount,
          op.created_at::date AS entry_date, op.created_at AS sort_ts,
          COALESCE(o.customer_name, o.plate) AS related_account,
          ('Sipariş #' || o.id || ' ' || op.payment_type || ' Tahsilatı') AS description,
          op.kasa_id, NULL::int AS transfer_pair_id
        FROM order_payments op
        JOIN orders o ON o.id = op.order_id
        WHERE (op.payment_type = 'Nakit' OR op.kasa_id IS NOT NULL) AND o.tenant_id = $1

        UNION ALL

        SELECT
          'SIPARIS', 2, os.id,
          o.id, 1, os.unit_price::float,
          o.created_at::date, o.created_at,
          COALESCE(o.customer_name, o.plate),
          ('Sipariş #' || o.id || ' ' || os.payment_type || ' Tahsilatı'),
          os.kasa_id, NULL
        FROM order_services os
        JOIN orders o ON os.order_id = o.id
        WHERE (os.payment_type = 'Nakit' OR os.kasa_id IS NOT NULL) AND os.tenant_id = $1
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
          AND (cle.payment_type = 'Nakit' OR cle.kasa_id IS NOT NULL) AND cle.tenant_id = $1

        UNION ALL

        SELECT
          'MASRAF', 4, e.id,
          e.id, -1, e.amount::float,
          e.expense_date, e.created_at,
          e.category,
          COALESCE(e.description, ''),
          e.kasa_id, NULL
        FROM expenses e
        WHERE (e.payment_type = 'Nakit' OR e.kasa_id IS NOT NULL) AND e.tenant_id = $1

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
    `;

    const [entriesResult, totalResult, countResult, unassignedResult] = await Promise.all([
      pool.query(
        `${baseCte},
         opening AS (
           SELECT COALESCE(SUM(amount * kasa_direction), 0)::float AS balance
           FROM filtered WHERE $3::date IS NOT NULL AND entry_date < $3
         ),
         windowed AS (
           SELECT * FROM filtered
           WHERE ($3::date IS NULL OR entry_date >= $3) AND ($4::date IS NULL OR entry_date <= $4)
         )
         SELECT windowed.*, k.name AS kasa_name, pk.name AS transfer_pair_kasa_name,
           ((SELECT balance FROM opening) + SUM(windowed.amount * windowed.kasa_direction) OVER (
             ORDER BY windowed.entry_date, windowed.sort_ts, windowed.source_rank, windowed.source_id
           ))::float AS running_balance
         FROM windowed
         LEFT JOIN kasalar k ON k.id = windowed.kasa_id AND k.tenant_id = $1
         LEFT JOIN cash_ledger_entries pair_entry ON pair_entry.id = windowed.transfer_pair_id AND pair_entry.tenant_id = $1
         LEFT JOIN kasalar pk ON pk.id = pair_entry.kasa_id AND pk.tenant_id = $1
         ORDER BY windowed.entry_date DESC, windowed.sort_ts DESC, windowed.source_rank DESC, windowed.source_id DESC
         LIMIT $5 OFFSET $6`,
        [user.tenantId, kasaIdParam, fromParam, toParam, limit, offset]
      ),
      // Toplam bakiye entries listesinden (ve sayfalamadan) bağımsız
      // hesaplanır — aralık içinde hiç hareket olmasa bile (ör. boş bir ay)
      // ya da görüntülenen sayfa boş kalsa bile doğru kalması için.
      pool.query<{ balance: number }>(
        `${baseCte}
         SELECT COALESCE(SUM(amount * kasa_direction), 0)::float AS balance
         FROM filtered WHERE $3::date IS NULL OR entry_date <= $3`,
        [user.tenantId, kasaIdParam, toParam]
      ),
      // Aynı filtrelerle eşleşen TOPLAM satır sayısı — istemci "Daha Fazla
      // Yükle" gösterilsin mi diye bunu kullanır.
      pool.query<{ total: number }>(
        `${baseCte}
         SELECT COUNT(*)::int AS total FROM filtered
         WHERE ($3::date IS NULL OR entry_date >= $3) AND ($4::date IS NULL OR entry_date <= $4)`,
        [user.tenantId, kasaIdParam, fromParam, toParam]
      ),
      // "Kasa" (atanmamış) sekmesinin görünürlüğü sayfalamadan bağımsız
      // olmalı — ilk sayfada hiç atanmamış satır çıkmasa bile, geçmişte
      // (görüntülenen tarih aralığında) varsa sekme yine de gösterilmeli.
      pool.query<{ has_unassigned: boolean }>(
        `${baseCte}
         SELECT EXISTS (
           SELECT 1 FROM combined
           WHERE kasa_id IS NULL
             AND ($3::date IS NULL OR entry_date >= $3) AND ($4::date IS NULL OR entry_date <= $4)
         ) AS has_unassigned`,
        [user.tenantId, kasaIdParam, fromParam, toParam]
      ),
    ]);

    return NextResponse.json({
      balance: totalResult.rows[0].balance,
      entries: entriesResult.rows,
      total: countResult.rows[0].total,
      hasUnassigned: unassignedResult.rows[0].has_unassigned,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
