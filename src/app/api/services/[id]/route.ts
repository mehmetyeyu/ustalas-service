import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "services.edit")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const { id } = await params;
    const { name, price, is_active, bookable, duration_minutes } = await request.json();
    if (!name || !String(name).trim()) {
      return NextResponse.json({ error: "Hizmet adı zorunludur." }, { status: 400 });
    }
    const priceValue = price === "" || price == null ? null : Number(price);
    if (priceValue != null && (!Number.isFinite(priceValue) || priceValue < 0)) {
      return NextResponse.json({ error: "Geçersiz fiyat." }, { status: 400 });
    }
    const durationValue = duration_minutes === "" || duration_minutes == null ? null : Number(duration_minutes);
    if (durationValue != null && (!Number.isFinite(durationValue) || durationValue <= 0)) {
      return NextResponse.json({ error: "Geçersiz süre." }, { status: 400 });
    }
    const result = await pool.query(
      "UPDATE services SET name = $1, price = $2, is_active = $3, bookable = $4, duration_minutes = $5 WHERE id = $6 AND tenant_id = $7",
      [String(name).trim(), priceValue, is_active ? 1 : 0, !!bookable, durationValue, id, user.tenantId]
    );
    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Hizmet bulunamadı." }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && error.code === "23505") {
      return NextResponse.json({ error: "Bu isimde bir hizmet zaten mevcut." }, { status: 409 });
    }
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "services.delete")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const { id } = await params;
    const result = await pool.query("UPDATE services SET is_active = 0 WHERE id = $1 AND tenant_id = $2", [id, user.tenantId]);
    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Hizmet bulunamadı." }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
