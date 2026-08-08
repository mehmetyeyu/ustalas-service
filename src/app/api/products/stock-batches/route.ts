import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

// Sipariş ekranındaki "Lastik Satışı" akışı için: seçilen tedarikçi + ürün
// koduna ait, stoğu olan partiler (Üretim Haftası/Yılı seçimi doldurur).
export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const supplier = searchParams.get("supplier");
  const code = searchParams.get("code");
  if (!supplier || !supplier.trim() || !code || !code.trim()) return NextResponse.json([]);

  try {
    // avg_purchase_price/avg_sale_price: Tutar ve Maliyet alanlarını otomatik
    // doldurmak için — parti seçildiğinde Ürün sayfasındaki gibi miktar
    // ağırlıklı ortalama fiyat kullanılır (elle de değiştirilebilir).
    const result = await pool.query(
      `SELECT p.id, p.production_week, p.production_year, p.size_desc, p.stock_qty,
              COALESCE(avg_sub.avg_purchase_price, p.purchase_price) AS avg_purchase_price,
              COALESCE(avg_sub.avg_sale_price, p.sale_price) AS avg_sale_price
       FROM products p
       LEFT JOIN (
         SELECT product_id,
                SUM(quantity * purchase_price) / NULLIF(SUM(quantity) FILTER (WHERE purchase_price IS NOT NULL), 0) AS avg_purchase_price,
                SUM(quantity * sale_price) / NULLIF(SUM(quantity) FILTER (WHERE sale_price IS NOT NULL), 0) AS avg_sale_price
         FROM product_stock_entries
         WHERE product_id IN (SELECT id FROM products WHERE supplier = $1 AND code = $2)
         GROUP BY product_id
       ) avg_sub ON avg_sub.product_id = p.id
       WHERE p.supplier = $1 AND p.code = $2 AND p.stock_qty > 0
       ORDER BY p.production_year NULLS FIRST, p.production_week NULLS FIRST, p.id`,
      [supplier.trim(), code.trim()]
    );
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
