import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

export async function GET() {
  try {
    const result = await pool.query(
      "SELECT * FROM services WHERE is_active = 1 ORDER BY name"
    );
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });

  try {
    const { name, price } = await request.json();
    if (!name || price == null) {
      return NextResponse.json({ error: "Ad ve fiyat zorunludur." }, { status: 400 });
    }

    const result = await pool.query(
      "INSERT INTO services (name, price) VALUES ($1, $2) RETURNING id",
      [name, price]
    );
    return NextResponse.json({ id: result.rows[0].id, name, price, is_active: 1 }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
