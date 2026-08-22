import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

// "Malzeme Hareketleri": stoğu 0'a inince ana listeden (ve parti seçicilerden)
// kalkan partilerin geçmişini kaybetmemek için ayrı bir görünüm — hem Stok
// Girişleri (product_stock_entries, "in") hem de bir partiye bağlı sipariş
// satışları (order_services.product_id, "out" — müşteri/plaka bilgisiyle
// birlikte) geriye dönük, mevcut stok durumundan bağımsız şekilde listelenir.
export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "products.view")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(500, Math.max(1, parseInt(searchParams.get("limit") ?? "20")));
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const values: (string | number)[] = [];

  if (search) {
    // Ebat aramasında "/" zorunlu olmasın diye ("205/45R19" yerine "20545R19" de
    // yazılabilsin) hem arama metninden hem size_desc'ten "/" çıkarılıp da ayrıca
    // karşılaştırılır — diğer alanlar normal ILIKE ile eşleşir.
    values.push(`%${escapeLike(search)}%`, `%${escapeLike(search.replace(/\//g, ""))}%`);
    const rawIdx = values.length - 1;
    const noSlashIdx = values.length;
    conditions.push(
      `(code ILIKE $${rawIdx} OR brand ILIKE $${rawIdx} OR supplier ILIKE $${rawIdx} OR customer_name ILIKE $${rawIdx} OR plate ILIKE $${rawIdx} OR size_desc ILIKE $${rawIdx} OR REPLACE(size_desc, '/', '') ILIKE $${noSlashIdx})`
    );
  }

  const where = conditions.length > 0 ? " WHERE " + conditions.join(" AND ") : "";

  // order_services.unit_price/cost_price satırın TOPLAMIdır (birim fiyat değil,
  // bkz. src/app/page.tsx) — burada diğer ("in") satırlarla aynı birimde
  // (parça başı) kıyaslanabilsin diye Adet'e bölünerek birim fiyata çevrilir.
  const combinedCte = `
    WITH combined AS (
      SELECT
        'in' AS type, e.id AS entry_id, e.entry_date AS event_date, e.created_at,
        e.quantity, e.purchase_price, e.sale_price,
        NULL::varchar AS customer_name, NULL::varchar AS plate, NULL::int AS order_id,
        p.id AS product_id, p.code, p.brand, p.size_desc, p.supplier,
        p.production_week, p.production_year, p.stock_qty AS current_stock
      FROM product_stock_entries e
      JOIN products p ON p.id = e.product_id

      UNION ALL

      SELECT
        'out' AS type, os.id AS entry_id, o.created_at::date AS event_date, o.created_at,
        os.quantity,
        CASE WHEN os.quantity > 0 THEN os.cost_price / os.quantity ELSE NULL END AS purchase_price,
        CASE WHEN os.quantity > 0 THEN os.unit_price / os.quantity ELSE NULL END AS sale_price,
        o.customer_name, o.plate, o.id AS order_id,
        p.id AS product_id, p.code, p.brand, p.size_desc, p.supplier,
        p.production_week, p.production_year, p.stock_qty AS current_stock
      FROM order_services os
      JOIN orders o ON o.id = os.order_id
      JOIN products p ON p.id = os.product_id
    )
  `;

  try {
    const result = await pool.query(
      `${combinedCte}
       SELECT * FROM combined${where}
       ORDER BY event_date DESC, created_at DESC, entry_id DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset]
    );
    const countResult = await pool.query(
      `${combinedCte} SELECT COUNT(*)::int AS total FROM combined${where}`,
      values
    );
    return NextResponse.json({ items: result.rows, total: countResult.rows[0].total, page, limit });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
