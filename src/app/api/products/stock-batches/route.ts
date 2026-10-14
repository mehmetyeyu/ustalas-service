import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

// Sipariş ekranındaki "Lastik Satışı" akışı için: seçilen tedarikçi + ürün
// koduna ait, stoğu olan partiler (Üretim Haftası/Yılı seçimi doldurur).
// ?id= ile tek bir parti de istenebilir — Ürünler ekranındaki "Sipariş"
// butonu sipariş formunu /?product=<id> ile açar, form o partinin
// tedarikçi/kod/fiyat bilgisini buradan alıp satırı ön doldurur. Ayrı bir
// endpoint yerine burası kullanılıyor çünkü sipariş oluşturan personelin
// (ör. Karşılama Görevlisi) products.view izni olmayabilir, bu route ise
// zaten sipariş formu için sadece oturum ister.
export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const idParam = searchParams.get("id");
  const productId = idParam ? Number(idParam) : null;
  const supplier = searchParams.get("supplier");
  const code = searchParams.get("code");
  if (productId != null) {
    if (!Number.isInteger(productId) || productId <= 0) return NextResponse.json([]);
  } else if (!supplier || !supplier.trim() || !code || !code.trim()) {
    return NextResponse.json([]);
  }

  // Sadece tek bir parti istendiğinde id ile, aksi halde tedarikçi+kod ile
  // filtrelenir — iki durumda da aynı kolonlar/ortalama fiyat hesabı döner.
  const filter = productId != null
    ? { inner: "id = $1 AND tenant_id = $2", outer: "p.id = $1 AND p.tenant_id = $2", values: [productId, user.tenantId] }
    : {
        inner: "supplier = $1 AND code = $2 AND tenant_id = $3",
        outer: "p.supplier = $1 AND p.code = $2 AND p.tenant_id = $3",
        values: [supplier!.trim(), code!.trim(), user.tenantId],
      };

  try {
    // avg_purchase_price/avg_sale_price: Tutar ve Maliyet alanlarını otomatik
    // doldurmak için — parti seçildiğinde Ürün sayfasındaki gibi miktar
    // ağırlıklı ortalama fiyat kullanılır (elle de değiştirilebilir).
    const result = await pool.query(
      `SELECT p.id, p.code, p.supplier, p.product_type,
              p.production_week, p.production_year, p.size_desc, p.stock_qty, p.location,
              p.brand, p.model_name,
              COALESCE(avg_sub.avg_purchase_price, p.purchase_price) AS avg_purchase_price,
              COALESCE(avg_sub.avg_sale_price, p.sale_price) AS avg_sale_price
       FROM products p
       LEFT JOIN (
         SELECT product_id,
                SUM(quantity * purchase_price) / NULLIF(SUM(quantity) FILTER (WHERE purchase_price IS NOT NULL), 0) AS avg_purchase_price,
                SUM(quantity * sale_price) / NULLIF(SUM(quantity) FILTER (WHERE sale_price IS NOT NULL), 0) AS avg_sale_price
         FROM product_stock_entries
         WHERE product_id IN (SELECT id FROM products WHERE ${filter.inner})
         GROUP BY product_id
       ) avg_sub ON avg_sub.product_id = p.id
       WHERE ${filter.outer} AND p.stock_qty > 0
       ORDER BY p.production_year NULLS FIRST, p.production_week NULLS FIRST, p.id`,
      filter.values
    );
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
