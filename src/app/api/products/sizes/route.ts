import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

// Sipariş ekranındaki Ebat alanı için — ayrı bir dizin tablosu yok, mevcut
// ürünlerde (stok takibi yapılan) kullanılan ebatlardan dinamik olarak
// türetilir (bkz. /api/products/brands ile aynı desen). Tedarikçiye göre
// filtrelenmez (brand'in aksine ebat tedarikçiye özel bir şey değil) —
// İkinci El Lastik/Jant gibi stok takibi yapılmayan satışlarda da aynı
// (gerçek) ebat havuzundan öneri sunmak için.
export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });

  try {
    const result = await pool.query(
      `SELECT DISTINCT size_desc FROM products WHERE tenant_id = $1 AND size_desc IS NOT NULL AND size_desc <> '' ORDER BY size_desc`,
      [user.tenantId]
    );
    return NextResponse.json(result.rows.map((r) => r.size_desc));
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
