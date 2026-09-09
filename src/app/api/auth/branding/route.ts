import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

const DEFAULT_BUSINESS_NAME = "Lastik Servis Paneli";

// Giriş sayfası (henüz kimlik doğrulanmamış) kullanıcı adı yazıldıkça o
// firmanın işletme adını canlı göstermek için bu genel (auth gerektirmeyen)
// uca ihtiyaç duyar — paylaşılan deploymentta artık birden fazla firma
// olduğundan sabit bir logo yerine bu kullanılıyor (bkz. admin/login/page.tsx).
// Bilinçli kabul edilen tradeoff: bu, bir kullanıcı adının var olup olmadığını
// hafifçe ifşa eder (var olmayan/boş kullanıcı adında her zaman jenerik isim
// döner) — kullanıcı adlarının zaten global olarak benzersiz olması (bkz.
// multi-tenant migration notları) nedeniyle kabul edilen bir sınıf risk.
export async function GET(request: NextRequest) {
  const username = request.nextUrl.searchParams.get("username")?.trim();
  if (!username) {
    return NextResponse.json({ business_name: DEFAULT_BUSINESS_NAME });
  }

  try {
    const result = await pool.query<{ business_name: string }>(
      `SELECT a.business_name
       FROM users u
       JOIN app_settings a ON a.tenant_id = u.tenant_id
       WHERE u.username = $1`,
      [username]
    );
    return NextResponse.json({ business_name: result.rows[0]?.business_name || DEFAULT_BUSINESS_NAME });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ business_name: DEFAULT_BUSINESS_NAME });
  }
}
