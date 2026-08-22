import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { ALLOWED_ROLES } from "@/lib/roles";
import { isValidPermissionKey } from "@/lib/permissions";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const result = await pool.query(
      `SELECT id, username, role, permissions, is_primary_admin, created_at, last_login_at, is_active,
              locked_until, failed_attempts
       FROM users ORDER BY created_at`
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
  if (user.role !== "admin") return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const { username, password, role, permissions } = await request.json();

    if (!username || !String(username).trim()) {
      return NextResponse.json({ error: "Kullanıcı adı zorunludur." }, { status: 400 });
    }
    if (!password || String(password).length < 6) {
      return NextResponse.json({ error: "Şifre en az 6 karakter olmalıdır." }, { status: 400 });
    }
    if (!ALLOWED_ROLES.includes(role)) {
      return NextResponse.json({ error: "Geçersiz rol." }, { status: 400 });
    }
    // permissions sadece staff için anlamlı — admin zaten her zaman tam
    // yetkili, gönderilse bile yoksayılır (boş dizi yazılır).
    let perms: string[] = [];
    if (role === "staff" && Array.isArray(permissions)) {
      if (!permissions.every((p) => typeof p === "string" && isValidPermissionKey(p))) {
        return NextResponse.json({ error: "Geçersiz izin." }, { status: 400 });
      }
      perms = permissions;
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (username, password_hash, role, permissions)
       VALUES ($1, $2, $3, $4)
       RETURNING id, username, role, permissions, created_at`,
      [String(username).trim(), passwordHash, role, perms]
    );
    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    const dbError = error as { code?: string };
    if (dbError.code === "23505") {
      return NextResponse.json({ error: "Bu kullanıcı adı zaten kullanılıyor." }, { status: 409 });
    }
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
