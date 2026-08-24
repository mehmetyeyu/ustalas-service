import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

const APPROVAL_STATUSES = new Set(["ONAYLANDI", "REDDEDILDI", "GELMEDI", "IPTAL"]);

// status değişimi (onayla/reddet/gelmedi/iptal) appointments.approve ister;
// diğer alanların (saat/hizmet/plaka/not) düzenlenmesi appointments.edit —
// bkz. src/app/api/orders/[id]/route.ts'teki PATCH(onayla)/PUT(düzenle)
// ayrımıyla aynı mantık, tek bir PATCH'te birleştirildi (randevunun
// düzenlenebilir yüzeyi siparişe göre çok daha küçük).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });

  try {
    const { id } = await params;
    const body = await request.json();
    const { status, plate, customer_name, customer_phone, service_id, requested_at, notes } = body;

    if (status !== undefined) {
      if (!APPROVAL_STATUSES.has(status)) {
        return NextResponse.json({ error: "Geçersiz statü." }, { status: 400 });
      }
      if (!hasPermission(user, "appointments.approve")) {
        return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });
      }
      const result = await pool.query(
        "UPDATE appointments SET status = $1 WHERE id = $2 AND tenant_id = $3",
        [status, id, user.tenantId]
      );
      if (result.rowCount === 0) return NextResponse.json({ error: "Randevu bulunamadı." }, { status: 404 });
    }

    const hasFieldEdits = plate !== undefined || customer_name !== undefined || customer_phone !== undefined
      || service_id !== undefined || requested_at !== undefined || notes !== undefined;
    if (hasFieldEdits) {
      if (!hasPermission(user, "appointments.edit")) {
        return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });
      }
      if (customer_name !== undefined && !String(customer_name).trim()) {
        return NextResponse.json({ error: "Ad Soyad zorunludur." }, { status: 400 });
      }
      const sets: string[] = [];
      const values: (string | number | null)[] = [];
      if (plate !== undefined) { values.push(String(plate).replace(/\s+/g, "").toUpperCase()); sets.push(`plate = $${values.length}`); }
      if (customer_name !== undefined) { values.push(String(customer_name).trim()); sets.push(`customer_name = $${values.length}`); }
      if (customer_phone !== undefined) { values.push(customer_phone || null); sets.push(`customer_phone = $${values.length}`); }
      if (service_id !== undefined) { values.push(service_id || null); sets.push(`service_id = $${values.length}`); }
      if (requested_at !== undefined) { values.push(new Date(requested_at).toISOString()); sets.push(`requested_at = $${values.length}`); }
      if (notes !== undefined) { values.push(notes || null); sets.push(`notes = $${values.length}`); }
      values.push(id, user.tenantId!);
      const result = await pool.query(
        `UPDATE appointments SET ${sets.join(", ")} WHERE id = $${values.length - 1} AND tenant_id = $${values.length}`,
        values
      );
      if (result.rowCount === 0) return NextResponse.json({ error: "Randevu bulunamadı." }, { status: 404 });
    }

    if (status === undefined && !hasFieldEdits) {
      return NextResponse.json({ error: "Güncellenecek bir alan gönderilmedi." }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "appointments.delete")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const { id } = await params;
    const result = await pool.query("DELETE FROM appointments WHERE id = $1 AND tenant_id = $2", [id, user.tenantId]);
    if (result.rowCount === 0) return NextResponse.json({ error: "Randevu bulunamadı." }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
