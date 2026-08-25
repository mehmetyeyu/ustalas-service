import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

// Push bildirimleri panelin genelini ilgilendiriyor (sadece admin değil,
// appointments.view yetkisi olan herhangi bir personel) — badge poll'unun
// (admin/layout.tsx) kullandığı aynı yetki kontrolü.
function canSubscribe(user: { role: string; permissions?: string[] | null }): boolean {
  return user.role === "admin" || hasPermission(user, "appointments.view");
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!canSubscribe(user)) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const body = await request.json();
    const endpoint = String(body?.endpoint ?? "");
    const p256dh = String(body?.keys?.p256dh ?? "");
    const auth = String(body?.keys?.auth ?? "");
    const userAgent = request.headers.get("user-agent")?.slice(0, 255) ?? null;

    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json({ error: "Geçersiz abonelik verisi." }, { status: 400 });
    }

    // endpoint global olarak benzersiz (tarayıcının push servisinin ürettiği
    // URL) — aynı tarayıcı/cihaz yeniden abone olursa (ör. anahtarlar
    // temizlenip tekrar oluşturulursa) yeni satır eklemek yerine güncelliyor.
    await pool.query(
      `INSERT INTO push_subscriptions (tenant_id, user_id, endpoint, p256dh, auth, user_agent, last_used_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (endpoint) DO UPDATE
         SET tenant_id = $1, user_id = $2, p256dh = $4, auth = $5, user_agent = $6, last_used_at = NOW()`,
      [user.tenantId, user.userId, endpoint, p256dh, auth, userAgent]
    );

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });

  try {
    const body = await request.json();
    const endpoint = String(body?.endpoint ?? "");
    if (!endpoint) return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });

    // Sadece kendi aboneliğini silebilir — tenant/user eşleşmesi.
    await pool.query(
      "DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2 AND tenant_id = $3",
      [endpoint, user.userId, user.tenantId]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
