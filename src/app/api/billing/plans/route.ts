import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { ensurePricingPlanRef } from "@/lib/platformPricing";
import { getPricingPlan } from "@/lib/iyzico";

// Fiyatı kendi kodumuzda sabit tutmak yerine her zaman iyzico'daki gerçek
// değerle senkron kalsın diye buradan çekilir — ensurePricingPlanRef
// platform_pricing'teki güncel referansı döner (ya da ilk kullanımda
// kendiliğinden oluşturur), getPricingPlan de o referansın iyzico'daki
// tam plan nesnesini (ad, fiyat, para birimi) getirir.
export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });

  try {
    const [monthlyRef, yearlyRef] = await Promise.all([
      ensurePricingPlanRef("monthly"),
      ensurePricingPlanRef("yearly"),
    ]);
    const [monthly, yearly] = await Promise.all([
      getPricingPlan(monthlyRef.pricingPlanRef),
      getPricingPlan(yearlyRef.pricingPlanRef),
    ]);
    return NextResponse.json({ monthly, yearly });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
