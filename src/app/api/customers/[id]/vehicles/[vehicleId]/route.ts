import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { logAudit } from "@/lib/auditLog";
import { formatPlate } from "@/lib/plate";

// Aracı firmadan çıkarır — araç kaydı ve geçmişi kalır, yalnızca firma
// bağlantısı kopar.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; vehicleId: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "customers.edit")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  const { id, vehicleId } = await params;
  if (!/^\d+$/.test(id) || !/^\d+$/.test(vehicleId)) {
    return NextResponse.json({ error: "Araç bulunamadı." }, { status: 404 });
  }
  try {
    const result = await pool.query<{ plate: string; name: string }>(
      `UPDATE vehicles v SET customer_id = NULL
       FROM customers c
       WHERE v.id = $1 AND v.tenant_id = $2 AND v.customer_id = $3
         AND c.id = v.customer_id AND c.tenant_id = v.tenant_id
       RETURNING v.plate, c.name`,
      [vehicleId, user.tenantId, id]
    );
    if (result.rows.length === 0) return NextResponse.json({ error: "Araç bulunamadı." }, { status: 404 });
    const { plate, name } = result.rows[0];
    await logAudit({
      tenantId: user.tenantId!, userId: user.userId, username: user.username,
      action: "customer.vehicle_remove", tableName: "vehicles", recordId: Number(vehicleId),
      detail: `Müşteri: ${name}, Araç: ${formatPlate(plate)}`,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
