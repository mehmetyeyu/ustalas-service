import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { retrieveCheckoutForm } from "@/lib/iyzico";

const PLAN_REFS: Record<string, string | undefined> = {
  monthly: process.env.IYZICO_PLAN_MONTHLY_REF,
  yearly: process.env.IYZICO_PLAN_YEARLY_REF,
};

function planNameFromRef(ref: string | undefined): string | null {
  if (!ref) return null;
  return Object.entries(PLAN_REFS).find(([, v]) => v === ref)?.[0] ?? null;
}

// iyzico'nun ödeme sonrası yönlendirdiği callbackUrl — bkz. /api/billing/checkout.
// Kasıtlı olarak auth cookie'sine GÜVENMEZ (bu bir üçüncü taraf yönlendirmesi,
// çerezin güvenilir gelip gelmeyeceği garanti değil); tenant eşleştirmesi
// checkout başlatılırken gönderilen conversationId (=tenant id) üzerinden
// yapılır, retrieveCheckoutForm sonucundan geri okunur.
async function handleCallback(request: NextRequest): Promise<NextResponse> {
  let token: string | null = null;
  try {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      token = (form.get("token") as string) || null;
    } else if (contentType.includes("application/json")) {
      const body = await request.json();
      token = body.token || null;
    }
  } catch {
    // yoksay, aşağıda query param'a düşülür
  }
  token = token || request.nextUrl.searchParams.get("token");

  const redirectTo = (result: "success" | "failed") =>
    NextResponse.redirect(new URL(`/admin/billing?result=${result}`, request.url));

  if (!token) return redirectTo("failed");

  try {
    const result = await retrieveCheckoutForm(token);
    const tenantId = result.conversationId ? parseInt(result.conversationId, 10) : NaN;
    const succeeded = result.status === "SUCCESS" || result.status === "success";
    if (!succeeded || !tenantId || !result.subscriptionReferenceCode) {
      return redirectTo("failed");
    }

    const plan = planNameFromRef((result as Record<string, unknown>).pricingPlanReferenceCode as string | undefined);

    await pool.query(
      `UPDATE tenants SET billing_status = 'active', billing_provider = 'iyzico',
              billing_subscription_ref = $1, billing_customer_id = $2, plan = COALESCE($3, plan)
       WHERE id = $4`,
      [result.subscriptionReferenceCode, result.customerReferenceCode ?? null, plan, tenantId]
    );

    return redirectTo("success");
  } catch (error) {
    console.error(error);
    return redirectTo("failed");
  }
}

export async function POST(request: NextRequest) {
  return handleCallback(request);
}

export async function GET(request: NextRequest) {
  return handleCallback(request);
}
