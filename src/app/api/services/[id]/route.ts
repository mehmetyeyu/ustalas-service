import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const { id } = await params;
    const { name, price, is_active } = await request.json();
    if (!name || !String(name).trim()) {
      return NextResponse.json({ error: "Hizmet adı zorunludur." }, { status: 400 });
    }
    const priceValue = price === "" || price == null ? null : Number(price);
    if (priceValue != null && (!Number.isFinite(priceValue) || priceValue < 0)) {
      return NextResponse.json({ error: "Geçersiz fiyat." }, { status: 400 });
    }
    await pool.query(
      "UPDATE services SET name = $1, price = $2, is_active = $3 WHERE id = $4",
      [String(name).trim(), priceValue, is_active ? 1 : 0, id]
    );
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
  if (user.role !== "admin") return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const { id } = await params;
    await pool.query("UPDATE services SET is_active = 0 WHERE id = $1", [id]);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
