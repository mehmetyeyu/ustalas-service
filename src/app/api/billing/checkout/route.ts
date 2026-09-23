import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { trialDaysLeft, isInvoiceInfoComplete } from "@/lib/billing";
import { buildCustomerFromTenant, cancelSubscription, initializeCheckoutForm } from "@/lib/iyzico";
import { ensurePricingPlanRef } from "@/lib/platformPricing";

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
    if (plan !== "monthly" && plan !== "yearly") {
      return NextResponse.json({ error: "Geçersiz plan." }, { status: 400 });
    }
    const { pricingPlanRef } = await ensurePricingPlanRef(plan);

    // initializeCheckoutForm HER çağrıldığında iyzico'da yeni bir müşteri +
    // yeni bir abonelik açar, var olan bir aboneliği hiç kontrol etmez.
    // billing_status yalnızca callback tamamlanınca 'active' olduğundan,
    // salt bir "zaten aktif mi" kontrolü checkout başlatılıp callback
    // tamamlanana kadarki pencereyi (kullanıcı kart bilgilerini girerken)
    // kapatamaz — o pencerede aynı tenant ikinci bir checkout/switch-plan
    // daha başlatabilir. Bu yüzden tek bir atomik UPDATE...RETURNING ile
    // billing_checkout_lock_at claim ediliyor (bkz. database/schema.sql notu)
    // — satır kilidi sayesinde eşzamanlı iki istekten yalnızca biri WHERE
    // koşulunu geçer. "İptal edilmiş ama ödenmiş dönemi bitmemiş" (bkz.
    // src/lib/billing.ts isBillingLocked) durumda iyzico'daki abonelik zaten
    // gerçekten iptal edilmiş olduğundan (bkz. /api/billing/cancel) yeniden
    // abone olmaya izin veriliyor — sadece "hâlâ gerçekten aktif" durum
    // reddediliyor.
    const claimResult = await pool.query<{
      name: string; contact_name: string | null; contact_email: string | null; contact_phone: string | null;
      billing_status: string | null; trial_ends_at: string | null; billing_subscription_ref: string | null;
      billing_entity_type: string | null; billing_tax_id: string | null; billing_tax_office: string | null;
      billing_invoice_title: string | null; billing_city: string | null; billing_district: string | null; billing_address: string | null;
    }>(
      `UPDATE tenants SET billing_checkout_lock_at = now()
       WHERE id = $1
         AND (billing_status IS DISTINCT FROM 'active' OR billing_cancel_at_period_end = true)
         AND (billing_checkout_lock_at IS NULL OR billing_checkout_lock_at < now() - interval '15 minutes')
       RETURNING name, contact_name, contact_email, contact_phone, billing_status, trial_ends_at, billing_subscription_ref,
                 billing_entity_type, billing_tax_id, billing_tax_office, billing_invoice_title, billing_city, billing_district, billing_address`,
      [user.tenantId]
    );
    const tenant = claimResult.rows[0];
    if (!tenant) {
      const exists = await pool.query("SELECT 1 FROM tenants WHERE id = $1", [user.tenantId]);
      if (exists.rows.length === 0) return NextResponse.json({ error: "Firma bulunamadı." }, { status: 404 });
      return NextResponse.json(
        { error: "Zaten aktif bir aboneliğiniz var ya da devam eden bir ödeme işlemi var. Birkaç dakika sonra tekrar deneyin." },
        { status: 400 }
      );
    }
    // VUK md. 231/5 gereği ilk tahsilattan itibaren 7 gün içinde fatura
    // kesme zorunluluğu var (bkz. src/lib/billing.ts isInvoiceInfoComplete
    // notu) — kilit ALINDIKTAN sonra kontrol edilir, aksi halde eksikse her
    // "Abone Ol" denemesi kilidi boşuna claim edip serbest bırakırdı.
    if (!isInvoiceInfoComplete(tenant)) {
      await pool.query("UPDATE tenants SET billing_checkout_lock_at = NULL WHERE id = $1", [user.tenantId]);
      return NextResponse.json({ error: "Devam etmeden önce fatura bilgilerinizi tamamlamanız gerekiyor." }, { status: 400 });
    }

    try {
      // past_due (son yenilemede kart reddedildi) bir firma yeniden abone
      // olurken, o kötü karta hâlâ bağlı ESKİ abonelik iyzico'da hâlâ
      // ACTIVE kalır (başarısız bir ödeme iyzico'da aboneliği kendiliğinden
      // iptal etmez, sadece o dönemin siparişini FAILED işaretler) — bu
      // temizlenmeden yeni bir checkout başlatılırsa iki paralel abonelik
      // oluşur (bir denetimde bulunan gerçek bir risk: eski kart daha sonra
      // çalışır hale gelirse kendi doğal yenileme tarihinde sürpriz bir
      // mükerrer tahsilat yapabilir). Bu temizlik başarısız olursa (ör. ref
      // zaten geçersiz) yeni abone olmayı ENGELLEMEMELİ, sadece loglanır.
      if (tenant.billing_status === "past_due" && tenant.billing_subscription_ref) {
        try {
          await cancelSubscription(tenant.billing_subscription_ref);
        } catch (cancelError) {
          console.error("checkout — past_due eski abonelik iptal edilemedi, yine de devam ediliyor:", { tenantId: user.tenantId, oldRef: tenant.billing_subscription_ref, cancelError });
        }
      }

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
      // Kilit, callback tamamlanınca serbest bırakılır (bkz.
      // /api/billing/callback) — ama iyzico çağrısı burada patlarsa callback
      // hiç çalışmayacağından, kullanıcı 15 dakika beklemek zorunda kalmasın
      // diye kilit hemen geri alınıyor.
      await pool.query("UPDATE tenants SET billing_checkout_lock_at = NULL WHERE id = $1", [user.tenantId]);
      throw error;
    }
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Sunucu hatası.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
