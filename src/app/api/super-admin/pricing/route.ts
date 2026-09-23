import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getPlatformPricing, updatePlatformPricing } from "@/lib/platformPricing";

// Süper Admin Paneli — bkz. src/app/api/super-admin/tenants/route.ts
// üstündeki not, aynı role deseni. Platform genelinde SABİT TL fiyatını
// buradan yönetir (bkz. database/schema.sql platform_pricing notu).
export async function GET() {
  const user = await getAuthUser();
  if (!user || user.role !== "super_admin") return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const pricing = await getPlatformPricing();
    return NextResponse.json(pricing);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}

// Yeni fiyatları kaydeder ve HEMEN karşılığında yeni iyzico fiyat planları
// oluşturur (bkz. src/lib/platformPricing.ts updatePlatformPricing) —
// mevcut aboneliklere dokunmaz, sadece bundan sonraki checkout/switch-plan/
// yenilemelerde geçerli olur.
export async function PUT(request: NextRequest) {
  const user = await getAuthUser();
  if (!user || user.role !== "super_admin") return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const { monthlyPrice, yearlyPrice } = await request.json();
    const monthly = Number(monthlyPrice);
    const yearly = Number(yearlyPrice);
    if (!Number.isFinite(monthly) || monthly <= 0 || !Number.isFinite(yearly) || yearly <= 0) {
      return NextResponse.json({ error: "Geçerli aylık ve yıllık fiyat girin." }, { status: 400 });
    }

    await updatePlatformPricing(monthly, yearly);
    const pricing = await getPlatformPricing();
    return NextResponse.json(pricing);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Sunucu hatası.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
