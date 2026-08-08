import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { ParsedProductRow } from "@/lib/productsExcel";
import { upsertDirectoryNames } from "@/lib/directories";

const MAX_BATCH_SIZE = 200;

// Üretim Haftası/Yılı olan satırlar: belirli bir partiyi hedefler, tüm alanlar
// (Dışa Aktar'dan düzenlenip geri yüklenen tam veri olduğu varsayılarak) olduğu
// gibi yazılır.
async function upsertDatedBatches(rows: ParsedProductRow[]) {
  if (rows.length === 0) return;
  const values: (string | number | null)[] = [];
  const placeholders = rows.map((r, i) => {
    const base = i * 10;
    values.push(
      r.code, r.brand, r.size_desc, r.season, r.supplier,
      r.production_week, r.production_year, r.purchase_price, r.sale_price, r.stock_qty
    );
    return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10})`;
  });
  await pool.query(
    `INSERT INTO products (code, brand, size_desc, season, supplier, production_week, production_year, purchase_price, sale_price, stock_qty)
     VALUES ${placeholders.join(",")}
     ON CONFLICT (code, production_year, production_week, COALESCE(supplier, '')) WHERE production_year IS NOT NULL DO UPDATE SET
       brand=EXCLUDED.brand, size_desc=EXCLUDED.size_desc, season=EXCLUDED.season,
       supplier=EXCLUDED.supplier, purchase_price=EXCLUDED.purchase_price, sale_price=EXCLUDED.sale_price,
       stock_qty=EXCLUDED.stock_qty, updated_at=CURRENT_TIMESTAMP`,
    values
  );
}

// Üretim Haftası/Yılı olmayan satırlar: kaynak envanter sistemindeki "temel"
// satırı (Kod'a göre tek) hedefler. Sadece Marka/Ebat/Stok güncellenir; Mevsim/
// Model/Tedarikçi/fiyatlar bu formatta olmadığından mevcut değer korunur (COALESCE).
async function upsertBaseRows(rows: ParsedProductRow[]) {
  if (rows.length === 0) return;
  const values: (string | number | null)[] = [];
  const placeholders = rows.map((r, i) => {
    const base = i * 10;
    values.push(
      r.code, r.brand, r.size_desc, r.season, r.supplier,
      null, null, r.purchase_price, r.sale_price, r.stock_qty
    );
    return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10})`;
  });
  await pool.query(
    `INSERT INTO products (code, brand, size_desc, season, supplier, production_week, production_year, purchase_price, sale_price, stock_qty)
     VALUES ${placeholders.join(",")}
     ON CONFLICT (code) WHERE production_year IS NULL DO UPDATE SET
       brand=EXCLUDED.brand, size_desc=EXCLUDED.size_desc, stock_qty=EXCLUDED.stock_qty,
       season=COALESCE(EXCLUDED.season, products.season),
       supplier=COALESCE(EXCLUDED.supplier, products.supplier),
       purchase_price=COALESCE(EXCLUDED.purchase_price, products.purchase_price),
       sale_price=COALESCE(EXCLUDED.sale_price, products.sale_price),
       updated_at=CURRENT_TIMESTAMP`,
    values
  );
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });

  try {
    const body = await request.json();
    const rows = body.rows as ParsedProductRow[] | undefined;

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "Aktarılacak satır bulunamadı." }, { status: 400 });
    }
    if (rows.length > MAX_BATCH_SIZE) {
      return NextResponse.json({ error: `Bir seferde en fazla ${MAX_BATCH_SIZE} satır gönderilebilir.` }, { status: 400 });
    }

    // Aynı istekte aynı anahtar (kod+hafta/yıl+tedarikçi) iki kez gelirse son kaydı
    // tut — farklı tedarikçiden gelen aynı kod+hafta/yıl ayrı parti sayılır.
    let skipped = 0;
    const dated = new Map<string, ParsedProductRow>();
    const base = new Map<string, ParsedProductRow>();
    for (const r of rows) {
      const code = r?.code != null ? String(r.code).trim() : "";
      if (!code) { skipped++; continue; }
      const row = { ...r, code };
      if (row.production_year != null && row.production_week != null) {
        dated.set(`${code}|${row.production_year}|${row.production_week}|${row.supplier ?? ""}`, row);
      } else {
        base.set(code, row);
      }
    }

    await upsertDirectoryNames(pool, "suppliers", rows.map((r) => r.supplier));
    await upsertDatedBatches(Array.from(dated.values()));
    await upsertBaseRows(Array.from(base.values()));

    const imported = dated.size + base.size;
    return NextResponse.json({ imported, skipped });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
