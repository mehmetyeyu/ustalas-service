import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

// Bir firmayı Aktif/Pasif yapar — bkz. src/lib/auth.ts (getAuthUserByToken)
// ve src/app/api/auth/login/route.ts: is_active=false olan bir firmanın
// TÜM kullanıcıları (mevcut oturumları dahil) anında erişimi kaybeder.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user || user.role !== "super_admin") return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const { id } = await params;
    const { is_active } = await request.json();
    if (typeof is_active !== "boolean") {
      return NextResponse.json({ error: "Geçersiz durum." }, { status: 400 });
    }

    // is_platform = false koşulu, dahili Platform kaydının bu uçtan
    // yanlışlıkla pasifleştirilmesini engeller (savunma amaçlı — panel zaten
    // bu kaydı hiç listelemiyor).
    const result = await pool.query(
      "UPDATE tenants SET is_active = $1 WHERE id = $2 AND is_platform = false",
      [is_active, id]
    );
    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Firma bulunamadı." }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
