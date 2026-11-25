import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { parseStorageId } from "@/lib/storageInput";
import { normalizePlate } from "@/lib/plate";
import { plateNormalizeSql } from "@/lib/vehicles";
import { buildTireDraft, type OrderDraftLine, type StorageOrderDraft } from "@/lib/storageOrderDraft";

// Siparişten "Depoya Al" penceresinin ön doldurması. Sipariş tutarı gibi
// finansal veri DÖNMEZ (sipariş izni olmayan depo personeli de kullanabilir).
export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "storage.create")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  const orderId = parseStorageId(new URL(request.url).searchParams.get("order") ?? "");
  if (orderId === null) return NextResponse.json({ error: "Geçersiz sipariş." }, { status: 400 });

  try {
    const orderResult = await pool.query(
      `SELECT o.id, o.custom_order_no, o.plate, o.customer_name, o.customer_phone, o.driver_name, o.vehicle_id,
              (SELECT json_build_object('depo_no', s.depo_no, 'teslim_edildi', s.teslim_edildi)
                 FROM storage s WHERE s.order_id = o.id AND s.tenant_id = o.tenant_id) AS existing
       FROM orders o WHERE o.id = $1 AND o.tenant_id = $2`,
      [orderId, user.tenantId]
    );
    const order = orderResult.rows[0];
    if (!order) return NextResponse.json({ error: "Sipariş bulunamadı." }, { status: 404 });
    if (!order.plate) return NextResponse.json({ error: "Plakasız siparişten depoya alınamaz." }, { status: 400 });

    const [linesResult, activeResult] = await Promise.all([
      pool.query<OrderDraftLine>(
        `SELECT sv.name AS service_name, sv.tracks_size, os.quantity, os.size_desc, p.product_type, p.season
         FROM order_services os
         JOIN services sv ON sv.id = os.service_id
         LEFT JOIN products p ON p.id = os.product_id AND p.tenant_id = os.tenant_id
         WHERE os.order_id = $1 AND os.tenant_id = $2 ORDER BY os.id`,
        [orderId, user.tenantId]
      ),
      pool.query(
        `SELECT id, depo_no, adet, mevsim, marka, ebat, jantli, rft FROM storage
         WHERE tenant_id = $1 AND teslim_edildi = false AND (vehicle_id = $2 OR ${plateNormalizeSql("plate")} = $3)
         ORDER BY created_at DESC LIMIT 10`,
        [user.tenantId, order.vehicle_id, normalizePlate(order.plate)]
      ),
    ]);

    const draft: StorageOrderDraft = {
      order_id: order.id,
      order_no: order.custom_order_no || `#${order.id}`,
      plate: order.plate,
      customer_name: order.customer_name,
      phone: order.customer_phone,
      existing: order.existing,
      active: activeResult.rows,
      ...buildTireDraft(linesResult.rows, order.driver_name),
    };
    return NextResponse.json(draft);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
