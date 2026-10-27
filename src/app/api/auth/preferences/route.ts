import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { UI_PREF_COOKIE, uiPrefCookieOptions, uiPrefCookieValue } from "@/lib/uiThemeBoot";
import { resolveUiVersion, selectableUiVersions } from "@/lib/uiVersion";

// Panel görünümü tercihleri (bkz. database/schema.sql ui_version notu):
// ui_version ve ui_theme ('system' | 'light' | 'dark'). Kullanıcı başına
// saklanır, her cihazda geçerli olur. Seçilebilen sürümler: güncel sürüm ve
// (users.ui_beta_version ile erişimi açılmışsa) sonraki sürüm — emekli
// sürüme (v1) dönülemez (bkz. src/lib/uiVersion.ts).
export async function PATCH(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });

  const body = (await request.json().catch(() => null)) ?? {};
  const uiVersion = body.ui_version;
  const uiTheme = body.ui_theme;

  if (uiVersion !== undefined && !selectableUiVersions(user.uiBetaVersion ?? null).includes(uiVersion)) {
    return NextResponse.json({ error: "Bu görünüm seçilemez." }, { status: 400 });
  }
  if (uiTheme !== undefined && uiTheme !== "system" && uiTheme !== "light" && uiTheme !== "dark") {
    return NextResponse.json({ error: "Geçersiz tema." }, { status: 400 });
  }
  if (uiVersion === undefined && uiTheme === undefined) {
    return NextResponse.json({ error: "Değiştirilecek bir tercih yok." }, { status: 400 });
  }

  try {
    const result = await pool.query<{ ui_version: string; ui_theme: string }>(
      `UPDATE users SET ui_version = COALESCE($1, ui_version), ui_theme = COALESCE($2, ui_theme)
       WHERE id = $3 RETURNING ui_version, ui_theme`,
      [uiVersion ?? null, uiTheme ?? null, user.userId]
    );
    const response = NextResponse.json({ success: true });
    // Açılış betiğinin okuduğu çerez kopyası da güncellenir (bkz. src/lib/uiThemeBoot.ts).
    const row = result.rows[0];
    if (row) {
      const version = resolveUiVersion(row.ui_version, user.uiBetaVersion ?? null);
      response.cookies.set(UI_PREF_COOKIE, uiPrefCookieValue(version, row.ui_theme), uiPrefCookieOptions());
    }
    return response;
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
