import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getUsdTryRate, USD_REFERENCE_PRICING } from "@/lib/exchangeRate";
import { createPricingPlan, upgradeSubscription } from "@/lib/iyzico";
import { logBillingEvent } from "@/lib/billingEvents";

const PRODUCT_REF = process.env.IYZICO_PRODUCT_REF;

// Vercel Cron her gün bu route'u GET ile çağırır (vercel.json). Vercel,
// CRON_SECRET set edilmişse isteğe otomatik "Authorization: Bearer
// <CRON_SECRET>" header'ı ekler — bu kontrol olmadan route herkese açık bir
// URL'den tetiklenebilir (gerçek para tahsilat fiyatını değiştiren bir
// işlem olduğundan bu KRİTİK).
function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

// USD referans fiyatının TL karşılığı zamanla kur farkıyla sapar (bkz.
// database/schema.sql notu, Mesafeli Satış Sözleşmesi'ndeki dönemsel
// güncelleme maddesi). Her tenant'ın YENİLEME tarihinden 3 gün önce (aylık
// ve yıllıkta aynı pencere — kullanıcı kararı, %10-15 eşiği YOK, her zaman
// tetiklenir) o günün TCMB kuruyla yeni bir iyzico fiyat planı oluşturulup
// /upgrade(NEXT_PERIOD) ile mevcut (zaten ödenmiş) döneme dokunmadan bir
// sonraki tahsilata uygulanır. iyzico'da plan fiyatı DEĞİŞTİRİLEMEZ (bkz.
// src/lib/iyzico.ts createPricingPlan notu) — bu yüzden her repricing yeni
// bir plan nesnesi yaratır, mevcut planı güncellemez.
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  }
  if (!PRODUCT_REF) {
    return NextResponse.json({ error: "IYZICO_PRODUCT_REF tanımlı değil." }, { status: 500 });
  }

  const rate = await getUsdTryRate();
  if (!rate) {
    console.error("reprice-subscriptions — TCMB kuru alınamadı, bu çalıştırma atlandı.");
    return NextResponse.json({ error: "Kur alınamadı, tekrar denenecek." }, { status: 503 });
  }

  // billing_cancel_at_period_end=true olanlar zaten sona erecek, onları
  // yeni bir fiyata taşımanın anlamı yok. billing_repriced_for_period_end,
  // 3 günlük pencerede cron'un HER GÜN aynı dönem için tekrar tetiklenmesini
  // önler (bkz. database/schema.sql notu) — bir kez başarıyla /upgrade
  // çağrıldıktan sonra bu tenant'ın mevcut billing_period_ends_at'i ile
  // eşleştirilir.
  const candidates = await pool.query<{
    id: number;
    plan: string | null;
    billing_subscription_ref: string;
    billing_period_ends_at: string;
  }>(
    `SELECT id, plan, billing_subscription_ref, billing_period_ends_at
     FROM tenants
     WHERE billing_status = 'active'
       AND billing_cancel_at_period_end = false
       AND billing_subscription_ref IS NOT NULL
       AND billing_period_ends_at IS NOT NULL
       AND billing_period_ends_at BETWEEN now() AND now() + interval '3 days'
       AND (billing_repriced_for_period_end IS NULL OR billing_repriced_for_period_end != billing_period_ends_at)`
  );

  const results: Array<{ tenantId: number; status: "repriced" | "failed"; detail?: string }> = [];

  for (const tenant of candidates.rows) {
    const planKey = tenant.plan === "yearly" ? "yearly" : "monthly";
    const usdPrice = USD_REFERENCE_PRICING[planKey];
    const tryPrice = (usdPrice * rate).toFixed(2);
    const today = new Date().toISOString().slice(0, 10);

    try {
      // iyzico plan isimlerinin benzersiz olması gerekiyor — sadece tarih
      // yeterli değil (aynı gün ikinci bir çalıştırma/tenant "Ödeme planı
      // zaten var" hatasıyla çakışır, gerçek bir denemede saptandı). Tenant
      // id + tam zaman damgası benzersizliği garantiler.
      const newPlan = await createPricingPlan(PRODUCT_REF, {
        name: `${planKey === "yearly" ? "Yıllık" : "Aylık"} (TRY) - repriced ${today} #${tenant.id}-${Date.now()}`,
        price: tryPrice,
        currencyCode: "TRY",
        paymentInterval: planKey === "yearly" ? "YEARLY" : "MONTHLY",
      });

      // upgrade, verilen referansı YERİNDE güncellemiyor — AYNI parent
      // altında YENİ bir abonelik nesnesi (yeni referenceCode) oluşturuyor,
      // eskisi "UPGRADED" durumuna geçiyor (gerçek bir sandbox çağrısıyla
      // saptandı, bkz. src/lib/iyzico.ts upgradeSubscription notu).
      // billing_subscription_ref MUTLAKA bu yeni referansla güncellenmeli.
      const upgraded = await upgradeSubscription(tenant.billing_subscription_ref, newPlan.referenceCode, "NEXT_PERIOD");

      // upgrade bu noktada iyzico'da GERÇEKTEN gerçekleşti — geri alınamaz.
      // Aşağıdaki DB yazması (Neon soğuk başlangıcı, bağlantı kopması vb.)
      // başarısız olursa bu yeni referans kalıcı olarak kaybolur (tenant
      // doğru tahsil edilir ama DB'miz hâlâ eski/pasif referansı gösterir,
      // gelecekteki webhook'lar hiçbir tenant'a eşleşmez — bir denetimde
      // bulunan gerçek bir risk). Bu yüzden yazmadan ÖNCE, yazma başarısız
      // olsa bile Vercel loglarında kalıcı/aranabilir bir iz bırakılıyor.
      try {
        await pool.query(
          `UPDATE tenants SET billing_subscription_ref = $1, billing_pricing_plan_ref = $2, billing_repriced_for_period_end = $3 WHERE id = $4`,
          [upgraded.referenceCode, newPlan.referenceCode, tenant.billing_period_ends_at, tenant.id]
        );
      } catch (dbError) {
        console.error(
          "reprice-subscriptions — KRİTİK: iyzico upgrade BAŞARILI oldu ama DB yazması BAŞARISIZ, elle düzeltme gerekiyor:",
          { tenantId: tenant.id, oldSubscriptionRef: tenant.billing_subscription_ref, newSubscriptionRef: upgraded.referenceCode, newPricingPlanRef: newPlan.referenceCode, dbError }
        );
        throw dbError;
      }

      results.push({ tenantId: tenant.id, status: "repriced" });
      await logBillingEvent(tenant.id, "reprice_success", `${planKey === "yearly" ? "Yıllık" : "Aylık"} → ₺${tryPrice} (kur: ${rate.toFixed(4)})`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error(`reprice-subscriptions — tenant ${tenant.id} için hata:`, error);
      results.push({ tenantId: tenant.id, status: "failed", detail });
      await logBillingEvent(tenant.id, "reprice_failure", detail);
    }
  }

  return NextResponse.json({ rate, checked: candidates.rows.length, results });
}
