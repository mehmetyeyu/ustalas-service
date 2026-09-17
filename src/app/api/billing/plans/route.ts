import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getPricingPlan } from "@/lib/iyzico";
import { getUsdTryRate } from "@/lib/exchangeRate";

// Fiyatı kendi kodumuzda sabit tutmak yerine her zaman iyzico'daki gerçek
// değerle senkron kalsın diye buradan çekilir (bkz. plan). usdTryRate,
// landing sayfasındaki (/elevire) TL gösterimiyle aynı mantığı
// /admin/billing'de de uygulayabilmek için eklendi — kur çekilemezse
// null döner, frontend o durumda sadece USD fiyatı gösterir.
export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });

  try {
    const monthlyRef = process.env.IYZICO_PLAN_MONTHLY_REF;
    const yearlyRef = process.env.IYZICO_PLAN_YEARLY_REF;
    if (!monthlyRef || !yearlyRef) {
      return NextResponse.json({ error: "Abonelik planları henüz yapılandırılmadı." }, { status: 503 });
    }

    const [monthly, yearly, usdTryRate] = await Promise.all([
      getPricingPlan(monthlyRef),
      getPricingPlan(yearlyRef),
      getUsdTryRate(),
    ]);
    return NextResponse.json({ monthly, yearly, usdTryRate });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
