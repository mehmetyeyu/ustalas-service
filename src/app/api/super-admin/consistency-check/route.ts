import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { getSubscription, listSubscriptions } from "@/lib/iyzico";
import { logBillingEvent } from "@/lib/billingEvents";

// DB↔iyzico abonelik tutarlılık denetimi — bkz. src/lib/iyzico.ts
// upgradeSubscription notu: repricing cron'unun kullandığı /upgrade her
// seferinde YENİ bir abonelik referansı üretiyor (eskisi "UPGRADED"a
// geçiyor, AYNI parentReferenceCode altında). iyzico çağrısı başarılı
// olduktan SONRA bizim DB yazmamız başarısız olursa (nadiren de olsa),
// tenants.billing_subscription_ref bayat/pasif bir referansı göstermeye
// devam eder ve gelecekteki webhook'lar hiçbir tenant'a eşleşmez. GET bu
// uçta her aktif tenant için gerçek iyzico durumunu doğrular; bir
// uyumsuzluk bulunursa aynı parentReferenceCode altındaki GERÇEK aktif
// kardeş aboneliği listSubscriptions() ile otomatik arayıp `suggestedFix`
// olarak önerir — admin panelden tek tıkla (POST) uygulayabilir, elle
// iyzico panelinde arama yapmaya gerek kalmaz. Otomatik değil (billing
// verisi olduğundan sessiz/kendiliğinden yazma yok) — hem tarama hem
// düzeltme Süper Admin'in açık tetiklemesiyle çalışır.
export interface ConsistencyCheckResult {
  tenantId: number;
  tenantName: string;
  subscriptionRef: string;
  iyzicoStatus: string | null;
  ok: boolean;
  error?: string;
  suggestedFix?: { subscriptionRef: string; pricingPlanRef: string | null };
}

export async function GET() {
  const user = await getAuthUser();
  if (!user || user.role !== "super_admin") return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  const tenants = await pool.query<{ id: number; name: string; billing_subscription_ref: string }>(
    `SELECT id, name, billing_subscription_ref
     FROM tenants
     WHERE is_platform = false AND billing_status = 'active' AND billing_subscription_ref IS NOT NULL
     ORDER BY name`
  );

  const results: ConsistencyCheckResult[] = [];
  const mismatchParents: Array<{ result: ConsistencyCheckResult; parentReferenceCode?: string }> = [];

  for (const t of tenants.rows) {
    try {
      const sub = (await getSubscription(t.billing_subscription_ref)) as {
        subscriptionStatus?: string;
        parentReferenceCode?: string;
      };
      const result: ConsistencyCheckResult = {
        tenantId: t.id,
        tenantName: t.name,
        subscriptionRef: t.billing_subscription_ref,
        iyzicoStatus: sub.subscriptionStatus ?? null,
        ok: sub.subscriptionStatus === "ACTIVE",
      };
      results.push(result);
      if (!result.ok) mismatchParents.push({ result, parentReferenceCode: sub.parentReferenceCode });
    } catch (error) {
      results.push({
        tenantId: t.id,
        tenantName: t.name,
        subscriptionRef: t.billing_subscription_ref,
        iyzicoStatus: null,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Uyumsuzluk bulunduysa GERÇEK aktif kardeş aboneliği aramak için tüm
  // abonelik listesi TEK seferde çekilir (mismatch başına ayrı çağrı değil).
  if (mismatchParents.length > 0) {
    try {
      const { items } = await listSubscriptions();
      for (const { result, parentReferenceCode } of mismatchParents) {
        if (!parentReferenceCode) continue;
        const activeSiblings = items.filter(
          (i) => i.parentReferenceCode === parentReferenceCode && i.subscriptionStatus === "ACTIVE"
        );
        if (activeSiblings.length === 1) {
          result.suggestedFix = {
            subscriptionRef: activeSiblings[0].referenceCode,
            pricingPlanRef: activeSiblings[0].pricingPlanReferenceCode ?? null,
          };
        }
      }
    } catch (error) {
      console.error("consistency-check — listSubscriptions ile düzeltme önerisi aranırken hata:", error);
    }
  }

  return NextResponse.json({ results });
}

// Süper Admin'in modaldaki "Düzelt" butonuyla, GET'in önerdiği
// suggestedFix'i uygular. Client'tan gelen referans körü körüne
// GÜVENİLMEZ — yazmadan önce sunucu tarafında tekrar getSubscription ile
// gerçekten ACTIVE olduğu doğrulanır (billing verisine yazılan bir alan
// olduğundan).
export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user || user.role !== "super_admin") return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const { tenantId, subscriptionRef, pricingPlanRef } = await request.json();
    if (!tenantId || !subscriptionRef) {
      return NextResponse.json({ error: "tenantId ve subscriptionRef zorunludur." }, { status: 400 });
    }

    const sub = (await getSubscription(String(subscriptionRef))) as { subscriptionStatus?: string };
    if (sub.subscriptionStatus !== "ACTIVE") {
      return NextResponse.json(
        { error: `Önerilen referans iyzico'da ACTIVE değil (durum: ${sub.subscriptionStatus ?? "bilinmiyor"}), düzeltme uygulanmadı.` },
        { status: 400 }
      );
    }

    const existing = await pool.query<{ billing_subscription_ref: string | null }>(
      "SELECT billing_subscription_ref FROM tenants WHERE id = $1 AND is_platform = false",
      [tenantId]
    );
    if (existing.rowCount === 0) {
      return NextResponse.json({ error: "Firma bulunamadı." }, { status: 404 });
    }
    const oldRef = existing.rows[0].billing_subscription_ref;

    await pool.query(
      "UPDATE tenants SET billing_subscription_ref = $1, billing_pricing_plan_ref = $2 WHERE id = $3",
      [String(subscriptionRef), pricingPlanRef ? String(pricingPlanRef) : null, tenantId]
    );
    await logBillingEvent(tenantId, "consistency_fixed", `${oldRef ?? "?"} → ${subscriptionRef}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("consistency-check POST — düzeltme uygulanırken hata:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Sunucu hatası." }, { status: 500 });
  }
}
