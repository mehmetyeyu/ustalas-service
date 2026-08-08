import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

// Sipariş ekranındaki "Lastik Satışı" akışı için: stoğu olan (stock_qty > 0)
// en az bir parti bulunan tedarikçilerin listesi.
export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });

  try {
    const result = await pool.query(
      `SELECT DISTINCT supplier FROM products WHERE supplier IS NOT NULL AND supplier <> '' AND stock_qty > 0 ORDER BY supplier`
    );
    return NextResponse.json(result.rows.map((r) => r.supplier));
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
