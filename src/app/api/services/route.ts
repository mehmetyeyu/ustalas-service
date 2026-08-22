import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });

  try {
    const result = await pool.query(
      "SELECT * FROM services WHERE tenant_id = $1 AND is_active = 1 ORDER BY name",
      [user.tenantId]
    );
    return NextResponse.json(result.rows, {
      headers: { "Cache-Control": "private, max-age=300, stale-while-revalidate=60" },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "services.create")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const { name, price } = await request.json();
    if (!name || !String(name).trim()) {
      return NextResponse.json({ error: "Hizmet adı zorunludur." }, { status: 400 });
    }
    const priceValue = price === "" || price == null ? null : Number(price);
    if (priceValue != null && (!Number.isFinite(priceValue) || priceValue < 0)) {
      return NextResponse.json({ error: "Geçersiz fiyat." }, { status: 400 });
    }

    const result = await pool.query(
      "INSERT INTO services (tenant_id, name, price) VALUES ($1, $2, $3) RETURNING id",
      [user.tenantId, String(name).trim(), priceValue]
    );
    return NextResponse.json(
      { id: result.rows[0].id, name: String(name).trim(), price: priceValue, is_active: 1 },
      { status: 201 }
    );
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && error.code === "23505") {
      return NextResponse.json({ error: "Bu isimde bir hizmet zaten mevcut." }, { status: 409 });
    }
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
