import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { convertAppointmentToOrder, AppointmentNotFoundError, AppointmentAlreadyConvertedError, CustomOrderNoRequiredError } from "@/lib/appointments";

// İki kaynağı da ilgilendiriyor (randevuyu onaylıyorsun + bir sipariş
// oluşturuyorsun) — bkz. src/app/api/customers/[id]/orders/route.ts'teki
// çift-izin deseniyle aynı mantık.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "appointments.approve") || !hasPermission(user, "orders.edit")) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });
  }

  try {
    const { id } = await params;
    // Gövde boş olabilir (firma Sipariş No'yu elle girmiyorsa) — bu yüzden
    // request.json() başarısız olursa sessizce boş nesneye düşülür.
    const { custom_order_no } = await request.json().catch(() => ({ custom_order_no: undefined }));
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const orderId = await convertAppointmentToOrder(client, user.tenantId!, Number(id), custom_order_no);
      await client.query("COMMIT");
      return NextResponse.json({ order_id: orderId });
    } catch (err) {
      await client.query("ROLLBACK");
      if (err instanceof AppointmentNotFoundError) {
        return NextResponse.json({ error: err.message }, { status: 404 });
      }
      if (err instanceof AppointmentAlreadyConvertedError) {
        return NextResponse.json({ error: err.message }, { status: 409 });
      }
      if (err instanceof CustomOrderNoRequiredError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      // orders_tenant_custom_order_no_unique
      if (err && typeof err === "object" && "code" in err && err.code === "23505") {
        return NextResponse.json({ error: "Bu sipariş numarası zaten kullanılıyor." }, { status: 409 });
      }
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
