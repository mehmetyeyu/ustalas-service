import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

// Onboarding turunun (bkz. src/lib/onboardingTour.ts, src/components/
// OnboardingTour.tsx) atlandığını/tamamlandığını kalıcı olarak işaretler —
// ikisi de aynı sonucu doğurur (bir daha gösterilmez), bu yüzden sebep
// ayrımı hiç tutulmaz. IF onboarding_tour_completed_at IS NULL koruması,
// bir kullanıcının zaten kaydettiği ilk zaman damgasının üzerine
// yazılmasını (ör. iki sekmede aynı anda kapatma) önler.
export async function POST() {
  const authUser = await getAuthUser();
  if (!authUser) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });

  await pool.query(
    "UPDATE users SET onboarding_tour_completed_at = NOW() WHERE id = $1 AND onboarding_tour_completed_at IS NULL",
    [authUser.userId]
  );

  return NextResponse.json({ success: true });
}
