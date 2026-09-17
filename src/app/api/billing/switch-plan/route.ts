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
    const { plan, acceptedTerms } = await request.json();
    // bkz. /api/billing/checkout — aynı gerekçe, plan değişimi de yeni bir
    // checkout/tahsilat başlattığından aynı onay burada da zorunlu. Plan
    // geçerliliğinden ÖNCE kontrol edilir.
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

    // bkz. /api/billing/checkout — aynı eşzamanlılık kilidi, checkout ile
    // PAYLAŞILAN aynı sütun (billing_checkout_lock_at) üzerinden: aksi halde
    // bu route ile checkout aynı tenant için birbirinden habersiz aynı anda
    // çalışıp yine mükerrer abonelik yaratabilirdi. switch-plan'ın kendine
    // özgü ön koşulu yok (zaten aktif bir tenant'ın plan değiştirmesi için
    // var) — sadece devam eden başka bir checkout/switch olmadığından emin
    // olunuyor.
    const claimResult = await pool.query<{
      name: string; contact_name: string | null; contact_email: string | null; contact_phone: string | null;
      billing_subscription_ref: string | null; billing_cancel_at_period_end: boolean;
    }>(
      `UPDATE tenants SET billing_checkout_lock_at = now()
       WHERE id = $1
         AND (billing_checkout_lock_at IS NULL OR billing_checkout_lock_at < now() - interval '15 minutes')
       RETURNING name, contact_name, contact_email, contact_phone, billing_subscription_ref, billing_cancel_at_period_end`,
      [user.tenantId]
    );
    const tenant = claimResult.rows[0];
    if (!tenant) {
      const exists = await pool.query("SELECT 1 FROM tenants WHERE id = $1", [user.tenantId]);
      if (exists.rows.length === 0) return NextResponse.json({ error: "Firma bulunamadı." }, { status: 404 });
      return NextResponse.json(
        { error: "Devam eden bir ödeme işlemi var. Birkaç dakika sonra tekrar deneyin." },
        { status: 400 }
      );
    }

    try {
      // billing_cancel_at_period_end zaten true ise abonelik iyzico'da
      // önceden iptal edilmiş demektir (bkz. /api/billing/cancel) — aynı
      // referansı tekrar iptal etmeye çalışmak iyzico'da hataya yol açar.
      if (tenant.billing_subscription_ref && !tenant.billing_cancel_at_period_end) {
        await cancelSubscription(tenant.billing_subscription_ref);
        // İptal iyzico'da gerçekleşti — bundan sonraki checkout adımı
        // (aşağıda) ağ hatası vb. ile başarısız olursa bile bu gerçeği DB'ye
        // hemen yansıtıyoruz. Aksi halde eski abonelik gerçekte iptal
        // edilmişken tenant hâlâ tam aktif görünür, dönem sonu geldiğinde
        // hiçbir past_due/kilit sinyali almadan sessizce ödemesiz kalırdı
        // (gerçek bir denetimde bulunan bir açık). Gerçekten yeniden abone
        // olunca /api/billing/callback bu bayrağı zaten false'a çeviriyor.
        await pool.query("UPDATE tenants SET billing_cancel_at_period_end = true WHERE id = $1", [user.tenantId]);
      }

      const callbackUrl = new URL("/api/billing/callback", request.url).toString();

      const result = await initializeCheckoutForm({
        conversationId: String(user.tenantId),
        callbackUrl,
        pricingPlanReferenceCode: pricingPlanRef,
        subscriptionInitialStatus: "ACTIVE",
        customer: buildCustomerFromTenant(tenant),
      });

      // bkz. /api/billing/checkout — aynı gerekçe (retrieveCheckoutForm
      // conversationId döndürmüyor).
      if (result.token) {
        await pool.query(
          "INSERT INTO iyzico_checkout_sessions (token, tenant_id, plan) VALUES ($1, $2, $3) ON CONFLICT (token) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, plan = EXCLUDED.plan",
          [result.token, user.tenantId, plan]
        );
      }

      return NextResponse.json(result);
    } catch (error) {
      // bkz. /api/billing/checkout — aynı gerekçe.
      await pool.query("UPDATE tenants SET billing_checkout_lock_at = NULL WHERE id = $1", [user.tenantId]);
      throw error;
    }
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Sunucu hatası.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
