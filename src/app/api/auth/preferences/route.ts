import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

// Panel görünümü tercihleri (bkz. database/schema.sql ui_version notu):
// ui_version ('v1' | 'v2') ve ui_theme ('system' | 'light' | 'dark').
// Kullanıcı başına saklanır, her cihazda geçerli olur. Yeni görünüme (v2)
// sadece ui_v2_available açık olan kullanıcı geçebilir — kademeli açılış;
// eskiye dönüş (v1) her zaman serbest.
export async function PATCH(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });

  const body = (await request.json().catch(() => null)) ?? {};
  const uiVersion = body.ui_version;
  const uiTheme = body.ui_theme;

  if (uiVersion !== undefined && uiVersion !== "v1" && uiVersion !== "v2") {
    return NextResponse.json({ error: "Geçersiz görünüm." }, { status: 400 });
  }
  if (uiTheme !== undefined && uiTheme !== "system" && uiTheme !== "light" && uiTheme !== "dark") {
    return NextResponse.json({ error: "Geçersiz tema." }, { status: 400 });
  }
  if (uiVersion === undefined && uiTheme === undefined) {
    return NextResponse.json({ error: "Değiştirilecek bir tercih yok." }, { status: 400 });
  }
  if (uiVersion === "v2" && !user.uiV2Available) {
    return NextResponse.json({ error: "Yeni görünüm bu hesap için henüz açık değil." }, { status: 403 });
  }

  try {
    await pool.query(
      `UPDATE users SET ui_version = COALESCE($1, ui_version), ui_theme = COALESCE($2, ui_theme)
       WHERE id = $3`,
      [uiVersion ?? null, uiTheme ?? null, user.userId]
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
