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
    const dailyRevenueResult = await pool.query(
      `SELECT
         EXTRACT(day FROM payment_date) AS day,
         SUM(total_amount) AS revenue
       FROM orders
       WHERE status = 'TAMAMLANDI'
         AND EXTRACT(year FROM payment_date) = $1
         AND EXTRACT(month FROM payment_date) = $2
       GROUP BY EXTRACT(day FROM payment_date)
       ORDER BY day`,
      [year, month]
    );

    const serviceStatsResult = await pool.query(
      `SELECT
         s.name,
         COUNT(os.service_id) AS count
       FROM order_services os
       JOIN services s ON os.service_id = s.id
       JOIN orders o ON os.order_id = o.id
       WHERE o.status = 'TAMAMLANDI'
         AND EXTRACT(year FROM o.payment_date) = $1
         AND EXTRACT(month FROM o.payment_date) = $2
       GROUP BY s.name
       ORDER BY count DESC`,
      [year, month]
    );

    const summaryResult = await pool.query(
      `SELECT
         COUNT(*) AS total_orders,
         SUM(CASE WHEN status = 'TAMAMLANDI' THEN total_amount ELSE 0 END) AS total_revenue,
         SUM(CASE WHEN status = 'TAMAMLANDI' AND payment_type = 'NAKIT' THEN total_amount ELSE 0 END) AS nakit,
         SUM(CASE WHEN status = 'TAMAMLANDI' AND payment_type = 'KREDI_KARTI' THEN total_amount ELSE 0 END) AS kredi_karti,
         SUM(CASE WHEN status = 'TAMAMLANDI' AND payment_type = 'HAVALE' THEN total_amount ELSE 0 END) AS havale,
         SUM(CASE WHEN status = 'TAMAMLANDI' THEN 1 ELSE 0 END) AS completed,
         SUM(CASE WHEN status = 'BEKLEMEDE' THEN 1 ELSE 0 END) AS pending
       FROM orders
       WHERE EXTRACT(year FROM created_at) = $1
         AND EXTRACT(month FROM created_at) = $2`,
      [year, month]
    );

    return NextResponse.json({
      dailyRevenue: dailyRevenueResult.rows,
      serviceStats: serviceStatsResult.rows,
      summary: summaryResult.rows[0],
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
