import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { ALLOWED_ROLES } from "@/lib/roles";
import { isValidPermissionKey } from "@/lib/permissions";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authUser = await getAuthUser();
  if (!authUser) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (authUser.role !== "admin") return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const { id } = await params;
    const { role, password, username, unlock, forceLogout, isActive, permissions } = await request.json();

    if (
      role === undefined &&
      !password &&
      username === undefined &&
      !unlock &&
      !forceLogout &&
      isActive === undefined &&
      permissions === undefined
    ) {
      return NextResponse.json({ error: "Güncellenecek bir alan gönderilmedi." }, { status: 400 });
    }
    if (role !== undefined && !ALLOWED_ROLES.includes(role)) {
      return NextResponse.json({ error: "Geçersiz rol." }, { status: 400 });
    }
    if (
      permissions !== undefined &&
      (!Array.isArray(permissions) || !permissions.every((p) => typeof p === "string" && isValidPermissionKey(p)))
    ) {
      return NextResponse.json({ error: "Geçersiz izin." }, { status: 400 });
    }
    if (password && String(password).length < 6) {
      return NextResponse.json({ error: "Şifre en az 6 karakter olmalıdır." }, { status: 400 });
    }
    if (username !== undefined && !String(username).trim()) {
      return NextResponse.json({ error: "Kullanıcı adı zorunludur." }, { status: 400 });
    }
    // Hedef kullanıcı gerçekten bu firmaya mı ait — bir tenant'ın admin'i
    // başka bir tenant'ın kullanıcısını id tahmin ederek düzenleyemesin diye.
    const ownershipCheck = await pool.query("SELECT id FROM users WHERE id = $1 AND tenant_id = $2", [id, authUser.tenantId]);
    if (ownershipCheck.rowCount === 0) {
      return NextResponse.json({ error: "Kullanıcı bulunamadı." }, { status: 404 });
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
      if (username !== undefined) {
        return NextResponse.json(
          { error: "Kendi kullanıcı adınızı buradan değiştiremezsiniz, Profil sayfasını kullanın." },
          { status: 400 }
        );
      }
      if (forceLogout) {
        return NextResponse.json({ error: "Kendi oturumunuzu buradan sonlandıramazsınız." }, { status: 400 });
      }
      if (isActive === false) {
        return NextResponse.json({ error: "Kendi hesabınızı devre dışı bırakamazsınız." }, { status: 400 });
      }
    } else {
      // Ana admin hesabı — kendisi dışında (yukarıdaki self-koruma zaten
      // kendisinin kendine yapabileceklerini kısıtlıyor) hiç kimse bu hesap
      // üzerinde hiçbir alanı değiştiremez.
      const primaryCheck = await pool.query("SELECT is_primary_admin FROM users WHERE id = $1 AND tenant_id = $2", [id, authUser.tenantId]);
      if (primaryCheck.rows[0]?.is_primary_admin) {
        return NextResponse.json({ error: "Ana admin hesabı başka bir kullanıcı tarafından değiştirilemez." }, { status: 403 });
      }
    }

    if (
      (role !== undefined && role !== "admin") ||
      isActive === false
    ) {
      const target = await pool.query("SELECT role FROM users WHERE id = $1 AND tenant_id = $2", [id, authUser.tenantId]);
      const willLoseAdmin =
        target.rows[0]?.role === "admin" && ((role !== undefined && role !== "admin") || isActive === false);
      if (willLoseAdmin) {
        // Bu sayım firma-bazlı olmalı — aksi halde başka bir firmanın admin
        // sayısı bu firmanın "son admin" kararını (yanlışlıkla) etkilerdi.
        const adminCount = await pool.query(
          "SELECT COUNT(*) FROM users WHERE role = 'admin' AND is_active = true AND tenant_id = $1",
          [authUser.tenantId]
        );
        if (Number(adminCount.rows[0].count) <= 1) {
          return NextResponse.json(
            {
              error:
                role !== undefined
                  ? "Son yönetici kullanıcının rolü değiştirilemez."
                  : "Son yönetici kullanıcı devre dışı bırakılamaz.",
            },
            { status: 400 }
          );
        }
      }
    }

    if (role !== undefined) {
      await pool.query("UPDATE users SET role = $1 WHERE id = $2 AND tenant_id = $3", [role, id, authUser.tenantId]);
    }
    if (password) {
      const passwordHash = await bcrypt.hash(password, 10);
      await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2 AND tenant_id = $3", [passwordHash, id, authUser.tenantId]);
    }
    if (username !== undefined) {
      await pool.query("UPDATE users SET username = $1 WHERE id = $2 AND tenant_id = $3", [String(username).trim(), id, authUser.tenantId]);
    }
    if (unlock) {
      await pool.query(
        "UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = $1 AND tenant_id = $2",
        [id, authUser.tenantId]
      );
    }
    if (forceLogout) {
      await pool.query("UPDATE users SET tokens_invalid_before = NOW() WHERE id = $1 AND tenant_id = $2", [id, authUser.tenantId]);
    }
    if (isActive !== undefined) {
      await pool.query("UPDATE users SET is_active = $1 WHERE id = $2 AND tenant_id = $3", [isActive, id, authUser.tenantId]);
    }
    if (permissions !== undefined) {
      await pool.query("UPDATE users SET permissions = $1 WHERE id = $2 AND tenant_id = $3", [permissions, id, authUser.tenantId]);
    }

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

    const target = await pool.query("SELECT role, is_primary_admin FROM users WHERE id = $1 AND tenant_id = $2", [id, authUser.tenantId]);
    if (target.rows.length === 0) {
      return NextResponse.json({ error: "Kullanıcı bulunamadı." }, { status: 404 });
    }
    if (target.rows[0]?.is_primary_admin) {
      return NextResponse.json({ error: "Ana admin hesabı silinemez." }, { status: 403 });
    }
    if (target.rows[0]?.role === "admin") {
      const adminCount = await pool.query(
        "SELECT COUNT(*) FROM users WHERE role = 'admin' AND is_active = true AND tenant_id = $1",
        [authUser.tenantId]
      );
      if (Number(adminCount.rows[0].count) <= 1) {
        return NextResponse.json(
          { error: "Son yönetici kullanıcı silinemez." },
          { status: 400 }
        );
      }
    }

    await pool.query("DELETE FROM users WHERE id = $1 AND tenant_id = $2", [id, authUser.tenantId]);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
