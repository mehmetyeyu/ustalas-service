import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

// Yeni Ürün/Parti ekranındaki Marka alanı için mevcut ürünlerde kullanılan
// markaların dinamik listesi — ayrı bir dizin tablosu yok, doğrudan products
// tablosundaki farklı (distinct) değerlerden türetilir.
export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "products.view")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const result = await pool.query(
      `SELECT DISTINCT brand FROM products WHERE tenant_id = $1 AND brand IS NOT NULL AND brand <> '' ORDER BY brand`,
      [user.tenantId]
    );
    return NextResponse.json(result.rows.map((r) => r.brand));
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
