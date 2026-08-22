import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

// Sipariş sayfasındaki Filtrele modalında Ödeme Şekli çoklu seçimi için:
// sabit bir katalog yerine gerçekten kullanılmış değerler döner — "Mail
// Order" tipleri "<Tedarikçi> Mail Order" olarak dinamik oluştuğundan sabit
// bir liste yeterli olmaz.
export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "orders.view")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    // Hem eski satır bazlı (Excel içe aktarımı) hem yeni parçalı ödeme
    // (order_payments — bkz. PATCH /api/orders/:id) kaynaklarından gelen
    // değerler birleştirilir.
    const result = await pool.query(
      `SELECT DISTINCT payment_type FROM (
         SELECT payment_type FROM order_services WHERE tenant_id = $1 AND payment_type IS NOT NULL AND payment_type <> ''
         UNION
         SELECT payment_type FROM order_payments WHERE tenant_id = $1
       ) combined
       ORDER BY payment_type`,
      [user.tenantId]
    );
    return NextResponse.json(result.rows.map((r) => r.payment_type));
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
