import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { effectivePaymentType, isCariSettled, loadOrderLedgerStatuses } from "@/lib/customerLedger";

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
    // Borcu kapanmış cari siparişler listede/filtrede kapatan yöntemle
    // görünür (bkz. effectivePaymentType) — "Karışık" gibi hiç kayıtlı
    // olmayan değerler de seçilebilsin diye eklenir. Yalnızca listede
    // gerçekten "Cari" satırı olan siparişlerin yöntemi alınır: cari kısmı
    // kapanmış parçalı ("Karışık") ya da eski SIPARIS kaydı kalmış Cari
    // olmayan bir sipariş, hiçbir satır getirmeyen bir seçenek eklerdi.
    const types = new Set<string>(result.rows.map((r) => r.payment_type));
    if (types.has("Cari")) {
      const cariStatuses = await loadOrderLedgerStatuses(pool, user.tenantId!, null);
      const settled = Array.from(cariStatuses).filter(([, st]) => isCariSettled(st));
      if (settled.length > 0) {
        const visible = await pool.query<{ paid_via: string }>(
          `SELECT DISTINCT cp.paid_via
           FROM unnest($2::int[], $3::text[]) AS cp(order_id, paid_via)
           WHERE EXISTS (
             SELECT 1 FROM orders o LEFT JOIN order_services os ON os.order_id = o.id
             WHERE o.id = cp.order_id AND o.tenant_id = $1 AND COALESCE(os.payment_type, o.payment_type) = 'Cari'
           )`,
          [user.tenantId, settled.map(([id]) => id), settled.map(([, st]) => effectivePaymentType("Cari", st))]
        );
        for (const r of visible.rows) types.add(r.paid_via);
      }
    }
    return NextResponse.json(Array.from(types));
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
