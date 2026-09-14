import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getBusinessName } from "@/lib/settings";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  // Header/nav'daki marka metni (bkz. admin/layout.tsx) — sabit kodlanmış bir
  // logo yerine firmanın kendi işletme adı gösterilir, çünkü paylaşılan
  // deploymentta artık birden fazla firma (tenant) aynı panele giriyor. Bu uç
  // çok sık çağrıldığından (her admin sayfası mount'unda) getAppSettings()'in
  // 22 kolonluk sorgusu yerine tek kolonluk ucuz bir sorgu kullanılıyor.
  const business_name = await getBusinessName(user.tenantId!);
  return NextResponse.json({
    username: user.username, role: user.role, permissions: user.permissions ?? [], business_name,
    billing_status: user.billingStatus ?? null, trial_ends_at: user.trialEndsAt ?? null, plan: user.plan ?? null,
    billing_cancel_at_period_end: user.billingCancelAtPeriodEnd ?? false, billing_period_ends_at: user.billingPeriodEndsAt ?? null,
  });
}
