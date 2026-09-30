import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

// Mağaza Stok / Depo Stok arasında kısmi miktar taşıma — ör. 8 adetlik bir
// partinin 4'ünü Depo'ya gönder, 4'ü Mağaza'da kalsın. Aynı parti (kod+
// üretim haftası/yılı+tedarikçi) hedef konumda zaten varsa (bkz.
// products_code_batch_unique/products_code_nodate_unique) stoğu oraya
// EKLENİR; yoksa kaynağın tüm diğer alanları (fiyat, ebat, AB etiketi vb.)
// kopyalanarak yeni bir satır açılır — barkod HARİÇ (products_barcode_unique
// tenant başına benzersiz, aynı barkodu iki satıra yazamayız; "Kopyala"
// akışındaki aynı kısıtla tutarlı).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "products.edit")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const { id } = await params;
    const { quantity, to_location } = await request.json();

    const qty = Math.round(Number(quantity));
    if (!Number.isFinite(qty) || qty <= 0) {
      return NextResponse.json({ error: "Geçersiz miktar." }, { status: 400 });
    }
    const toLocation = String(to_location ?? "").trim();
    if (!toLocation) {
      return NextResponse.json({ error: "Hedef konum zorunludur." }, { status: 400 });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const sourceResult = await client.query(
        "SELECT * FROM products WHERE id = $1 AND tenant_id = $2 FOR UPDATE",
        [id, user.tenantId]
      );
      if (sourceResult.rowCount === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Ürün bulunamadı." }, { status: 404 });
      }
      const source = sourceResult.rows[0];

      if ((source.location ?? "") === toLocation) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Kaynak ve hedef konum aynı olamaz." }, { status: 400 });
      }
      if (qty > source.stock_qty) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: `Yetersiz stok — mevcut: ${source.stock_qty}.` }, { status: 400 });
      }

      // Hedef konumda AYNI parti (kod+üretim haftası/yılı+tedarikçi) zaten var
      // mı — PATCH /api/products/[id]'deki konum-değişince-birleştirme
      // sorgusuyla aynı desen.
      const siblingResult = source.production_year != null
        ? await client.query(
            `SELECT id FROM products
             WHERE tenant_id=$1 AND code=$2 AND production_year=$3 AND production_week=$4
               AND COALESCE(supplier,'')=COALESCE($5,'') AND location=$6 AND id != $7
             FOR UPDATE`,
            [user.tenantId, source.code, source.production_year, source.production_week, source.supplier, toLocation, source.id]
          )
        : await client.query(
            `SELECT id FROM products
             WHERE tenant_id=$1 AND code=$2 AND production_year IS NULL AND location=$3 AND id != $4
             FOR UPDATE`,
            [user.tenantId, source.code, toLocation, source.id]
          );

      let destinationId;
      if (siblingResult.rowCount && siblingResult.rowCount > 0) {
        destinationId = siblingResult.rows[0].id;
        await client.query(
          "UPDATE products SET stock_qty = stock_qty + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
          [qty, destinationId]
        );
      } else {
        const inserted = await client.query(
          `INSERT INTO products
             (tenant_id, code, brand, size_desc, season, supplier, location, production_week, production_year,
              purchase_price, sale_price, stock_qty, product_type, width_mm, profile_pct, rim_diameter, tread_depth_mm,
              model_name, load_speed_index, eu_fuel_class, eu_wet_grip_class, eu_noise_db, eu_noise_class,
              rim_size, pcd, offset_et, min_stock_threshold)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)
           RETURNING id`,
          [
            user.tenantId, source.code, source.brand, source.size_desc, source.season, source.supplier, toLocation,
            source.production_week, source.production_year, source.purchase_price, source.sale_price, qty,
            source.product_type, source.width_mm, source.profile_pct, source.rim_diameter, source.tread_depth_mm,
            source.model_name, source.load_speed_index, source.eu_fuel_class, source.eu_wet_grip_class,
            source.eu_noise_db, source.eu_noise_class, source.rim_size, source.pcd, source.offset_et, source.min_stock_threshold,
          ]
        );
        destinationId = inserted.rows[0].id;
      }

      await client.query(
        "UPDATE products SET stock_qty = stock_qty - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
        [qty, source.id]
      );

      await client.query("COMMIT");
      return NextResponse.json({ sourceId: source.id, destinationId, quantity: qty, toLocation });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && error.code === "23505") {
      return NextResponse.json({ error: "Eşzamanlı bir işlemle çakıştı, tekrar deneyin." }, { status: 409 });
    }
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
