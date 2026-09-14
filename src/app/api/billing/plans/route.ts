import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getPricingPlan } from "@/lib/iyzico";

// Fiyatı kendi kodumuzda sabit tutmak yerine her zaman iyzico'daki gerçek
// değerle senkron kalsın diye buradan çekilir (bkz. plan).
export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });

  try {
    const monthlyRef = process.env.IYZICO_PLAN_MONTHLY_REF;
    const yearlyRef = process.env.IYZICO_PLAN_YEARLY_REF;
    if (!monthlyRef || !yearlyRef) {
      return NextResponse.json({ error: "Abonelik planları henüz yapılandırılmadı." }, { status: 503 });
    }

    const [monthly, yearly] = await Promise.all([getPricingPlan(monthlyRef), getPricingPlan(yearlyRef)]);
    return NextResponse.json({ monthly, yearly });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
