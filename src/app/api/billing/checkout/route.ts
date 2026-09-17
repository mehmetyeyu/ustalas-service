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
    const { plan, acceptedTerms } = await request.json();
    // Client-side checkbox tek başına yeterli değil — Mesafeli Satış
    // Sözleşmesi'ndeki cayma hakkı feragatinin geçerli olması için ödeme
    // anında açık onay burada da zorunlu kılınır ve ne zaman verildiği
    // saklanır (bkz. database/schema.sql: terms_accepted_at). Plan
    // geçerliliğinden ÖNCE kontrol edilir — hangi plan seçilirse seçilsin
    // onay şart.
    if (acceptedTerms !== true) {
      return NextResponse.json({ error: "Mesafeli Satış Sözleşmesi'ni kabul etmeniz gerekiyor." }, { status: 400 });
    }
    // Onay verildiği an kaydedilir — sonraki plan doğrulaması/iyzico
    // çağrısı başarısız olsa bile, kullanıcının bu anda onay verdiği
    // gerçeği değişmez.
    await pool.query("UPDATE tenants SET terms_accepted_at = now() WHERE id = $1", [user.tenantId]);
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

    // /api/billing/callback'in token'dan tenant'ı bulabilmesi için —
    // retrieveCheckoutForm yanıtı conversationId'yi HİÇ döndürmüyor
    // (gerçek bir sandbox çağrısında saptandı, bkz. database/schema.sql
    // notu). ON CONFLICT: aynı kullanıcı art arda "Abone Ol"a basarsa
    // iyzico'nun her seferinde yeni bir token döndürmesi beklenir, ama
    // garantiye almak için üzerine yazılır.
    if (result.token) {
      await pool.query(
        "INSERT INTO iyzico_checkout_sessions (token, tenant_id, plan) VALUES ($1, $2, $3) ON CONFLICT (token) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, plan = EXCLUDED.plan",
        [result.token, user.tenantId, plan]
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Sunucu hatası.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
