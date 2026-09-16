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

// iyzico'nun gerçek dönem sonu tarihini hangi alanda döndürdüğü
// (retrieveCheckoutForm/webhook) araştırmayla kesinleştirilemedi — bu
// yüzden kendimiz hesaplıyoruz (bkz. plan). "monthly" dışında her şey
// (plan bilinmiyorsa dahil) güvenli taraf olan yıllık'a değil, daha kısa
// olan aylık'a yakınsar mı diye değil — bilinmiyorsa aylık varsayılır
// (daha kısa pencere, erişim gereksiz uzamaz).
function computePeriodEndsAt(plan: string | null): Date {
  const now = new Date();
  if (plan === "yearly") return new Date(now.setFullYear(now.getFullYear() + 1));
  return new Date(now.setMonth(now.getMonth() + 1));
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

    // Tekrar oynatma (replay) koruması: bu route yalnızca YENİ bir aboneliği
    // aktive etmek için vardır — bir abonelik zaten bu subscriptionReferenceCode
    // ile 'active' ise (token/URL saklanıp tekrar açılırsa, ör. tarayıcı
    // geçmişinden), dönemi bir kez daha uzatmadan sessizce başarı sayfasına
    // dönülür. Gerçek dönem yenilemeleri webhook üzerinden işlenir (bkz.
    // /api/webhooks/iyzico), bu route'un tekrar çalışması hiçbir zaman
    // meşru bir "yeni ödeme" anlamına gelmez — gerçek bir denetimde bulunan
    // bir açık.
    const existing = await pool.query<{ billing_subscription_ref: string | null; billing_status: string | null }>(
      "SELECT billing_subscription_ref, billing_status FROM tenants WHERE id = $1",
      [tenantId]
    );
    const alreadyActivated =
      existing.rows[0]?.billing_status === "active" &&
      existing.rows[0]?.billing_subscription_ref === result.subscriptionReferenceCode;
    if (alreadyActivated) {
      return redirectTo("success");
    }

    const plan = planNameFromRef((result as Record<string, unknown>).pricingPlanReferenceCode as string | undefined);
    const periodEndsAt = computePeriodEndsAt(plan);

    // billing_cancel_at_period_end=false: daha önce iptal edilip dönem
    // sonunu bekleyen bir abonelik varsa (bkz. /api/billing/cancel), yeniden
    // abone olunca bu bayrak sıfırlanır.
    await pool.query(
      `UPDATE tenants SET billing_status = 'active', billing_provider = 'iyzico',
              billing_subscription_ref = $1, billing_customer_id = $2, plan = COALESCE($3, plan),
              billing_period_ends_at = $4, billing_cancel_at_period_end = false
       WHERE id = $5`,
      [result.subscriptionReferenceCode, result.customerReferenceCode ?? null, plan, periodEndsAt, tenantId]
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
