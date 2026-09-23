import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getAuditLog } from "@/lib/auditLog";

// Kullanıcılar/Genel Ayarlar ile aynı desende __admin_only__ — staff'a hiç
// devredilemez (bkz. src/lib/permissions.ts PAGE_RESOURCE).
export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "30")));

  try {
    const { items, total } = await getAuditLog(user.tenantId!, { page, limit });
    return NextResponse.json({ items, total, page, limit });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
