import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { cancelSubscription } from "@/lib/iyzico";

export async function POST() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const result = await pool.query<{ billing_subscription_ref: string | null }>(
      "SELECT billing_subscription_ref FROM tenants WHERE id = $1",
      [user.tenantId]
    );
    const subscriptionRef = result.rows[0]?.billing_subscription_ref;
    if (!subscriptionRef) {
      return NextResponse.json({ error: "Aktif bir abonelik bulunamadı." }, { status: 400 });
    }

    // iyzico'da hemen iptal edilir (bir daha tahsilat yapılmaz) ama
    // billing_status 'active' kalır — zaten ödenmiş dönem sonuna kadar
    // erişim sürer (bkz. src/lib/billing.ts isBillingLocked, plan).
    await cancelSubscription(subscriptionRef);
    await pool.query("UPDATE tenants SET billing_cancel_at_period_end = true WHERE id = $1", [user.tenantId]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Sunucu hatası.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
