import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

// Bir Fiyat Geçmişi (product_stock_entries) kaydındaki Alış/Satış fiyatını
// düzeltir — sadece bu geçmiş satırını hedefler, ürünün güncel fiyatına
// (products.purchase_price/sale_price, "Düzenle" ile ayrıca değiştirilir)
// dokunmaz. Miktar/Tarih burada değiştirilemez (stok_qty'yi etkiler, kapsam
// dışı) — tek amaç, "Stok Girişi" sırasında birim fiyat yerine yanlışlıkla
// toplam tutar girilmiş bir kaydı sonradan düzeltebilmek (bkz. Ürün
// Kataloğu'ndaki "(Birim, ₺)" etiketi/"Toplam" önizlemesi — bu hatayı
// KAYDETMEDEN önce yakalamaya çalışıyor, bu uç ise kaydedilmiş bir hatayı
// geriye dönük düzeltir).
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "products.edit")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const { id, entryId } = await params;
    const { purchase_price, sale_price } = await request.json();

    if (purchase_price != null && purchase_price !== "" && (!Number.isFinite(Number(purchase_price)) || Number(purchase_price) < 0)) {
      return NextResponse.json({ error: "Geçersiz alış fiyatı." }, { status: 400 });
    }
    if (sale_price != null && sale_price !== "" && (!Number.isFinite(Number(sale_price)) || Number(sale_price) < 0)) {
      return NextResponse.json({ error: "Geçersiz satış fiyatı." }, { status: 400 });
    }

    const result = await pool.query(
      `UPDATE product_stock_entries SET purchase_price = $1, sale_price = $2
       WHERE id = $3 AND product_id = $4 AND tenant_id = $5`,
      [
        purchase_price != null && purchase_price !== "" ? Number(purchase_price) : null,
        sale_price != null && sale_price !== "" ? Number(sale_price) : null,
        entryId, id, user.tenantId,
      ]
    );
    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Kayıt bulunamadı." }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
