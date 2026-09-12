import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

// Tenant başına, para birimi başına GÜNCEL TL kuru — Kasaları Yönet'ten
// kullanıcı ne zaman isterse günceller (bkz. database/schema.sql:
// currency_rates, src/lib/kasalar.ts: getRateToTry). Dış bir kur API'sinden
// otomatik çekilmez; sadece "şu an bu kasada duran döviz kaç TL eder"
// sorusuna canlı cevap vermek için, geçmiş işlemleri hiç etkilemez. Ayrı
// bir izin kaynağı YOK, mevcut kasa.manage izni kullanılır.
export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "kasa.view")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const result = await pool.query(
      "SELECT currency, rate_to_try, updated_at FROM currency_rates WHERE tenant_id = $1 ORDER BY currency",
      [user.tenantId]
    );
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "kasa.manage")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const { currency, rate_to_try } = await request.json();
    const trimmedCurrency = currency == null ? "" : String(currency).trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(trimmedCurrency)) {
      return NextResponse.json({ error: "Geçersiz para birimi kodu." }, { status: 400 });
    }
    if (trimmedCurrency === "TRY") {
      return NextResponse.json({ error: "TL için kur girilemez." }, { status: 400 });
    }
    const rateValue = Number(rate_to_try);
    if (!Number.isFinite(rateValue) || rateValue <= 0) {
      return NextResponse.json({ error: "Geçersiz kur." }, { status: 400 });
    }

    await pool.query(
      `INSERT INTO currency_rates (tenant_id, currency, rate_to_try) VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, currency) DO UPDATE SET rate_to_try = EXCLUDED.rate_to_try, updated_at = CURRENT_TIMESTAMP`,
      [user.tenantId, trimmedCurrency, rateValue]
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
