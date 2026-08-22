import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

// Sipariş oluşturma ekranındaki Müşteri alanı için dizin listesi.
export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });

  try {
    // order_count hesabı tüm siparişler üzerinde JOIN+GROUP BY gerektirir; bu
    // sadece admin Müşteriler sayfasında ("Siparişler" linki hiç siparişi
    // olmayan müşteride gösterilmesin diye) kullanılıyor. Sipariş oluşturma
    // ekranındaki Müşteri otomatik tamamlaması (page.tsx, admin/orders/[id])
    // order_count'u hiç okumuyor ama bu endpoint'i çok sık çağırıyor — o yüzden
    // varsayılan olarak ucuz sorgu (sadece customers tablosu) dönüyor, sayım
    // yalnızca ?withCounts=1 istendiğinde hesaplanıyor.
    const withCounts = request.nextUrl.searchParams.get("withCounts") === "1";
    const result = await pool.query(
      withCounts
        ? `SELECT c.id, c.name, c.phone, COUNT(o.id)::int AS order_count
           FROM customers c
           LEFT JOIN orders o ON o.customer_name = c.name AND o.tenant_id = c.tenant_id
           WHERE c.tenant_id = $1
           GROUP BY c.id, c.name, c.phone
           ORDER BY c.name`
        : `SELECT id, name, phone FROM customers WHERE tenant_id = $1 ORDER BY name`,
      [user.tenantId]
    );
    return NextResponse.json(result.rows, {
      headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=60" },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "customers.create")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const { name, phone } = await request.json();
    if (!name || !String(name).trim()) {
      return NextResponse.json({ error: "Müşteri adı zorunludur." }, { status: 400 });
    }

    // Aynı isimle (ör. sipariş oluştururken) tekrar eklenirse, boş bırakılan
    // telefon mevcut kaydı sessizce silmesin diye orders.ts'teki upsertle aynı
    // COALESCE deseni kullanılır.
    const result = await pool.query(
      `INSERT INTO customers (tenant_id, name, phone) VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, name) DO UPDATE SET phone = COALESCE(EXCLUDED.phone, customers.phone)
       RETURNING id, name, phone`,
      [user.tenantId, String(name).trim(), phone ? String(phone).trim() : null]
    );
    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
