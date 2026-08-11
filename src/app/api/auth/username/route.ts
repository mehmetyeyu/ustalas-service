import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

export async function PATCH(request: NextRequest) {
  const authUser = await getAuthUser();
  if (!authUser) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });

  try {
    const { username } = await request.json();

    if (!username || !String(username).trim()) {
      return NextResponse.json({ error: "Kullanıcı adı zorunludur." }, { status: 400 });
    }

    await pool.query("UPDATE users SET username = $1 WHERE id = $2", [
      String(username).trim(),
      authUser.userId,
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    const dbError = error as { code?: string };
    if (dbError.code === "23505") {
      return NextResponse.json({ error: "Bu kullanıcı adı zaten kullanılıyor." }, { status: 409 });
    }
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
