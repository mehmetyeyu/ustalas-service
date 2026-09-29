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

// "Yetim ödeme" — iyzico'da ACTIVE bir abonelik ama bizim hiçbir tenant
// satırımızın billing_subscription_ref'i buna eşleşmiyor. Yukarıdaki
// tarama bunu HİÇ yakalamaz (sadece zaten billing_status='active' olan
// tenant'ları tarar) — bu, DB yazması iyzico ödemesinden SONRA hiç
// tetiklenmediyse (ör. tarayıcı /api/billing/callback'e dönmeden
// kapandıysa) oluşur; gerçek bir vakada (2026-09-24, tenant 995987) böyle
// yaşandı. customerEmail üzerinden tenants.contact_email'e eşleşen TEK bir
// firma varsa suggestedFix olarak önerilir (aynı POST uCunu kullanır);
// eşleşme yoksa/birden fazlaysa Süper Admin elle çözmeli.
export interface OrphanedSubscription {
  subscriptionRef: string;
  pricingPlanRef: string | null;
  customerEmail: string | null;
  suggestedFix?: { tenantId: number; tenantName: string };
}

export async function GET() {
  const user = await getAuthUser();
  if (!user || user.role !== "super_admin") return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  const activeTenants = await pool.query<{ id: number; name: string; billing_subscription_ref: string }>(
    `SELECT id, name, billing_subscription_ref
     FROM tenants
     WHERE is_platform = false AND billing_status = 'active' AND billing_subscription_ref IS NOT NULL
     ORDER BY name`
  );

  const results: ConsistencyCheckResult[] = [];
  const mismatchParents: Array<{ result: ConsistencyCheckResult; parentReferenceCode?: string }> = [];

  for (const t of activeTenants.rows) {
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

  // Yetim-ödeme taraması, bizde HİÇ referansı olmayan tenant'ları da
  // kapsamalı — bu yüzden (yukarıdaki aksine) TÜM firmalar (billing_status
  // fark etmeksizin) ve mevcut referansları/e-postaları tek seferde çekilir.
  const allTenants = await pool.query<{ id: number; name: string; contact_email: string | null; billing_subscription_ref: string | null }>(
    `SELECT id, name, contact_email, billing_subscription_ref FROM tenants WHERE is_platform = false`
  );
  const knownRefs = new Set(allTenants.rows.map((t) => t.billing_subscription_ref).filter((r): r is string => !!r));
  const tenantsByEmail = new Map<string, { id: number; name: string }[]>();
  for (const t of allTenants.rows) {
    if (!t.contact_email) continue;
    const key = t.contact_email.trim().toLowerCase();
    if (!tenantsByEmail.has(key)) tenantsByEmail.set(key, []);
    tenantsByEmail.get(key)!.push({ id: t.id, name: t.name });
  }

  const orphaned: OrphanedSubscription[] = [];

  // Abonelik listesi TEK seferde çekilir — hem mismatch düzeltme önerisi
  // hem yetim-ödeme taraması aynı çağrıyı paylaşır (mismatch yoksa bile
  // yetim taraması için çekilmesi gerekir, bu yüzden koşulsuz).
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

    for (const item of items) {
      if (item.subscriptionStatus !== "ACTIVE" || !item.referenceCode) continue;
      if (knownRefs.has(item.referenceCode)) continue;
      const entry: OrphanedSubscription = {
        subscriptionRef: item.referenceCode,
        pricingPlanRef: item.pricingPlanReferenceCode ?? null,
        customerEmail: item.customerEmail ?? null,
      };
      const emailKey = item.customerEmail?.trim().toLowerCase();
      const matches = emailKey ? tenantsByEmail.get(emailKey) : undefined;
      if (matches && matches.length === 1) {
        entry.suggestedFix = { tenantId: matches[0].id, tenantName: matches[0].name };
      }
      orphaned.push(entry);
    }
  } catch (error) {
    console.error("consistency-check — listSubscriptions ile tarama yapılırken hata:", error);
  }

  return NextResponse.json({ results, orphaned });
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

    // billing_status='active' de yazılır — mevcut referans düzeltmesinde
    // zaten 'active' olduğundan (WHERE billing_status='active' taraması)
    // no-op, ama yetim-ödeme düzeltmesinde (tenant hiç 'active' değilken,
    // bkz. yukarıdaki OrphanedSubscription notu) firmanın kilidini asıl
    // açan alan budur — bkz. src/lib/billing.ts isBillingLocked.
    await pool.query(
      "UPDATE tenants SET billing_subscription_ref = $1, billing_pricing_plan_ref = $2, billing_status = 'active' WHERE id = $3",
      [String(subscriptionRef), pricingPlanRef ? String(pricingPlanRef) : null, tenantId]
    );
    await logBillingEvent(tenantId, "consistency_fixed", `${oldRef ?? "?"} → ${subscriptionRef}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("consistency-check POST — düzeltme uygulanırken hata:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Sunucu hatası." }, { status: 500 });
  }
}
