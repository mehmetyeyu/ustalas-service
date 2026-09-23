import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { findPaymentId, retrieveCheckoutForm } from "@/lib/iyzico";
import { getPlatformPricing } from "@/lib/platformPricing";

// Sadece session.plan (checkout/switch-plan'ın kaydettiği, bkz. aşağısı)
// hiç yoksa kullanılan bir yedek yol — platform_pricing'teki GÜNCEL
// referanslarla karşılaştırır. Süper admin fiyatı değiştirip yeni bir plan
// oluşturduktan hemen sonra, ESKİ bir referansla dönen bir callback bu
// eşleşmeyi kaçırabilir (bilinen, kabul edilebilir bir sınırlama —
// session.plan zaten neredeyse her zaman mevcut olduğundan bu yol nadiren
// devreye girer).
async function planNameFromRef(ref: string | undefined): Promise<string | null> {
  if (!ref) return null;
  const pricing = await getPlatformPricing();
  if (ref === pricing.monthlyPricingPlanRef) return "monthly";
  if (ref === pricing.yearlyPricingPlanRef) return "yearly";
  return null;
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
// checkout/switch-plan başlatılırken kaydedilen iyzico_checkout_sessions
// (token → tenant_id) üzerinden yapılır — retrieveCheckoutForm yanıtı
// conversationId'yi HİÇ döndürmüyor (gerçek bir sandbox çağrısında
// saptandı, önceki varsayım yanlıştı).
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

  // checkout/switch-plan tarafından claim edilen billing_checkout_lock_at
  // (bkz. o route'lardaki not) bu callback tamamlanınca (başarılı ya da
  // başarısız fark etmez) serbest bırakılmalı — aksi halde kullanıcı 15
  // dakikalık TTL dolana kadar yeniden deneyemez. tenantId, session
  // bulunduktan sonra biliniyor; finally bloğunun erişebilmesi için try
  // dışında tanımlanıyor.
  let tenantId: number | null = null;
  try {
    // Tenant, checkout/switch-plan başlatılırken kaydedilen token→tenant_id
    // eşleşmesinden bulunur — retrieveCheckoutForm'un kendi yanıtı buna
    // güvenilir bir şekilde izin vermiyor (aşağıya bkz.).
    const sessionResult = await pool.query<{ tenant_id: number; plan: string | null }>(
      "SELECT tenant_id, plan FROM iyzico_checkout_sessions WHERE token = $1",
      [token]
    );
    const session = sessionResult.rows[0];
    if (!session) {
      console.error("iyzico callback — token için kayıtlı checkout session bulunamadı:", token);
      return redirectTo("failed");
    }
    tenantId = session.tenant_id;

    const result = await retrieveCheckoutForm(token);
    // Gerçek bir sandbox çağrısıyla doğrulandı: bu uç nokta "status" değil
    // "subscriptionStatus" döndürüyor, aboneliğin kendi referans kodu
    // "subscriptionReferenceCode" değil "referenceCode" (bkz. src/lib/
    // iyzico.ts CheckoutFormResult notu) — önceki varsayım yanlış olduğundan
    // her başarılı ödeme "başarısız" sanılıp DB'ye hiç yazılmıyordu.
    const succeeded = result.subscriptionStatus === "ACTIVE";
    if (!succeeded || !result.referenceCode) {
      console.error("iyzico checkout başarısız/eksik — ham yanıt:", JSON.stringify(result));
      return redirectTo("failed");
    }

    // Tekrar oynatma (replay) koruması: bu route yalnızca YENİ bir aboneliği
    // aktive etmek için vardır — bir abonelik zaten bu referenceCode ile
    // 'active' ise (token/URL saklanıp tekrar açılırsa, ör. tarayıcı
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
      existing.rows[0]?.billing_subscription_ref === result.referenceCode;
    if (alreadyActivated) {
      return redirectTo("success");
    }

    // Plan adı önce kendi kaydımızdan (session.plan — checkout'ta hangi
    // plan seçildiğini zaten biliyoruz), yoksa iyzico'nun döndürdüğü
    // pricingPlanReferenceCode'dan çözülür.
    const plan = session.plan ?? (await planNameFromRef(result.pricingPlanReferenceCode));
    const periodEndsAt = computePeriodEndsAt(plan);

    // billing_cancel_at_period_end=false: daha önce iptal edilip dönem
    // sonunu bekleyen bir abonelik varsa (bkz. /api/billing/cancel), yeniden
    // abone olunca bu bayrak sıfırlanır. billing_pricing_plan_ref, dönemsel
    // repricing cron'unun (bkz. database/schema.sql platform_pricing notu)
    // "platform_pricing'in güncel planıyla aynı mı" kontrolü için tutulur.
    await pool.query(
      `UPDATE tenants SET billing_status = 'active', billing_provider = 'iyzico',
              billing_subscription_ref = $1, billing_customer_id = $2, plan = COALESCE($3, plan),
              billing_period_ends_at = $4, billing_cancel_at_period_end = false,
              billing_pricing_plan_ref = $5
       WHERE id = $6`,
      [result.referenceCode, result.customerReferenceCode ?? null, plan, periodEndsAt, result.pricingPlanReferenceCode ?? null, tenantId]
    );

    // IFN (dolandırıcılık incelemesi) bildirimi bize sadece paymentId
    // veriyor, hangi tenant'a ait olduğunu bulabilmemiz için kendi
    // eşlememizi tutmamız gerekiyor (bkz. database/schema.sql
    // iyzico_payments notu) — best-effort, başarısız olursa aktivasyonu
    // bloklamaz.
    try {
      const paymentId = await findPaymentId(result.referenceCode);
      if (paymentId) {
        await pool.query(
          "INSERT INTO iyzico_payments (payment_id, tenant_id) VALUES ($1, $2) ON CONFLICT (payment_id) DO NOTHING",
          [paymentId, tenantId]
        );
      } else {
        console.warn("iyzico callback — paymentId bulunamadı, IFN eşlemesi kaydedilemedi:", { tenantId, subscriptionRef: result.referenceCode });
      }
    } catch (paymentIdError) {
      console.error("iyzico callback — paymentId çekilemedi:", { tenantId, paymentIdError });
    }

    return redirectTo("success");
  } catch (error) {
    console.error(error);
    return redirectTo("failed");
  } finally {
    if (tenantId !== null) {
      await pool
        .query("UPDATE tenants SET billing_checkout_lock_at = NULL WHERE id = $1", [tenantId])
        .catch((err) => console.error("checkout kilidi serbest bırakılamadı:", err));
    }
  }
}

export async function POST(request: NextRequest) {
  return handleCallback(request);
}

export async function GET(request: NextRequest) {
  return handleCallback(request);
}
