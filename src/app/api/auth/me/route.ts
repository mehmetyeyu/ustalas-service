import { NextResponse } from "next/server";
import pool from "@/lib/db";
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
  // panel_logo_url ayarlanmışsa header'da business_name metni yerine bu
  // gösterilir (bkz. admin/layout.tsx) — tenants tablosunda (app_settings
  // değil), tek kolonluk ayrı ama yine ucuz bir sorgu.
  const panelLogoResult = await pool.query<{ panel_logo_url: string | null }>(
    "SELECT panel_logo_url FROM tenants WHERE id = $1",
    [user.tenantId]
  );
  return NextResponse.json({
    username: user.username, role: user.role, permissions: user.permissions ?? [], business_name,
    panel_logo_url: panelLogoResult.rows[0]?.panel_logo_url ?? null,
    billing_status: user.billingStatus ?? null, trial_ends_at: user.trialEndsAt ?? null, plan: user.plan ?? null,
    billing_cancel_at_period_end: user.billingCancelAtPeriodEnd ?? false, billing_period_ends_at: user.billingPeriodEndsAt ?? null,
    billing_last_payment_error: user.billingLastPaymentError ?? null,
  });
}
