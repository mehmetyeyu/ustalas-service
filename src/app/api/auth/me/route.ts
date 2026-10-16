import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getSessionSettings } from "@/lib/settings";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  // Firma adı/logo (header, bkz. admin/layout.tsx — paylaşılan deploymentta
  // her firma kendi adını görür), Sipariş No/Plaka zorunluluğu ("/" ekranı ve
  // admin-only /api/settings'i çağıramayan personel için), ödeme tipleri,
  // depolama gecikme eşiği ve siparişlerin varsayılan tarih filtresi — hepsi
  // tek sorguda (bkz. getSessionSettings). İstemci bunları AuthContext
  // store'unda tutar, sayfalar ayrıca istek atmaz.
  const settings = await getSessionSettings(user.tenantId!);
  return NextResponse.json({
    username: user.username, role: user.role, permissions: user.permissions ?? [],
    billing_status: user.billingStatus ?? null, trial_ends_at: user.trialEndsAt ?? null, plan: user.plan ?? null,
    billing_cancel_at_period_end: user.billingCancelAtPeriodEnd ?? false, billing_period_ends_at: user.billingPeriodEndsAt ?? null,
    billing_last_payment_error: user.billingLastPaymentError ?? null,
    is_primary_admin: user.isPrimaryAdmin ?? false, onboarding_tour_completed_at: user.onboardingTourCompletedAt ?? null,
    ui_version: user.uiVersion ?? "v1", ui_theme: user.uiTheme ?? "system", ui_v2_available: user.uiV2Available ?? false,
    ...settings,
  });
}
