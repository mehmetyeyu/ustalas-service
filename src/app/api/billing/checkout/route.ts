import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { trialDaysLeft } from "@/lib/billing";
import { buildCustomerFromTenant, initializeCheckoutForm } from "@/lib/iyzico";

const PLAN_REFS: Record<string, string | undefined> = {
  monthly: process.env.IYZICO_PLAN_MONTHLY_REF,
  yearly: process.env.IYZICO_PLAN_YEARLY_REF,
};

// Abonelik başlatır (bkz. plan) — sadece admin (staff faturalandırma
// yönetemez, /admin/settings ile aynı __admin_only__ deseni). Kart bilgisi
// iyzico'nun barındırdığı Checkout Form'da girilir, bize hiç dokunmaz.
export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const { plan } = await request.json();
    const pricingPlanRef = PLAN_REFS[plan];
    if (!pricingPlanRef) {
      return NextResponse.json({ error: "Geçersiz plan." }, { status: 400 });
    }

    const tenantResult = await pool.query<{
      name: string; contact_name: string | null; contact_email: string | null; contact_phone: string | null;
      billing_status: string | null; trial_ends_at: string | null;
    }>(
      "SELECT name, contact_name, contact_email, contact_phone, billing_status, trial_ends_at FROM tenants WHERE id = $1",
      [user.tenantId]
    );
    const tenant = tenantResult.rows[0];
    if (!tenant) return NextResponse.json({ error: "Firma bulunamadı." }, { status: 404 });

    // Deneme bitmeden erken abone olan bir firma, kalan ücretsiz süresini
    // kaybetmesin diye — hâlâ deneme içindeyse kalan gün iyzico'ya
    // trialPeriodDays olarak geçilir (deneme bittiyse 0, hemen tahsilat).
    const remainingTrialDays = tenant.billing_status === "trialing" ? trialDaysLeft(tenant.trial_ends_at) : 0;
    const callbackUrl = new URL("/api/billing/callback", request.url).toString();

    const result = await initializeCheckoutForm({
      conversationId: String(user.tenantId),
      callbackUrl,
      pricingPlanReferenceCode: pricingPlanRef,
      subscriptionInitialStatus: "ACTIVE",
      trialPeriodDays: remainingTrialDays > 0 ? remainingTrialDays : undefined,
      customer: buildCustomerFromTenant(tenant),
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Sunucu hatası.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
