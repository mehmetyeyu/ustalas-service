import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search");
  const overdue = searchParams.get("overdue") === "true";
  const showDelivered = searchParams.get("delivered") === "true";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20")));
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const values: (string | number)[] = [];

  conditions.push(showDelivered ? `teslim_edildi = true` : `teslim_edildi = false`);

  if (search) {
    values.push(`%${search}%`);
    conditions.push(`(plate ILIKE $${values.length} OR customer_name ILIKE $${values.length})`);
  }
  if (overdue) {
    conditions.push(`islem_tarihi < NOW() - INTERVAL '6 months'`);
  }

  const where = conditions.length > 0 ? " WHERE " + conditions.join(" AND ") : "";

  try {
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM storage${where}`,
      values
    );
    const total: number = countResult.rows[0].total;

    const dataResult = await pool.query(
      `SELECT * FROM storage${where} ORDER BY created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset]
    );

    return NextResponse.json({ items: dataResult.rows, total, page, limit });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });

  try {
    const body = await request.json();
    const { depo_no, plate, customer_name, phone, ebat, marka, dis_derinligi, adet, mevsim, aciklama, islem_tarihi } = body;

    if (!plate) {
      return NextResponse.json({ error: "Plaka zorunludur." }, { status: 400 });
    }

    if (plate && mevsim) {
      const exists = await pool.query(
        "SELECT id FROM storage WHERE plate = $1 AND mevsim = $2 AND teslim_edildi = false",
        [plate, mevsim]
      );
      if (exists.rows.length > 0) {
        return NextResponse.json(
          { error: `Bu plaka için zaten aktif bir ${mevsim} kaydı mevcut.` },
          { status: 409 }
        );
      }
    }

    // Boşta kalan en küçük depo nosunu bul, yoksa max+1
    const nextDepoNo = depo_no ?? (await pool.query(`
      WITH active_nos AS (
        SELECT depo_no FROM storage WHERE teslim_edildi = false AND depo_no IS NOT NULL
      ),
      max_no AS (SELECT COALESCE(MAX(depo_no), 0) AS m FROM storage)
      SELECT MIN(n)::int AS next
      FROM generate_series(1, (SELECT m + 1 FROM max_no)) n
      WHERE n NOT IN (SELECT depo_no FROM active_nos)
    `)).rows[0].next;

    const result = await pool.query(
      `INSERT INTO storage (depo_no, plate, customer_name, phone, ebat, marka, dis_derinligi, adet, mevsim, aciklama, islem_tarihi)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [nextDepoNo, plate || null, customer_name || null, phone || null, ebat || null, marka || null,
       dis_derinligi || null, adet || 4, mevsim || null, aciklama || null, islem_tarihi || null]
    );

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
