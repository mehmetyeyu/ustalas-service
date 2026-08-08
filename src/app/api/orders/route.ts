import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { resolveServiceIds } from "@/lib/serviceCatalog";
import { upsertDirectoryNames } from "@/lib/directories";
import { deductStock, InsufficientStockError } from "@/lib/productStock";

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

interface OrderLineInput {
  service_name: string;
  supplier?: string | null;
  stock_code?: string | null;
  size_desc?: string | null;
  quantity?: number | null;
  unit_price: number;
  cost_price?: number | null;
  product_id?: number | null;
}

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const search = searchParams.get("search");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");

  let query = `
    SELECT
      o.id, o.plate, o.customer_name, o.notes, o.status, o.created_at,
      os.id AS line_id, s.name AS service_name,
      os.supplier, os.stock_code, os.size_desc, os.quantity, os.unit_price, os.cost_price,
      os.payment_type
    FROM orders o
    LEFT JOIN order_services os ON o.id = os.order_id
    LEFT JOIN services s ON os.service_id = s.id
    WHERE 1=1
  `;
  let paramCount = 0;
  const values: (string | number)[] = [];

  if (status) {
    paramCount++;
    query += ` AND o.status = $${paramCount}`;
    values.push(status);
  }
  if (search) {
    // Ebat aramasında "/" zorunlu olmasın diye ("205/45R19" yerine "20545R19" de
    // yazılabilsin) hem arama metninden hem size_desc'ten "/" çıkarılıp da ayrıca
    // karşılaştırılır — diğer alanlar normal ILIKE ile eşleşir.
    paramCount++;
    const rawIdx = paramCount;
    paramCount++;
    const noSlashIdx = paramCount;
    query += ` AND (o.plate ILIKE $${rawIdx} OR o.customer_name ILIKE $${rawIdx} OR os.supplier ILIKE $${rawIdx} OR os.stock_code ILIKE $${rawIdx} OR os.size_desc ILIKE $${rawIdx} OR REPLACE(os.size_desc, '/', '') ILIKE $${noSlashIdx})`;
    values.push(`%${escapeLike(search)}%`, `%${escapeLike(search.replace(/\//g, ""))}%`);
  }
  if (dateFrom) {
    paramCount++;
    query += ` AND (o.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul')::date >= $${paramCount}`;
    values.push(dateFrom);
  }
  if (dateTo) {
    paramCount++;
    query += ` AND (o.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul')::date <= $${paramCount}`;
    values.push(dateTo);
  }

  // Bu uç sayfalanmıyor (liste ekranı tüm sonucu tek seferde çekiyor) — filtresiz
  // "Tümü" görünümünde veri büyüdükçe sınırsız satır dönmesin diye güvenlik amaçlı
  // üst sınır konur. Normal kullanımda (tarih/durum/plaka filtresiyle) bu sınıra
  // ulaşılmaz.
  query += " ORDER BY o.created_at DESC, os.id ASC LIMIT 5000";

  try {
    const result = await pool.query(query, values);
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });

  try {
    const { plate, customer_name, customer_phone, notes, lines } = await request.json();

    if (!plate || !Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json(
        { error: "Plaka ve en az bir satır zorunludur." },
        { status: 400 }
      );
    }
    for (const l of lines as OrderLineInput[]) {
      if (!l.service_name || !String(l.service_name).trim()) {
        return NextResponse.json({ error: "Her satır için işlem adı zorunludur." }, { status: 400 });
      }
    }

    const totalAmount = (lines as OrderLineInput[]).reduce(
      (sum, l) => sum + Number(l.unit_price || 0),
      0
    );

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const serviceIdByName = await resolveServiceIds(client, lines as OrderLineInput[]);
      await upsertDirectoryNames(client, "suppliers", (lines as OrderLineInput[]).map((l) => l.supplier));
      if (customer_name && String(customer_name).trim()) {
        await client.query(
          `INSERT INTO customers (name, phone) VALUES ($1, $2)
           ON CONFLICT (name) DO UPDATE SET phone = COALESCE(customers.phone, EXCLUDED.phone)`,
          [String(customer_name).trim(), customer_phone || null]
        );
      }

      const orderResult = await client.query(
        `INSERT INTO orders (plate, customer_name, customer_phone, notes, total_amount, status)
         VALUES ($1, $2, $3, $4, $5, 'BEKLEMEDE') RETURNING id`,
        [plate, customer_name || null, customer_phone || null, notes || null, totalAmount]
      );

      const orderId = orderResult.rows[0].id;

      for (const l of lines as OrderLineInput[]) {
        const serviceId = serviceIdByName.get(String(l.service_name).trim());
        if (!serviceId) continue;
        const quantity = Math.max(1, Math.round(Number(l.quantity) || 1));
        if (l.product_id) await deductStock(client, l.product_id, quantity);
        await client.query(
          `INSERT INTO order_services
             (order_id, service_id, unit_price, quantity, cost_price, supplier, stock_code, size_desc, product_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            orderId,
            serviceId,
            Number(l.unit_price) || 0,
            quantity,
            l.cost_price != null ? Number(l.cost_price) : null,
            l.supplier || null,
            l.stock_code || null,
            l.size_desc || null,
            l.product_id || null,
          ]
        );
      }

      await client.query("COMMIT");
      return NextResponse.json({ id: orderId, total_amount: totalAmount }, { status: 201 });
    } catch (err) {
      await client.query("ROLLBACK");
      if (err instanceof InsufficientStockError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
