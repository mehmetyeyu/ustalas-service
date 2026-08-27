import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { notifyTenantAdmins } from "@/lib/push";
import { notifyCustomerAppointmentConfirmed } from "@/lib/whatsapp";

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "appointments.view")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const countOnly = searchParams.get("count") === "1";

  const conditions: string[] = ["tenant_id = $1"];
  const values: (string | number)[] = [user.tenantId!];
  if (status) {
    values.push(status);
    conditions.push(`status = $${values.length}`);
  }

  try {
    // Nav'daki bekleyen-randevu rozeti (bkz. admin/layout.tsx) 60sn'de bir
    // sadece bir SAYI göstermek için tüm satırları (isim/telefon/not dahil)
    // çekiyordu — appointments_tenant_status_idx'in karşıladığı ucuz bir
    // COUNT(*) yeterli, ?count=1 ile bu yola ayrıca çıkılıyor.
    if (countOnly) {
      const result = await pool.query<{ count: string }>(
        `SELECT COUNT(*) FROM appointments WHERE ${conditions.join(" AND ")}`,
        values
      );
      return NextResponse.json({ count: Number(result.rows[0].count) });
    }

    const result = await pool.query(
      `SELECT a.id, a.plate, a.customer_name, a.customer_phone, a.requested_at, a.status,
              a.order_id, a.notes, a.created_at, s.name AS service_name
       FROM appointments a
       LEFT JOIN services s ON s.id = a.service_id
       WHERE ${conditions.map((c) => `a.${c}`).join(" AND ")}
       ORDER BY a.requested_at DESC`,
      values
    );
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}

// Personelin telefonla gelen bir talebi elle girmesi için. NOT: public
// akışın aksine (bkz. /api/public/randevu/[slug]) burada kapasite/yarış-
// durumu kontrolü yapılmıyor — personel bilerek kapasiteyi aşan bir randevu
// girmek isteyebilir (ör. acil durum), bu yüzden engellenmiyor.
export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "appointments.create")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const { plate, customer_name, customer_phone, service_id, requested_at, notes } = await request.json();
    if (!plate || !String(plate).trim()) {
      return NextResponse.json({ error: "Plaka zorunludur." }, { status: 400 });
    }
    if (!customer_name || !String(customer_name).trim()) {
      return NextResponse.json({ error: "Ad Soyad zorunludur." }, { status: 400 });
    }
    if (!requested_at || Number.isNaN(new Date(requested_at).getTime())) {
      return NextResponse.json({ error: "Geçerli bir randevu zamanı gerekli." }, { status: 400 });
    }

    const result = await pool.query<{ id: number }>(
      `INSERT INTO appointments (tenant_id, plate, customer_name, customer_phone, service_id, requested_at, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, 'ONAYLANDI', $7) RETURNING id`,
      [
        user.tenantId,
        String(plate).replace(/\s+/g, "").toUpperCase(),
        String(customer_name).trim(),
        customer_phone || null,
        service_id || null,
        new Date(requested_at).toISOString(),
        notes || null,
      ]
    );
    await notifyTenantAdmins(user.tenantId!, {
      title: "Yeni Randevu Eklendi",
      body: `${String(customer_name).trim()} — ${String(plate).replace(/\s+/g, "").toUpperCase()}`,
      url: "/admin/appointments",
    });
    // Bu route her zaman doğrudan ONAYLANDI statüsüyle ekliyor (telefonla gelen
    // bir talebin personel tarafından girilmesi) — bu da PATCH'teki onaylama
    // kadar gerçek bir "ONAYLANDI" anı, müşteri aynı şekilde bilgilendirilir.
    let serviceName: string | null = null;
    if (service_id) {
      const svc = await pool.query<{ name: string }>(
        "SELECT name FROM services WHERE id = $1 AND tenant_id = $2",
        [service_id, user.tenantId]
      );
      serviceName = svc.rows[0]?.name ?? null;
    }
    await notifyCustomerAppointmentConfirmed(user.tenantId!, {
      customerName: String(customer_name).trim(),
      customerPhone: customer_phone || null,
      plate: String(plate).replace(/\s+/g, "").toUpperCase(),
      serviceName,
      requestedAt: new Date(requested_at),
    });
    return NextResponse.json({ id: result.rows[0].id }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
