import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

// Sipariş oluşturma ekranındaki Tedarikçi alanı için dizin listesi. Nadiren
// değişen bir liste olduğundan uzun cache'lenir (yeni bir tedarikçi eklense
// bile otomatik tamamlamada elle yazmak her zaman çalışır — bkz. src/lib/directories.ts).
export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });

  try {
    const result = await pool.query("SELECT id, name FROM suppliers WHERE tenant_id = $1 ORDER BY name", [user.tenantId]);
    return NextResponse.json(result.rows, {
      headers: { "Cache-Control": "private, max-age=3600, stale-while-revalidate=86400" },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "suppliers.create")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const { name } = await request.json();
    if (!name || !String(name).trim()) {
      return NextResponse.json({ error: "Tedarikçi adı zorunludur." }, { status: 400 });
    }

    const result = await pool.query(
      `INSERT INTO suppliers (tenant_id, name) VALUES ($1, $2)
       ON CONFLICT (tenant_id, name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id, name`,
      [user.tenantId, String(name).trim()]
    );
    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
