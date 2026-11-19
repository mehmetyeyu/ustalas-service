import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { escapeLike } from "@/lib/sqlSafety";
import { logAudit } from "@/lib/auditLog";
import {
  parseBulkPriceInput, bulkPriceStep, bulkNewPriceSql, bulkValueSqlText, BulkPriceValidationError, BULK_PRICE_ROUNDINGS,
  BULK_PRICE_COLUMN_MAX, type BulkPriceInput,
} from "@/lib/bulkPrice";

const SAMPLE_COUNT = 8;

// Toplu satış fiyatı güncelleme (bkz. src/lib/bulkPrice.ts — neyin neden
// güncellendiği orada). apply=false → önizleme (yazmaz), apply=true → uygular.
// Kapsam Ürünler sayfasının o anki filtreleridir (arama/mevsim/stok durumu,
// GET /api/products ile aynı anlam); stok durumu KOD düzeyinde uygulanır
// (listedeki gibi), seçilen kodun TÜM partileri — stoğu biten partiler dahil —
// güncellenir: tükenen parti listede görünmese de "Stok Girişi" yeni partiye
// onun fiyatını önerir, eski fiyat kalmasın.
//
// Hesap tamamen veritabanında, önizleme ve uygulama birer sorgu: önceden tüm
// partiler + stok girişleri sunucuya çekilip JS'te hesaplanıyordu — 10.000
// partilik katalogda önizleme başına ~140 ms CPU (veritabanı tarafı 11 ms).
// Artık yalnızca sayılar ve 8 örnek satır döner. Fiyatlar NUMERIC ile tam
// hesaplanır (float yuvarlama hatası yok).
export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "products.edit")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  let input: BulkPriceInput;
  let apply: boolean;
  try {
    const body = await request.json().catch(() => null);
    input = parseBulkPriceInput(body);
    apply = (body as { apply?: unknown }).apply === true;
  } catch (e) {
    if (e instanceof BulkPriceValidationError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }

  const { scopeSql, values } = buildScope(user.tenantId!, input);
  // Yeni fiyat ifadesi: $mode/$value/$step parametreleri sona eklenir.
  const p = values.length;
  // value tam kuruş metni olarak verilir: NUMERIC'e kayıpsız geçer (ör. "7.50").
  values.push(input.mode, bulkValueSqlText(input.value), bulkPriceStep(input.rounding));
  const newPrice = (col: string) => bulkNewPriceSql(col, { mode: `$${p + 1}`, value: `$${p + 2}`, step: `$${p + 3}` });

  try {
    if (!apply) {
      const result = await pool.query<{ codes: number; batches: number; samples: unknown[] | null; overflow: boolean }>(
        previewSql(scopeSql, newPrice), values
      );
      const row = result.rows[0];
      if (row.overflow) return NextResponse.json({ error: OVERFLOW_MESSAGE }, { status: 400 });
      return NextResponse.json({ codes: row.codes, batches: row.batches, samples: row.samples ?? [] });
    }

    // Tek ifade = tek transaction: kapsam FOR UPDATE ile kilitlenir, iki
    // UPDATE aynı anlık görüntüde çalışır. Fiyatı olmayan parti/giriş atlanır.
    const result = await pool.query<{ codes: number; batches: number }>(
      `WITH scope AS (${scopeSql} FOR UPDATE),
       up AS (
         UPDATE products p SET sale_price = ${newPrice("p.sale_price")}, updated_at = CURRENT_TIMESTAMP
         FROM scope s WHERE p.id = s.id AND p.tenant_id = $1 AND p.sale_price IS NOT NULL
         RETURNING p.id
       ),
       ue AS (
         UPDATE product_stock_entries e SET sale_price = ${newPrice("e.sale_price")}
         FROM scope s WHERE e.product_id = s.id AND e.tenant_id = $1 AND e.sale_price IS NOT NULL
         RETURNING e.product_id
       ),
       changed AS (SELECT id FROM up UNION SELECT product_id FROM ue)
       SELECT (SELECT COUNT(*)::int FROM changed) AS batches,
              (SELECT COUNT(DISTINCT s.code)::int FROM scope s JOIN changed c ON c.id = s.id) AS codes`,
      values
    );
    const { codes, batches } = result.rows[0];

    const rounding = BULK_PRICE_ROUNDINGS.find((r) => r.value === input.rounding)!;
    await logAudit({
      tenantId: user.tenantId!, userId: user.userId, username: user.username,
      action: "product.bulk_price", tableName: "products", recordId: null,
      detail: `Satış fiyatı ${input.value > 0 ? "+" : ""}${input.mode === "percent" ? `%${input.value}` : `${input.value} TL`}`
        + `, yuvarlama: ${rounding.label}, ${codes} ürün / ${batches} parti`
        + scopeLabel(input),
    });
    return NextResponse.json({ codes, batches });
  } catch (error) {
    // 22003 numeric_value_out_of_range: önizleme ile uygulama arasında fiyat
    // değiştiyse (önizleme bunu zaten yakalar). Tek ifade — hiçbir şey yazılmadı.
    if (error && typeof error === "object" && "code" in error && error.code === "22003") {
      return NextResponse.json({ error: OVERFLOW_MESSAGE }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}

const OVERFLOW_MESSAGE = "Bu artışla bazı fiyatlar sistemin tutabileceği en yüksek tutarı aşıyor — daha küçük bir değer girin.";

// Kapsamdaki partiler (id, code). Arama koşulu GET /api/products ile birebir
// aynı (ebatta "/" olmadan da eşleşir).
function buildScope(tenantId: number, input: BulkPriceInput) {
  const conditions = ["tenant_id = $1"];
  const values: (string | number)[] = [tenantId];
  if (input.search) {
    values.push(`%${escapeLike(input.search)}%`, `%${escapeLike(input.search.replace(/\//g, ""))}%`);
    const a = `$${values.length - 1}`, b = `$${values.length}`;
    conditions.push(`(code ILIKE ${a} OR brand ILIKE ${a} OR supplier ILIKE ${a} OR size_desc ILIKE ${a} OR REPLACE(size_desc, '/', '') ILIKE ${b})`);
  }
  if (input.season) {
    values.push(input.season);
    conditions.push(`season = $${values.length}`);
  }
  const where = conditions.join(" AND ");
  const having = input.stock === "in" ? " HAVING SUM(stock_qty) > 0" : input.stock === "out" ? " HAVING SUM(stock_qty) <= 0" : "";
  return {
    scopeSql: `SELECT id, code, brand, size_desc, stock_qty, sale_price FROM products
               WHERE ${where} AND code IN (SELECT code FROM products WHERE ${where} GROUP BY code${having})`,
    values,
  };
}

// Önizleme: etkilenecek kod/parti sayısı + listede görünecek "Satış Fiyatı
// (Ort.)" eski → yeni, en çok stoğu olan kodlar önce. Ortalama kuralı GET
// /api/products'taki codeAvg ile aynı: stokta kalan partilerin girişleri,
// yoksa kodun tüm girişleri (miktar ağırlıklı); hiç girişi yoksa partinin
// kendi fiyatı (stok seçicideki gibi).
function previewSql(scopeSql: string, newPrice: (col: string) => string) {
  return `
    WITH scope AS (${scopeSql}),
    ent AS (
      SELECT s.code, s.stock_qty > 0 AS in_stock, e.quantity, e.sale_price
      FROM product_stock_entries e JOIN scope s ON s.id = e.product_id
      WHERE e.tenant_id = $1 AND e.sale_price IS NOT NULL
    ),
    priced AS (
      SELECT id FROM scope WHERE sale_price IS NOT NULL
      UNION SELECT e.product_id FROM product_stock_entries e JOIN scope s ON s.id = e.product_id
            WHERE e.tenant_id = $1 AND e.sale_price IS NOT NULL
    ),
    by_code AS (
      SELECT code,
             (array_agg(brand ORDER BY id))[1] AS brand,
             (array_agg(size_desc ORDER BY id))[1] AS size_desc,
             SUM(stock_qty)::int AS stock,
             (array_agg(sale_price ORDER BY id) FILTER (WHERE sale_price IS NOT NULL))[1] AS fallback
      FROM scope WHERE code IN (SELECT s.code FROM scope s JOIN priced p ON p.id = s.id)
      GROUP BY code
    ),
    avgs AS (
      SELECT code,
             COALESCE(
               SUM(quantity * sale_price) FILTER (WHERE in_stock) / NULLIF(SUM(quantity) FILTER (WHERE in_stock), 0),
               SUM(quantity * sale_price) / NULLIF(SUM(quantity), 0)) AS old_avg,
             COALESCE(
               SUM(quantity * ${newPrice("sale_price")}) FILTER (WHERE in_stock) / NULLIF(SUM(quantity) FILTER (WHERE in_stock), 0),
               SUM(quantity * ${newPrice("sale_price")}) / NULLIF(SUM(quantity), 0)) AS new_avg
      FROM ent GROUP BY code
    )
    SELECT (SELECT COUNT(*)::int FROM by_code) AS codes,
           -- Kolon DECIMAL(12,2): uygulamada taşacak fiyat varsa önizlemede söylenir.
           EXISTS (SELECT 1 FROM scope WHERE ${newPrice("sale_price")} > ${BULK_PRICE_COLUMN_MAX})
             OR EXISTS (SELECT 1 FROM ent WHERE ${newPrice("sale_price")} > ${BULK_PRICE_COLUMN_MAX}) AS overflow,
           (SELECT COUNT(*)::int FROM priced) AS batches,
           (SELECT json_agg(x) FROM (
              SELECT c.code, c.brand, c.size_desc, c.stock,
                     COALESCE(a.old_avg, c.fallback)::float8 AS old_price,
                     COALESCE(a.new_avg, ${newPrice("c.fallback")})::float8 AS new_price
              FROM by_code c LEFT JOIN avgs a ON a.code = c.code
              ORDER BY c.stock DESC, c.code COLLATE "tr-x-icu"
              LIMIT ${SAMPLE_COUNT}
           ) x) AS samples`;
}

function scopeLabel(input: BulkPriceInput): string {
  const parts = [
    input.search ? `arama "${input.search}"` : null,
    input.season ? `mevsim ${input.season}` : null,
    input.stock === "in" ? "stokta olanlar" : input.stock === "out" ? "stoğu bitenler" : null,
  ].filter(Boolean);
  return parts.length ? ` (kapsam: ${parts.join(", ")})` : " (tüm ürünler)";
}
