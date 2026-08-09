import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { upsertDirectoryNames } from "@/lib/directories";
import { normalizeYear } from "@/lib/productsExcel";

// Sipariş Düzelt ekranında, zaten bir partiye bağlı (product_id dolu) bir
// satırın güncel stok durumunu öğrenmek için kullanılır — stok Girişi/Çıkışı
// bağımsız, tek bir partinin gerçek anlık stock_qty'sini döner (0 dahil;
// /api/products/stock-batches'in aksine sıfır stoklu partiyi de gösterir).
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });

  try {
    const { id } = await params;
    const result = await pool.query(
      "SELECT id, stock_qty FROM products WHERE id = $1",
      [id]
    );
    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Ürün bulunamadı." }, { status: 404 });
    }
    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });

  try {
    const { id } = await params;
    const body = await request.json();
    const { code, brand, size_desc, season, supplier, production_week, production_year, purchase_price, sale_price, stock_qty } = body;

    if (!code || !String(code).trim()) {
      return NextResponse.json({ error: "Ürün kodu zorunludur." }, { status: 400 });
    }

    if (supplier) await upsertDirectoryNames(pool, "suppliers", [supplier]);

    const trimmedCode = String(code).trim();
    const isDated = production_week != null && production_week !== "" && production_year != null && production_year !== "";
    const yearVal = isDated ? normalizeYear(Number(production_year)) : null;
    const supplierVal = supplier || null;
    const qty = Number(stock_qty) || 0;

    // Düzenlenen partiyi başka bir mevcut partiyle aynı kimliğe (kod+hafta/yılı+
    // tedarikçi) getirirseniz, iki ayrı satır olarak çakışmak yerine BİRLEŞTİRİLİR:
    // stok toplanır, fiyat geçmişi hedef partiye taşınır, bu satır silinir.
    const targetResult = isDated
      ? await pool.query(
          `SELECT * FROM products WHERE code=$1 AND production_year=$2 AND production_week=$3 AND COALESCE(supplier,'')=COALESCE($4,'') AND id != $5`,
          [trimmedCode, yearVal, production_week, supplierVal, id]
        )
      : await pool.query(
          `SELECT * FROM products WHERE code=$1 AND production_year IS NULL AND id != $2`,
          [trimmedCode, id]
        );

    if (targetResult.rowCount && targetResult.rowCount > 0) {
      const target = targetResult.rows[0];
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const merged = await client.query(
          `UPDATE products SET
            brand=$1, size_desc=$2, season=$3, purchase_price=$4, sale_price=$5,
            stock_qty=stock_qty + $6, updated_at=CURRENT_TIMESTAMP
           WHERE id=$7 RETURNING *`,
          [brand || null, size_desc || null, season || null, purchase_price ?? null, sale_price ?? null, qty, target.id]
        );
        await client.query(`UPDATE product_stock_entries SET product_id=$1 WHERE product_id=$2`, [target.id, id]);
        await client.query(`DELETE FROM products WHERE id=$1`, [id]);
        await client.query("COMMIT");
        return NextResponse.json(merged.rows[0]);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }

    const result = await pool.query(
      `UPDATE products SET
        code=$1, brand=$2, size_desc=$3, season=$4, supplier=$5,
        production_week=$6, production_year=$7, purchase_price=$8, sale_price=$9, stock_qty=$10, updated_at=CURRENT_TIMESTAMP
       WHERE id=$11 RETURNING *`,
      [
        trimmedCode, brand || null, size_desc || null, season || null, supplierVal,
        isDated ? production_week : null, yearVal, purchase_price ?? null, sale_price ?? null, qty, id,
      ]
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Ürün bulunamadı." }, { status: 404 });
    }
    return NextResponse.json(result.rows[0]);
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && error.code === "23505") {
      return NextResponse.json({ error: "Bu kod, üretim haftası/yılı ve tedarikçiye sahip bir parti zaten mevcut." }, { status: 409 });
    }
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

  try {
    const { id } = await params;
    const result = await pool.query("DELETE FROM products WHERE id = $1 RETURNING id", [id]);
    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Ürün bulunamadı." }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
