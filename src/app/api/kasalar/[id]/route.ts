import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "kasa.manage")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const { id } = await params;
    const { name } = await request.json();
    if (!name || !String(name).trim()) {
      return NextResponse.json({ error: "Kasa adı zorunludur." }, { status: 400 });
    }

    const result = await pool.query("UPDATE kasalar SET name = $1 WHERE id = $2 AND tenant_id = $3", [String(name).trim(), id, user.tenantId]);
    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Kasa bulunamadı." }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && error.code === "23505") {
      return NextResponse.json({ error: "Bu isimde bir kasa zaten var." }, { status: 400 });
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
  if (!hasPermission(user, "kasa.manage")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const { id } = await params;
    const result = await pool.query("DELETE FROM kasalar WHERE id = $1 AND tenant_id = $2", [id, user.tenantId]);
    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Kasa bulunamadı." }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    // FK RESTRICT: bu kasaya bağlı geçmiş hareket (sipariş/masraf/Cari/manuel)
    // varsa Postgres 23503 döner — kasıtlı olarak sessizce "Atanmamış"a
    // düşürülmez (bkz. plan), kullanıcıya anlaşılır bir hata gösterilir.
    if (error && typeof error === "object" && "code" in error && error.code === "23503") {
      return NextResponse.json({ error: "Bu kasaya bağlı hareketler var, silinemez." }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
