import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { getAppSettings } from "@/lib/settings";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  const settings = await getAppSettings();
  return NextResponse.json(settings);
}

export async function PUT(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const body = await request.json();
    const business_name = String(body.business_name ?? "").trim();
    const storage_overdue_months = Number(body.storage_overdue_months);

    if (!business_name) {
      return NextResponse.json({ error: "İşletme adı zorunludur." }, { status: 400 });
    }
    if (!Number.isInteger(storage_overdue_months) || storage_overdue_months < 1 || storage_overdue_months > 60) {
      return NextResponse.json({ error: "Depo bekleme uyarı eşiği 1-60 ay arasında olmalıdır." }, { status: 400 });
    }

    await pool.query(
      `UPDATE app_settings SET business_name=$1, storage_overdue_months=$2, updated_at=CURRENT_TIMESTAMP WHERE id=1`,
      [business_name, storage_overdue_months]
    );

    return NextResponse.json({ business_name, storage_overdue_months });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
