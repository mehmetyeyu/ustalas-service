import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

// Sipariş ekranındaki "Lastik Satışı" akışı için: seçilen tedarikçide stoğu
// olan (stock_qty > 0) ürün kodlarının listesi.
export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });

  const supplier = new URL(request.url).searchParams.get("supplier");
  if (!supplier || !supplier.trim()) return NextResponse.json([]);

  try {
    const result = await pool.query(
      `SELECT DISTINCT code FROM products WHERE supplier = $1 AND stock_qty > 0 ORDER BY code`,
      [supplier.trim()]
    );
    return NextResponse.json(result.rows.map((r) => r.code));
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
