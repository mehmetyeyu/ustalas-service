import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { buildCustomerFromTenant, cancelSubscription, initializeCheckoutForm } from "@/lib/iyzico";

const PLAN_REFS: Record<string, string | undefined> = {
  monthly: process.env.IYZICO_PLAN_MONTHLY_REF,
  yearly: process.env.IYZICO_PLAN_YEARLY_REF,
};

// iyzico'nun /upgrade uç noktası yalnızca AYNI ödeme periyodundaki planlar
// arasında çalışıyor (bkz. plan, "Aylık↔Yıllık native upgrade ile
// YAPILAMIYOR") — bu yüzden mevcut abonelik iptal edilip yeni plan için
// yeniden checkout başlatılıyor. V1'de prorasyon (kalan gün mahsubu) YOK,
// bilinen bir sınırlama (bkz. plan).
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
      billing_subscription_ref: string | null;
    }>(
      "SELECT name, contact_name, contact_email, contact_phone, billing_subscription_ref FROM tenants WHERE id = $1",
      [user.tenantId]
    );
    const tenant = tenantResult.rows[0];
    if (!tenant) return NextResponse.json({ error: "Firma bulunamadı." }, { status: 404 });

    if (tenant.billing_subscription_ref) {
      await cancelSubscription(tenant.billing_subscription_ref);
    }

    const callbackUrl = new URL("/api/billing/callback", request.url).toString();

    const result = await initializeCheckoutForm({
      conversationId: String(user.tenantId),
      callbackUrl,
      pricingPlanReferenceCode: pricingPlanRef,
      subscriptionInitialStatus: "ACTIVE",
      customer: buildCustomerFromTenant(tenant),
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Sunucu hatası.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
