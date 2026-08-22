import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "customers.edit")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const { id } = await params;
    const { name, phone } = await request.json();
    if (!name || !String(name).trim()) {
      return NextResponse.json({ error: "Müşteri adı zorunludur." }, { status: 400 });
    }

    const result = await pool.query(
      "UPDATE customers SET name = $1, phone = $2 WHERE id = $3 AND tenant_id = $4",
      [String(name).trim(), phone ? String(phone).trim() : null, id, user.tenantId]
    );
    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Müşteri bulunamadı." }, { status: 404 });
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
  if (!hasPermission(user, "customers.delete")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const { id } = await params;

    // orders.customer_name FK değil (serbest metin) — aktif (BEKLEMEDE) siparişi
    // olan bir müşteri silinirse o sipariş dizindeki bağlantısını (isimden ibaret)
    // kaybeder; bu yüzden aktif siparişi varken silme engellenir. Tamamlanmış
    // (geçmiş) siparişleri olan müşteriler yine de silinebilir.
    const customerResult = await pool.query<{ name: string }>(
      "SELECT name FROM customers WHERE id = $1 AND tenant_id = $2",
      [id, user.tenantId]
    );
    if (customerResult.rows.length === 0) {
      return NextResponse.json({ error: "Müşteri bulunamadı." }, { status: 404 });
    }

    const activeOrders = await pool.query(
      "SELECT id FROM orders WHERE customer_name = $1 AND tenant_id = $2 AND status = 'BEKLEMEDE' LIMIT 1",
      [customerResult.rows[0].name, user.tenantId]
    );
    if (activeOrders.rows.length > 0) {
      return NextResponse.json(
        { error: "Bu müşterinin aktif (beklemede) bir siparişi var, önce o siparişi tamamlayın veya silin." },
        { status: 409 }
      );
    }

    await pool.query("DELETE FROM customers WHERE id = $1 AND tenant_id = $2", [id, user.tenantId]);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
