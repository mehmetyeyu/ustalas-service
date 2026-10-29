import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { isValidTrPlate, normalizePlate } from "@/lib/plate";

// Araç kartı — bir aracın vehicle_id ile BAĞLI siparişleri, depolama
// kayıtları ve randevuları (bkz. database/schema.sql vehicles notu: plaka
// metniyle eşleştirme bilerek yapılmaz, eski uydurma plakalar karışmasın).
// Sipariş tutarları gösterildiği için orders.view gerekir; depolama ve
// randevu bölümleri ilgili izin yoksa boş döner.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ plate: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "orders.view")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  const plate = normalizePlate(decodeURIComponent((await params).plate));
  if (!isValidTrPlate(plate)) {
    return NextResponse.json({ error: "Geçerli bir plaka değil.", plate, valid: false }, { status: 404 });
  }

  try {
    const vehicleResult = await pool.query<{ id: number; plate: string; created_at: string; fleet: { id: number; name: string } | null }>(
      `SELECT v.id, v.plate, v.created_at,
              CASE WHEN c.id IS NOT NULL THEN json_build_object('id', c.id, 'name', c.name) END AS fleet
       FROM vehicles v LEFT JOIN customers c ON c.id = v.customer_id AND c.tenant_id = v.tenant_id
       WHERE v.tenant_id = $1 AND v.plate = $2`,
      [user.tenantId, plate]
    );
    const vehicle = vehicleResult.rows[0];
    if (!vehicle) return NextResponse.json({ error: "Bu plakayla henüz kayıt yok.", plate, valid: true }, { status: 404 });

    const canStorage = hasPermission(user, "storage.view");
    const canAppointments = hasPermission(user, "appointments.view");
    const empty = Promise.resolve({ rows: [] });
    const [ordersResult, storageResult, appointmentsResult] = await Promise.all([
      pool.query(
        `SELECT o.id, o.custom_order_no, o.created_at, o.status, o.total_amount::float AS total_amount,
                o.customer_name, o.customer_phone, o.payment_type, o.driver_name,
                (SELECT string_agg(s.name || CASE WHEN os.quantity > 1 THEN ' ×' || os.quantity ELSE '' END, ', ' ORDER BY os.id)
                   FROM order_services os JOIN services s ON s.id = os.service_id
                  WHERE os.order_id = o.id AND os.tenant_id = o.tenant_id) AS summary,
                (SELECT string_agg(DISTINCT concat_ws(' ', os.brand, os.model_name, os.size_desc), ', ')
                   FROM order_services os
                  WHERE os.order_id = o.id AND os.tenant_id = o.tenant_id AND os.product_id IS NOT NULL) AS products
         FROM orders o
         WHERE o.tenant_id = $1 AND o.vehicle_id = $2
         ORDER BY o.created_at DESC, o.id DESC
         LIMIT 200`,
        [user.tenantId, vehicle.id]
      ),
      canStorage
        ? pool.query(
            `SELECT id, depo_no, customer_name, ebat, marka, model_name, adet, mevsim, dis_derinligi,
                    production_week, production_year, to_char(islem_tarihi, 'YYYY-MM-DD') AS islem_tarihi,
                    teslim_edildi, to_char(teslim_tarihi, 'YYYY-MM-DD') AS teslim_tarihi
             FROM storage WHERE tenant_id = $1 AND vehicle_id = $2
             ORDER BY teslim_edildi, created_at DESC`,
            [user.tenantId, vehicle.id]
          )
        : empty,
      canAppointments
        ? pool.query(
            `SELECT a.id, a.requested_at, a.status, a.customer_name, s.name AS service_name, a.order_id
             FROM appointments a LEFT JOIN services s ON s.id = a.service_id
             WHERE a.tenant_id = $1 AND a.vehicle_id = $2
             ORDER BY a.requested_at DESC
             LIMIT 50`,
            [user.tenantId, vehicle.id]
          )
        : empty,
    ]);

    return NextResponse.json({
      vehicle,
      orders: ordersResult.rows,
      storage: storageResult.rows,
      appointments: appointmentsResult.rows,
      can_view_storage: canStorage,
      can_view_appointments: canAppointments,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
