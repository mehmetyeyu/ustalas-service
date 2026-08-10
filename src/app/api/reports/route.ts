import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()));
  const month = parseInt(searchParams.get("month") || String(new Date().getMonth() + 1));

  try {
    // Rapor tarihi, ödemenin alındığı gün (payment_date) değil, hizmetin GİRİLDİĞİ
    // gündür (created_at) — bir hizmet Temmuz'da girilip parası Ağustos'ta alınsa
    // bile Temmuz cirosu/maliyeti olarak sayılır. Ciro (sipariş bazlı, indirim
    // dahil) ve Maliyet (işlem/satır bazlı) ayrı sorgularla toplanır — tek sorguda
    // JOIN edilirse sipariş çok satırlıysa ciro çoklanır (fan-out).
    // NOT: Tarih doğrudan metin (::text) olarak alınır. Postgres DATE değerini JS
    // Date nesnesine çevirip .toISOString() ile geri metne dökmek, sunucu UTC'nin
    // doğusundaki bir saat diliminde (Europe/Istanbul, UTC+3) çalışıyorsa günü bir
    // gün geriye kaydırıyordu (ör. bugünün verisi bir önceki günde görünüyordu).
    // Statüye bakılmaz (BEKLEMEDE dahil tüm siparişler sayılır) — stok zaten
    // statüden bağımsız düşüldüğü için rakamlar da statüden bağımsız yansır;
    // paid_amount BEKLEMEDE'de hep NULL olduğundan otomatik total_amount'a döner.
    const dailyCiroResult = await pool.query(
      `SELECT
         ((created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul')::date)::text AS date,
         SUM(COALESCE(paid_amount, total_amount))::float AS ciro
       FROM orders
       WHERE EXTRACT(year FROM created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul') = $1
         AND EXTRACT(month FROM created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul') = $2
       GROUP BY date`,
      [year, month]
    );
    const dailyMaliyetResult = await pool.query(
      `SELECT
         ((o.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul')::date)::text AS date,
         SUM(COALESCE(os.cost_price, 0))::float AS maliyet
       FROM order_services os
       JOIN orders o ON os.order_id = o.id
       WHERE EXTRACT(year FROM o.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul') = $1
         AND EXTRACT(month FROM o.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul') = $2
       GROUP BY date`,
      [year, month]
    );

    // Her siparişin en az bir order_services satırı olduğundan, maliyet
    // sonuçlarındaki her tarih zaten ciro sonuçlarında da vardır.
    const maliyetByDate = new Map(
      dailyMaliyetResult.rows.map((r: { date: string; maliyet: number }) => [r.date, r.maliyet])
    );
    const dailyData = dailyCiroResult.rows
      .map((r: { date: string; ciro: number }) => ({
        date: r.date,
        ciro: r.ciro,
        maliyet: maliyetByDate.get(r.date) ?? 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Hizmet Dağılımı: sadece adet değil, o hizmetten gelen Ciro/Maliyet/Kâr da
    // gösterilir — "Bijon'dan ne kadar kazandım" gibi sorulara pasta grafik tek
    // başına cevap vermiyordu.
    const serviceStatsResult = await pool.query(
      `SELECT
         s.name,
         COUNT(os.service_id)::int AS count,
         COALESCE(SUM(os.unit_price), 0)::float AS ciro,
         COALESCE(SUM(os.cost_price), 0)::float AS maliyet
       FROM order_services os
       JOIN services s ON os.service_id = s.id
       JOIN orders o ON os.order_id = o.id
       WHERE EXTRACT(year FROM o.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul') = $1
         AND EXTRACT(month FROM o.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul') = $2
       GROUP BY s.name
       ORDER BY count DESC`,
      [year, month]
    );

    // total_orders/completed/pending artık created_at'e göre sayılır — önceden
    // payment_date'e göre filtrelendiği için BEKLEMEDE siparişler (payment_date
    // hiç set edilmediğinden NULL) hiçbir ayda görünmüyordu. total_revenue
    // statüye bakmadan tüm siparişleri sayar (BEKLEMEDE'de paid_amount NULL
    // olduğundan otomatik total_amount'a döner) — completed/pending sayıları
    // yine bilgi amaçlı ayrıca gösterilir.
    const summaryResult = await pool.query(
      `SELECT
         COUNT(*)::int AS total_orders,
         COALESCE(SUM(COALESCE(paid_amount, total_amount)), 0)::float AS total_revenue,
         COUNT(CASE WHEN status = 'TAMAMLANDI' THEN 1 END)::int AS completed,
         COUNT(CASE WHEN status = 'BEKLEMEDE' THEN 1 END)::int AS pending
       FROM orders
       WHERE EXTRACT(year FROM created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul') = $1
         AND EXTRACT(month FROM created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul') = $2`,
      [year, month]
    );

    // Ödeme tipi serbest metin olduğu için (Nakit/POS/Cari/Fatura Edildi./Excel'den
    // gelen Mail Order hesapları vb.) sabit kategoriler yerine dinamik kırılım.
    // "Ödeme Al & Kapat" ile kapatılan siparişlerde asıl kaynak order_payments'tır
    // (parçalı ödeme — bkz. PATCH /api/orders/:id); order_payments kaydı olmayan
    // (Excel'den içe aktarılmış, eski) siparişlerde satır bazlı
    // order_services.payment_type'a geri düşülür — bir sipariş iki kaynaktan
    // birden sayılmaz (NOT EXISTS ile ayrıştırılır). Statüye bakılmaz.
    const paymentBreakdownResult = await pool.query(
      `SELECT payment_type, COALESCE(SUM(total), 0)::float AS total
       FROM (
         SELECT op.payment_type AS payment_type, op.amount AS total
         FROM order_payments op
         JOIN orders o ON o.id = op.order_id
         WHERE EXTRACT(year FROM o.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul') = $1
           AND EXTRACT(month FROM o.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul') = $2

         UNION ALL

         SELECT COALESCE(os.payment_type, 'Belirtilmemiş') AS payment_type, os.unit_price AS total
         FROM order_services os
         JOIN orders o ON os.order_id = o.id
         WHERE NOT EXISTS (SELECT 1 FROM order_payments op2 WHERE op2.order_id = o.id)
           AND EXTRACT(year FROM o.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul') = $1
           AND EXTRACT(month FROM o.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul') = $2
       ) combined
       GROUP BY payment_type
       ORDER BY total DESC`,
      [year, month]
    );

    return NextResponse.json({
      dailyData,
      serviceStats: serviceStatsResult.rows,
      summary: summaryResult.rows[0],
      paymentBreakdown: paymentBreakdownResult.rows,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
