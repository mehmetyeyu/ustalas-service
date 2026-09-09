import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

const DEFAULT_BUSINESS_NAME = "Lastik Servis Paneli";

// Giriş sayfası (henüz kimlik doğrulanmamış) Firma Kodu yazıldıkça o firmanın
// işletme adını canlı göstermek için bu genel (auth gerektirmeyen) uca
// ihtiyaç duyar — paylaşılan deploymentta artık birden fazla firma olduğundan
// sabit bir logo yerine bu kullanılıyor (bkz. admin/login/page.tsx).
// Bilinçli kabul edilen tradeoff: bu, bir firma kodunun var olup olmadığını
// hafifçe ifşa eder (var olmayan/eksik kodda her zaman jenerik isim döner) —
// kodlar zaten firma sahipleri tarafından kendi personeline dağıtılan,
// gizli olması gerekmeyen değerler (bkz. Genel Ayarlar'daki gösterimi).
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")?.trim();
  if (!code) {
    return NextResponse.json({ business_name: DEFAULT_BUSINESS_NAME });
  }

  try {
    const result = await pool.query<{ business_name: string }>(
      `SELECT a.business_name
       FROM tenants t
       JOIN app_settings a ON a.tenant_id = t.id
       WHERE t.code = $1 AND t.is_active = true`,
      [code]
    );
    return NextResponse.json({ business_name: result.rows[0]?.business_name || DEFAULT_BUSINESS_NAME });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ business_name: DEFAULT_BUSINESS_NAME });
  }
}
