import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getAppSettings } from "@/lib/settings";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  // Header/nav'daki marka metni (bkz. admin/layout.tsx) — sabit kodlanmış bir
  // logo yerine firmanın kendi işletme adı gösterilir, çünkü paylaşılan
  // deploymentta artık birden fazla firma (tenant) aynı panele giriyor.
  const { business_name } = await getAppSettings(user.tenantId!);
  return NextResponse.json({ username: user.username, role: user.role, permissions: user.permissions ?? [], business_name });
}
