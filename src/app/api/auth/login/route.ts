import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import pool from "@/lib/db";
import { signToken } from "@/lib/auth";

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: "Kullanıcı adı ve şifre zorunludur." },
        { status: 400 }
      );
    }

    const result = await pool.query(
      "SELECT * FROM users WHERE username = $1 LIMIT 1",
      [username]
    );

    const user = result.rows[0];
    if (!user) {
      return NextResponse.json(
        { error: "Kullanıcı adı veya şifre hatalı." },
        { status: 401 }
      );
    }

    if (!user.is_active) {
      return NextResponse.json(
        { error: "Bu hesap devre dışı bırakılmış. Yöneticinizle iletişime geçin." },
        { status: 403 }
      );
    }

    // Art arda başarısız denemede hesap geçici kilitlenir (brute-force koruması).
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const remainingMin = Math.ceil(
        (new Date(user.locked_until).getTime() - Date.now()) / 60000
      );
      return NextResponse.json(
        { error: `Çok fazla başarısız deneme. ${remainingMin} dakika sonra tekrar deneyin.` },
        { status: 429 }
      );
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      const attempts = user.failed_attempts + 1;
      if (attempts >= MAX_ATTEMPTS) {
        await pool.query(
          `UPDATE users SET failed_attempts = 0,
             locked_until = NOW() + INTERVAL '${LOCK_MINUTES} minutes' WHERE id = $1`,
          [user.id]
        );
      } else {
        await pool.query("UPDATE users SET failed_attempts = $1 WHERE id = $2", [
          attempts,
          user.id,
        ]);
      }
      return NextResponse.json(
        { error: "Kullanıcı adı veya şifre hatalı." },
        { status: 401 }
      );
    }

    await pool.query(
      "UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = NOW() WHERE id = $1",
      [user.id]
    );

    const token = await signToken({
      userId: user.id,
      username: user.username,
      role: user.role,
    });

    const response = NextResponse.json({
      success: true,
      role: user.role,
      permissions: user.permissions ?? [],
    });
    response.cookies.set("auth_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      // JWT_EXPIRES_IN (lib/auth.ts) ile aynı süre olmalı, cookie ömrü token'ı
      // aşarsa geçersiz token tarayıcıda gereksiz yere tutulur.
      maxAge: 60 * 60 * 12,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Sunucu hatası oluştu." },
      { status: 500 }
    );
  }
}
