import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

// Kasa sayfasındaki "Kasaları Yönet" ile oluşturulan fiziksel kasa dizini
// (ör. "Nazım Kasa", "Sait Kasa") — suppliers'ın aksine serbest metin upsert
// değil, gerçek FK'li bir seçim listesi. Ayrı bir "kasalar" izin kaynağı YOK,
// mevcut kasa.manage izni kullanılır (bkz. src/lib/permissions.ts).
export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "kasa.view")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const result = await pool.query("SELECT id, name FROM kasalar WHERE tenant_id = $1 ORDER BY name", [user.tenantId]);
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "kasa.manage")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const { name } = await request.json();
    if (!name || !String(name).trim()) {
      return NextResponse.json({ error: "Kasa adı zorunludur." }, { status: 400 });
    }

    const result = await pool.query(
      `INSERT INTO kasalar (tenant_id, name) VALUES ($1, $2)
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
