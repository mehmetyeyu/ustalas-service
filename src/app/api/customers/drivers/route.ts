import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

// Sipariş formundaki "Aracı Getiren" öneri listesi — bu müşterinin
// siparişlerinde daha önce yazılmış kişiler (en son gelen önce). Sipariş
// formu herkese açık olduğundan (bkz. GET /api/customers, telefonlar orada
// da döner) özel izin istenmez.
export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });

  const name = String(request.nextUrl.searchParams.get("customer") ?? "").trim();
  if (!name) return NextResponse.json([]);
  try {
    const result = await pool.query(
      `SELECT DISTINCT ON (lower(driver_name)) driver_name AS name, driver_phone AS phone, created_at
       FROM orders
       WHERE tenant_id = $1 AND customer_name = $2 AND driver_name IS NOT NULL AND driver_name <> ''
       ORDER BY lower(driver_name), created_at DESC`,
      [user.tenantId, name]
    );
    const rows = result.rows
      .sort((a, b) => (b.created_at > a.created_at ? 1 : -1))
      .slice(0, 30)
      .map(({ name, phone }) => ({ name, phone }));
    return NextResponse.json(rows);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
