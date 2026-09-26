import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { upsertDirectoryNames } from "@/lib/directories";
import { normalizeYear } from "@/lib/productsExcel";
import { escapeLike } from "@/lib/sqlSafety";

// Liste Kod bazında GRUPLANIR: her Ürün Kodu tek bir kart/satır, altında farklı
// Üretim Tarihli partiler (batches) yer alır. Sayfalama grup (distinct kod)
// sayısına göre yapılır, böylece bir grubun partileri sayfalar arası bölünmez.
export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "products.view")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search");
  const season = searchParams.get("season");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(500, Math.max(1, parseInt(searchParams.get("limit") ?? "20")));
  const offset = (page - 1) * limit;

  // Sıralama: yalnızca gruplama sorgusunda doğrudan hesaplanan sütunlar
  // sıralanabilir (Alış/Satış Fiyatı Ort. ayrı bir sorgudan geldiği için
  // sayfalamadan önce mevcut değil, o yüzden burada yok). Bilinmeyen bir
  // sortBy gelirse (veya hiç gelmezse) varsayılan davranışa (son güncellenen
  // en üstte) dönülür.
  const SORTABLE_COLUMNS: Record<string, string> = {
    code: "code", brand: "brand", size_desc: "size_desc", total_stock: "total_stock",
  };
  const sortBy = searchParams.get("sortBy");
  const sortDir = searchParams.get("sortDir") === "desc" ? "DESC" : "ASC";
  const orderBy = sortBy && SORTABLE_COLUMNS[sortBy]
    ? `${SORTABLE_COLUMNS[sortBy]} ${sortDir} NULLS LAST, code ASC`
    : "last_updated DESC";

  const conditions: string[] = ["tenant_id = $1"];
  const values: (string | number)[] = [user.tenantId!];

  if (search) {
    // Ebat aramasında "/" karakteri zorunlu olmasın diye ("205/45R19" yerine
    // "20545R19" da yazılabilsin), hem arama metninden hem size_desc'ten "/"
    // çıkarılıp öyle karşılaştırılır — diğer alanlar normal ILIKE ile eşleşir.
    values.push(`%${escapeLike(search)}%`, `%${escapeLike(search.replace(/\//g, ""))}%`);
    conditions.push(
      `(code ILIKE $${values.length - 1} OR brand ILIKE $${values.length - 1} OR supplier ILIKE $${values.length - 1} OR size_desc ILIKE $${values.length - 1} OR REPLACE(size_desc, '/', '') ILIKE $${values.length})`
    );
  }
  if (season) {
    values.push(season);
    conditions.push(`season = $${values.length}`);
  }

  const where = conditions.length > 0 ? " WHERE " + conditions.join(" AND ") : "";

  try {
    const groupsResult = await pool.query(
      `SELECT code, MAX(brand) AS brand, MAX(size_desc) AS size_desc, MAX(season) AS season, MAX(barcode) AS barcode,
              MAX(product_type) AS product_type, MAX(width_mm) AS width_mm, MAX(profile_pct) AS profile_pct, MAX(rim_diameter) AS rim_diameter,
              MAX(model_name) AS model_name, MAX(load_speed_index) AS load_speed_index,
              MAX(eu_fuel_class) AS eu_fuel_class, MAX(eu_wet_grip_class) AS eu_wet_grip_class,
              MAX(eu_noise_db) AS eu_noise_db, MAX(eu_noise_class) AS eu_noise_class,
              MAX(rim_size) AS rim_size, MAX(pcd) AS pcd, MAX(offset_et) AS offset_et,
              MAX(min_stock_threshold) AS min_stock_threshold,
              SUM(stock_qty)::int AS total_stock, MAX(updated_at) AS last_updated
       FROM products${where}
       GROUP BY code
       ORDER BY ${orderBy}
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset]
    );
    const countResult = await pool.query(
      `SELECT COUNT(DISTINCT code)::int AS total FROM products${where}`,
      values
    );
    const total: number = countResult.rows[0].total;

    const codes = groupsResult.rows.map((r) => r.code);
    // avg_purchase_price / avg_sale_price: zararlı satış yapmamak için gösterilen
    // Alış Maliyeti/Satış Fiyatı, partinin ham (en son girilen) değeri değil, o
    // partiye ait tüm stok girişlerinin miktar ağırlıklı ortalamasıdır (tek giriş
    // varsa zaten o girişin fiyatına eşit çıkar, ekstra bir ayrım gerekmez).
    // stock_qty > 0: bir parti (tedarikçi+hafta/yılı) tamamen satılınca ekrandan
    // kalkar — sıfır stoklu tedarikçiler listede yer kaplamasın diye. Geçmiş
    // (hangi tedarikçiden ne zaman, ne kadar alındığı) kaybolmaz; Malzeme
    // Hareketleri'nde (/api/products/movements) görülmeye devam eder.
    const batchesResult = codes.length > 0
      ? await pool.query(
          `SELECT p.*, avg_sub.avg_purchase_price, avg_sub.avg_sale_price
           FROM products p
           LEFT JOIN (
             SELECT product_id,
                    SUM(quantity * purchase_price) / NULLIF(SUM(quantity) FILTER (WHERE purchase_price IS NOT NULL), 0) AS avg_purchase_price,
                    SUM(quantity * sale_price) / NULLIF(SUM(quantity) FILTER (WHERE sale_price IS NOT NULL), 0) AS avg_sale_price
             FROM product_stock_entries
             WHERE tenant_id = $2
             GROUP BY product_id
           ) avg_sub ON avg_sub.product_id = p.id
           WHERE p.code = ANY($1) AND p.tenant_id = $2 AND p.stock_qty > 0
           ORDER BY p.production_year NULLS FIRST, p.production_week NULLS FIRST, p.id`,
          [codes, user.tenantId]
        )
      : { rows: [] };

    const batchesByCode = new Map<string, unknown[]>();
    for (const row of batchesResult.rows) {
      const list = batchesByCode.get(row.code) ?? [];
      list.push(row);
      batchesByCode.set(row.code, list);
    }

    // Kod seviyesindeki genel Alış Maliyeti/Satış Fiyatı (Ort.): aynı koda ait
    // TÜM partilerin (farklı tedarikçi/hafta-yılı fark etmeksizin) tüm stok
    // girişlerinin miktar ağırlıklı ortalamasıdır — parti bazlı ortalamaların
    // kendisinin de miktar ağırlıklı ortalamasına eşittir.
    const avgByCode = new Map<string, { purchase: number | null; sale: number | null }>();
    if (codes.length > 0) {
      const codeAvgResult = await pool.query(
        `SELECT p.code,
                SUM(e.quantity * e.purchase_price) / NULLIF(SUM(e.quantity) FILTER (WHERE e.purchase_price IS NOT NULL), 0) AS avg_purchase_price,
                SUM(e.quantity * e.sale_price) / NULLIF(SUM(e.quantity) FILTER (WHERE e.sale_price IS NOT NULL), 0) AS avg_sale_price
         FROM product_stock_entries e
         JOIN products p ON p.id = e.product_id
         WHERE p.code = ANY($1) AND p.tenant_id = $2
         GROUP BY p.code`,
        [codes, user.tenantId]
      );
      for (const row of codeAvgResult.rows) {
        avgByCode.set(row.code, { purchase: row.avg_purchase_price, sale: row.avg_sale_price });
      }
    }

    const items = groupsResult.rows.map((g) => ({
      code: g.code,
      brand: g.brand,
      avg_purchase_price: avgByCode.get(g.code)?.purchase ?? null,
      avg_sale_price: avgByCode.get(g.code)?.sale ?? null,
      size_desc: g.size_desc,
      season: g.season,
      barcode: g.barcode,
      product_type: g.product_type,
      width_mm: g.width_mm,
      profile_pct: g.profile_pct,
      rim_diameter: g.rim_diameter,
      model_name: g.model_name,
      load_speed_index: g.load_speed_index,
      eu_fuel_class: g.eu_fuel_class,
      eu_wet_grip_class: g.eu_wet_grip_class,
      eu_noise_db: g.eu_noise_db,
      eu_noise_class: g.eu_noise_class,
      rim_size: g.rim_size,
      pcd: g.pcd,
      offset_et: g.offset_et,
      min_stock_threshold: g.min_stock_threshold,
      total_stock: g.total_stock,
      batches: batchesByCode.get(g.code) ?? [],
    }));

    return NextResponse.json({ items, total, page, limit });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}

// Aynı parti (kod+hafta/yıl+tedarikçi) için tekrar "Stok Girişi" yapılırsa
// (fiyatlar gün bazlı değişebildiğinden) mevcut satır ezilmez: stok_qty
// üzerine eklenir, fiyatlar güncellenir ve product_stock_entries'e yeni bir
// geçmiş satırı düşülür. Eşleşme yoksa yeni parti oluşturulur.
export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "products.create")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const body = await request.json();
    const {
      code, brand, size_desc, season, supplier, location, barcode, production_week, production_year,
      purchase_price, sale_price, stock_qty, product_type, width_mm, profile_pct, rim_diameter, tread_depth_mm,
      model_name, load_speed_index, eu_fuel_class, eu_wet_grip_class, eu_noise_db, eu_noise_class,
      rim_size, pcd, offset_et, min_stock_threshold,
    } = body;

    if (!code || !String(code).trim()) {
      return NextResponse.json({ error: "Ürün kodu zorunludur." }, { status: 400 });
    }

    if (supplier) await upsertDirectoryNames(pool, "suppliers", user.tenantId!, [supplier]);

    if (purchase_price != null && purchase_price !== "" && (!Number.isFinite(Number(purchase_price)) || Number(purchase_price) < 0)) {
      return NextResponse.json({ error: "Geçersiz alış fiyatı." }, { status: 400 });
    }
    if (sale_price != null && sale_price !== "" && (!Number.isFinite(Number(sale_price)) || Number(sale_price) < 0)) {
      return NextResponse.json({ error: "Geçersiz satış fiyatı." }, { status: 400 });
    }
    if (stock_qty != null && stock_qty !== "" && (!Number.isFinite(Number(stock_qty)) || Number(stock_qty) < 0)) {
      return NextResponse.json({ error: "Geçersiz stok miktarı." }, { status: 400 });
    }

    const qty = Number(stock_qty) || 0;
    const isDated = production_week != null && production_week !== "" && production_year != null && production_year !== "";
    const yearVal = isDated ? normalizeYear(Number(production_year)) : null;
    const values = [
      user.tenantId, String(code).trim(), brand || null, size_desc || null, season || null, supplier || null,
      isDated ? production_week : null, yearVal, purchase_price ?? null, sale_price ?? null, qty, location || null,
      barcode ? String(barcode).trim() : null, product_type || null,
      width_mm === "" || width_mm == null ? null : Number(width_mm),
      profile_pct === "" || profile_pct == null ? null : Number(profile_pct),
      rim_diameter ? String(rim_diameter).trim() : null,
      tread_depth_mm === "" || tread_depth_mm == null ? null : Number(tread_depth_mm),
      model_name ? String(model_name).trim() : null,
      load_speed_index ? String(load_speed_index).trim() : null,
      eu_fuel_class ? String(eu_fuel_class).trim() : null,
      eu_wet_grip_class ? String(eu_wet_grip_class).trim() : null,
      eu_noise_db === "" || eu_noise_db == null ? null : Number(eu_noise_db),
      eu_noise_class === "" || eu_noise_class == null ? null : Number(eu_noise_class),
      rim_size ? String(rim_size).trim() : null,
      pcd ? String(pcd).trim() : null,
      offset_et ? String(offset_et).trim() : null,
      min_stock_threshold === "" || min_stock_threshold == null ? null : Number(min_stock_threshold),
    ];

    const conflictClause = isDated
      ? `ON CONFLICT (tenant_id, code, production_year, production_week, COALESCE(supplier, ''), COALESCE(location, '')) WHERE production_year IS NOT NULL`
      : `ON CONFLICT (tenant_id, code, COALESCE(location, '')) WHERE production_year IS NULL`;

    const result = await pool.query(
      `INSERT INTO products (tenant_id, code, brand, size_desc, season, supplier, production_week, production_year, purchase_price, sale_price, stock_qty, location, barcode, product_type, width_mm, profile_pct, rim_diameter, tread_depth_mm, model_name, load_speed_index, eu_fuel_class, eu_wet_grip_class, eu_noise_db, eu_noise_class, rim_size, pcd, offset_et, min_stock_threshold)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)
       ${conflictClause} DO UPDATE SET
         brand=EXCLUDED.brand, size_desc=EXCLUDED.size_desc, season=EXCLUDED.season,
         purchase_price=EXCLUDED.purchase_price, sale_price=EXCLUDED.sale_price,
         stock_qty=products.stock_qty + EXCLUDED.stock_qty, barcode=COALESCE(EXCLUDED.barcode, products.barcode),
         product_type=COALESCE(EXCLUDED.product_type, products.product_type),
         width_mm=COALESCE(EXCLUDED.width_mm, products.width_mm),
         profile_pct=COALESCE(EXCLUDED.profile_pct, products.profile_pct),
         rim_diameter=COALESCE(EXCLUDED.rim_diameter, products.rim_diameter),
         tread_depth_mm=COALESCE(EXCLUDED.tread_depth_mm, products.tread_depth_mm),
         model_name=COALESCE(EXCLUDED.model_name, products.model_name),
         load_speed_index=COALESCE(EXCLUDED.load_speed_index, products.load_speed_index),
         eu_fuel_class=COALESCE(EXCLUDED.eu_fuel_class, products.eu_fuel_class),
         eu_wet_grip_class=COALESCE(EXCLUDED.eu_wet_grip_class, products.eu_wet_grip_class),
         eu_noise_db=COALESCE(EXCLUDED.eu_noise_db, products.eu_noise_db),
         eu_noise_class=COALESCE(EXCLUDED.eu_noise_class, products.eu_noise_class),
         rim_size=COALESCE(EXCLUDED.rim_size, products.rim_size),
         pcd=COALESCE(EXCLUDED.pcd, products.pcd),
         offset_et=COALESCE(EXCLUDED.offset_et, products.offset_et),
         min_stock_threshold=COALESCE(EXCLUDED.min_stock_threshold, products.min_stock_threshold),
         updated_at=CURRENT_TIMESTAMP
       RETURNING *`,
      values
    );

    const productRow = result.rows[0];

    await pool.query(
      `INSERT INTO product_stock_entries (tenant_id, product_id, quantity, purchase_price, sale_price) VALUES ($1,$2,$3,$4,$5)`,
      [user.tenantId, productRow.id, qty, purchase_price ?? null, sale_price ?? null]
    );

    return NextResponse.json(productRow, { status: 201 });
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && error.code === "23505") {
      const constraint = "constraint" in error ? String(error.constraint) : "";
      if (constraint.includes("barcode")) {
        return NextResponse.json({ error: "Bu barkod başka bir üründe zaten kayıtlı." }, { status: 409 });
      }
      return NextResponse.json({ error: "Bu kod, üretim haftası/yılı ve tedarikçiye sahip bir parti zaten mevcut." }, { status: 409 });
    }
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
