import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { RowDataPacket } from "mysql2";

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()));
  const month = parseInt(searchParams.get("month") || String(new Date().getMonth() + 1));

  try {
    // Günlük gelir
    const [dailyRevenue] = await pool.query<RowDataPacket[]>(
      `SELECT
         DAY(payment_date) AS day,
         SUM(total_amount) AS revenue
       FROM orders
       WHERE status = 'TAMAMLANDI'
         AND YEAR(payment_date) = ?
         AND MONTH(payment_date) = ?
       GROUP BY DAY(payment_date)
       ORDER BY day`,
      [year, month]
    );

    // Hizmet dağılımı
    const [serviceStats] = await pool.query<RowDataPacket[]>(
      `SELECT
         s.name,
         COUNT(os.service_id) AS count
       FROM order_services os
       JOIN services s ON os.service_id = s.id
       JOIN orders o ON os.order_id = o.id
       WHERE o.status = 'TAMAMLANDI'
         AND YEAR(o.payment_date) = ?
         AND MONTH(o.payment_date) = ?
       GROUP BY s.name
       ORDER BY count DESC`,
      [year, month]
    );

    // Özet
    const [summary] = await pool.query<RowDataPacket[]>(
      `SELECT
         COUNT(*) AS total_orders,
         SUM(CASE WHEN status = 'TAMAMLANDI' THEN total_amount ELSE 0 END) AS total_revenue,
         SUM(CASE WHEN status = 'TAMAMLANDI' AND payment_type = 'NAKIT' THEN total_amount ELSE 0 END) AS nakit,
         SUM(CASE WHEN status = 'TAMAMLANDI' AND payment_type = 'KREDI_KARTI' THEN total_amount ELSE 0 END) AS kredi_karti,
         SUM(CASE WHEN status = 'TAMAMLANDI' AND payment_type = 'HAVALE' THEN total_amount ELSE 0 END) AS havale,
         SUM(CASE WHEN status = 'TAMAMLANDI' THEN 1 ELSE 0 END) AS completed,
         SUM(CASE WHEN status = 'BEKLEMEDE' THEN 1 ELSE 0 END) AS pending
       FROM orders
       WHERE YEAR(created_at) = ?
         AND MONTH(created_at) = ?`,
      [year, month]
    );

    return NextResponse.json({
      dailyRevenue,
      serviceStats,
      summary: summary[0],
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
