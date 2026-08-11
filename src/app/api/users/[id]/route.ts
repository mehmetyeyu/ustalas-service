import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { ALLOWED_ROLES } from "@/lib/roles";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authUser = await getAuthUser();
  if (!authUser) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (authUser.role !== "admin") return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const { id } = await params;
    const { role, password } = await request.json();

    if (role === undefined && !password) {
      return NextResponse.json({ error: "Güncellenecek bir alan gönderilmedi." }, { status: 400 });
    }
    if (role !== undefined && !ALLOWED_ROLES.includes(role)) {
      return NextResponse.json({ error: "Geçersiz rol." }, { status: 400 });
    }
    if (password && String(password).length < 6) {
      return NextResponse.json({ error: "Şifre en az 6 karakter olmalıdır." }, { status: 400 });
    }
    if (Number(id) === authUser.userId) {
      if (role !== undefined) {
        return NextResponse.json({ error: "Kendi rolünüzü değiştiremezsiniz." }, { status: 400 });
      }
      if (password) {
        return NextResponse.json(
          { error: "Kendi şifrenizi buradan değiştiremezsiniz, Profil sayfasını kullanın." },
          { status: 400 }
        );
      }
    }

    if (role !== undefined && role !== "admin") {
      const target = await pool.query("SELECT role FROM users WHERE id = $1", [id]);
      if (target.rows[0]?.role === "admin") {
        const adminCount = await pool.query(
          "SELECT COUNT(*) FROM users WHERE role = 'admin'"
        );
        if (Number(adminCount.rows[0].count) <= 1) {
          return NextResponse.json(
            { error: "Son yönetici kullanıcının rolü değiştirilemez." },
            { status: 400 }
          );
        }
      }
    }

    if (role !== undefined) {
      await pool.query("UPDATE users SET role = $1 WHERE id = $2", [role, id]);
    }
    if (password) {
      const passwordHash = await bcrypt.hash(password, 10);
      await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [passwordHash, id]);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authUser = await getAuthUser();
  if (!authUser) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (authUser.role !== "admin") return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const { id } = await params;

    if (Number(id) === authUser.userId) {
      return NextResponse.json({ error: "Kendi hesabınızı silemezsiniz." }, { status: 400 });
    }

    const target = await pool.query("SELECT role FROM users WHERE id = $1", [id]);
    if (target.rows[0]?.role === "admin") {
      const adminCount = await pool.query("SELECT COUNT(*) FROM users WHERE role = 'admin'");
      if (Number(adminCount.rows[0].count) <= 1) {
        return NextResponse.json(
          { error: "Son yönetici kullanıcı silinemez." },
          { status: 400 }
        );
      }
    }

    await pool.query("DELETE FROM users WHERE id = $1", [id]);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
