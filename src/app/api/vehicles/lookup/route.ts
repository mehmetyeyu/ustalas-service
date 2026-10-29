import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { isValidTrPlate, normalizePlate } from "@/lib/plate";

// Sipariş formunda plaka yazılınca gösterilen kısa araç bilgisi (son müşteri,
// son ziyaret, depodaki lastik). Sipariş formu herkese açık olduğundan (bkz.
// POST /api/orders) özel bir izin istenmez; sipariş tutarı gibi finansal veri
// DÖNMEZ — tam geçmiş araç kartında (GET /api/vehicles/[plate], orders.view).
// Kayıtlı araç yoksa { vehicle: null } (hata değil — yeni araç). Araç bir
// firmaya bağlıysa fleet (firma adı/telefonu) ve son siparişteki "Aracı
// Getiren" de döner — form müşteriyi firmayla doldurur.
export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });

  const plate = normalizePlate(new URL(request.url).searchParams.get("plate"));
  if (!isValidTrPlate(plate)) return NextResponse.json({ valid: false, vehicle: null });

  try {
    const result = await pool.query(
      `SELECT v.plate,
              last_order.customer_name, last_order.customer_phone, last_order.created_at AS last_visit,
              last_order.driver_name, last_order.driver_phone,
              CASE WHEN fc.id IS NOT NULL THEN json_build_object('id', fc.id, 'name', fc.name, 'phone', fc.phone) END AS fleet,
              (SELECT COUNT(*)::int FROM orders o WHERE o.tenant_id = v.tenant_id AND o.vehicle_id = v.id) AS order_count,
              (SELECT json_build_object('depo_no', s.depo_no, 'mevsim', s.mevsim, 'adet', s.adet, 'marka', s.marka, 'ebat', s.ebat)
                 FROM storage s
                WHERE s.tenant_id = v.tenant_id AND s.vehicle_id = v.id AND s.teslim_edildi = false
                ORDER BY s.created_at DESC LIMIT 1) AS active_storage
       FROM vehicles v
       LEFT JOIN LATERAL (
         SELECT o.customer_name, o.customer_phone, o.created_at, o.driver_name, o.driver_phone
           FROM orders o
          WHERE o.tenant_id = v.tenant_id AND o.vehicle_id = v.id
          ORDER BY o.created_at DESC, o.id DESC LIMIT 1
       ) last_order ON true
       LEFT JOIN customers fc ON fc.id = v.customer_id AND fc.tenant_id = v.tenant_id
       WHERE v.tenant_id = $1 AND v.plate = $2`,
      [user.tenantId, plate]
    );
    return NextResponse.json({ valid: true, vehicle: result.rows[0] ?? null });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
