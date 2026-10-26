import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getAppSettings } from "@/lib/settings";
import { escapeLike } from "@/lib/sqlSafety";

// Tablo: her satır bir ürün KODU, her firma bir sütun (müşteri isteği).
interface Firm {
  tenant_id: number;
  tenant_name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
}
interface CodeRow {
  code: string;
  brand: string;
  model_name: string | null;
  size_desc: string;
  season: string | null;
  total_stock: number;
}
// Bir hücre: bir firmanın o koddaki toplam stoğu; üretim haftası/yılı firmaya
// göre değiştiği için hücrede gösterilir (en yeni parti + kaç farklı parti).
interface Cell {
  code: string;
  tenant_id: number;
  qty: number;
  production_year: number | null;
  production_week: number | null;
  batches: number;
}

// Firmalar arası opt-in stok görünürlüğü — bkz. plan (Paylaşılan Stok).
// Karşılıklı: çağıran kendi shared_stock_enabled'ı açık DEĞİLSE, başkalarının
// stoğu hiç sorgulanmaz (aşağıdaki erken dönüş). Görünürlük ayrıca çağrılan
// tarafın hem app_settings.shared_stock_enabled=true HEM tenants.is_active=true
// olmasını gerektirir — biri bile eksikse o firmanın stoğu hiç dönmez.
//
// GÜVENLİK: bu sorgu asla purchase_price/sale_price/supplier seçmemeli —
// bu route'un gizlilik sınırı SQL seviyesinde uygulanır, client-side
// filtreleme değil.
// Tablo (müşteri isteği): her satır bir ürün kodu (aynı kodu kullanan
// firmalar aynı satırda), her firma ayrı bir sütun — hücrede o firmadaki
// stok. Firma sütunları filtreye uyan TÜM kodlardaki firmalardır (sayfadan
// bağımsız; sütunlar sayfa değişince oynamaz).
export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "shared_stock.view")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  const ownSettings = await getAppSettings(user.tenantId!);
  if (!ownSettings.shared_stock_enabled) {
    return NextResponse.json({ sharingEnabled: false });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search");
  const season = searchParams.get("season");
  const minQty = Math.max(0, parseInt(searchParams.get("minQty") ?? "0") || 0);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(500, Math.max(1, parseInt(searchParams.get("limit") ?? "20")));

  const conditions: string[] = [
    "t.is_active = true",
    "t.id != $1",
    "a.shared_stock_enabled = true",
    "p.stock_qty > 0",
    "p.brand IS NOT NULL",
    "p.size_desc IS NOT NULL",
  ];
  const values: (string | number)[] = [user.tenantId!];

  if (search) {
    values.push(`%${escapeLike(search)}%`, `%${escapeLike(search.replace(/\//g, ""))}%`);
    const p1 = `$${values.length - 1}`, p2 = `$${values.length}`;
    conditions.push(
      `(p.brand ILIKE ${p1} OR p.size_desc ILIKE ${p1} OR REPLACE(p.size_desc, '/', '') ILIKE ${p2} OR p.code ILIKE ${p1} OR p.model_name ILIKE ${p1})`
    );
  }
  if (season) {
    values.push(season);
    conditions.push(`p.season = $${values.length}`);
  }

  if (minQty > 0) values.push(minQty);
  const minQtyParam = minQty > 0 ? `$${values.length}` : null;
  values.push(limit, (page - 1) * limit);
  const limitParam = `$${values.length - 1}`;
  const offsetParam = `$${values.length}`;

  try {
    // Gruplama, adet eşiği, sıralama, sayfalama, firma sütunları ve yalnızca
    // bu sayfanın hücreleri SQL'de, TEK sorguda — Vercel'e yalnızca istenen
    // sayfanın verisi gelir. Önceden filtreye uyan TÜM ürün satırları her
    // istekte çekilip JS'te gruplanıp sayfalanıyordu (maliyet ağdaki toplam
    // paylaşılan stokla büyüyordu).
    // - Sıralama Türkçe ICU kuralıyla (tr-x-icu) — JS localeCompare("tr")
    //   ile aynı sırayı verir (ikisi de ICU; 2.642 marka/ebat/sezon üçlüsünde
    //   birebir karşılaştırıldı). Sezonsuz/modelsiz sona.
    // - Bir kodun marka/model/ebat/sezonu firmalar arasında farklı yazılmış
    //   olabilir; satırda MAX ile tek değer gösterilir.
    // - minQty: en az bir firmada o koddan en az N adet olan satırlar.
    // - base birden çok kez kullanıldığı için Postgres onu bir kez hesaplar.
    // GÜVENLİK: base asla fiyat/tedarikçi seçmez (bkz. yukarıdaki not).
    const result = await pool.query<{ total: number; firms: Firm[]; rows: CodeRow[]; cells: Cell[] | null }>(
      `WITH base AS (
         SELECT p.code, p.brand, p.model_name, p.size_desc, p.season, p.stock_qty, p.production_year, p.production_week,
                t.id AS tenant_id, t.name AS tenant_name, t.contact_name, t.contact_email, t.contact_phone
         FROM products p
         JOIN tenants t ON t.id = p.tenant_id
         JOIN app_settings a ON a.tenant_id = t.id
         WHERE ${conditions.join(" AND ")}
       ),
       ct AS (
         SELECT code, tenant_id, SUM(stock_qty)::int AS qty,
                (ARRAY_AGG(production_year ORDER BY production_year DESC NULLS LAST, production_week DESC NULLS LAST))[1] AS production_year,
                (ARRAY_AGG(production_week ORDER BY production_year DESC NULLS LAST, production_week DESC NULLS LAST))[1] AS production_week,
                COUNT(DISTINCT (production_year, production_week))::int AS batches
         FROM base GROUP BY code, tenant_id
       ),
       g AS (
         SELECT code, MAX(brand) AS brand, MAX(model_name) AS model_name, MAX(size_desc) AS size_desc,
                MAX(season) AS season, SUM(stock_qty)::int AS total_stock
         FROM base GROUP BY code
         ${minQtyParam ? `HAVING code IN (SELECT code FROM ct WHERE qty >= ${minQtyParam})` : ""}
       ),
       pg AS (
         SELECT g.*, ROW_NUMBER() OVER (ORDER BY brand COLLATE "tr-x-icu", size_desc COLLATE "tr-x-icu",
                                        (season IS NULL), season COLLATE "tr-x-icu",
                                        (model_name IS NULL), model_name COLLATE "tr-x-icu", code COLLATE "tr-x-icu") AS ord
         FROM g
         ORDER BY ord
         LIMIT ${limitParam} OFFSET ${offsetParam}
       )
       SELECT
         (SELECT COUNT(*)::int FROM g) AS total,
         (SELECT COALESCE(json_agg(f ORDER BY f.tenant_name COLLATE "tr-x-icu", f.tenant_id), '[]'::json)
            FROM (SELECT DISTINCT b.tenant_id, b.tenant_name, b.contact_name, b.contact_email, b.contact_phone
                  FROM base b JOIN g ON g.code = b.code) f) AS firms,
         (SELECT COALESCE(json_agg(json_build_object('code', code, 'brand', brand, 'model_name', model_name,
                                                     'size_desc', size_desc, 'season', season, 'total_stock', total_stock)
                                   ORDER BY ord), '[]'::json)
            FROM pg) AS rows,
         (SELECT json_agg(ct) FROM ct JOIN pg ON pg.code = ct.code) AS cells`,
      values
    );
    const { total, firms, rows, cells } = result.rows[0];

    // Hücreleri satırlara dağıt: { tenant_id: hücre }.
    const cellsByCode = new Map<string, Record<number, Omit<Cell, "code" | "tenant_id">>>();
    for (const { code, tenant_id, ...cell } of cells ?? []) {
      const byFirm = cellsByCode.get(code) ?? {};
      byFirm[tenant_id] = cell;
      cellsByCode.set(code, byFirm);
    }
    const items = rows.map((r) => ({ ...r, stocks: cellsByCode.get(r.code) ?? {} }));

    return NextResponse.json({ sharingEnabled: true, items, firms, total, page, limit });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
