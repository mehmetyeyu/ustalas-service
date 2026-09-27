import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Takvim ay ızgarasının (bkz. src/lib/calendarGrid.ts monthGridRange) taşan
// günler dahil tam aralığı için — appointments GET'teki from/to ile aynı
// sözleşme, ama burada tarih Istanbul-UTC dönüşümüne hiç girmez: note_date
// zaten saatsiz bir DATE kolonu (bkz. schema.sql calendar_notes yorumu).
export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "calendar.view")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (!from || !to || !ISO_DATE_RE.test(from) || !ISO_DATE_RE.test(to)) {
    return NextResponse.json({ error: "Geçerli bir tarih aralığı (from/to) gerekli." }, { status: 400 });
  }

  try {
    const result = await pool.query(
      `SELECT cn.id, cn.note_date::text AS note_date, cn.title, cn.body, cn.created_at, u.username AS created_by_username
       FROM calendar_notes cn
       LEFT JOIN users u ON u.id = cn.created_by
       WHERE cn.tenant_id = $1 AND cn.note_date >= $2 AND cn.note_date <= $3
       ORDER BY cn.note_date, cn.created_at`,
      [user.tenantId, from, to]
    );
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "calendar.create")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const body = await request.json();
    const noteDate = String(body?.note_date ?? "");
    const title = String(body?.title ?? "").trim();
    // body TEXT kolonu DB'de sınırsız — uygulama seviyesinde makul bir üst
    // sınır (title'ın VARCHAR(200)'e slice edilmesiyle aynı gerekçe) kazara/
    // kötü niyetli aşırı büyük içerikleri baştan engeller.
    const noteBody = body?.body != null ? String(body.body).trim().slice(0, 5000) : null;
    if (!ISO_DATE_RE.test(noteDate)) {
      return NextResponse.json({ error: "Geçerli bir tarih gerekli." }, { status: 400 });
    }
    if (!title) {
      return NextResponse.json({ error: "Başlık zorunludur." }, { status: 400 });
    }

    const result = await pool.query<{ id: number }>(
      `INSERT INTO calendar_notes (tenant_id, note_date, title, body, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [user.tenantId, noteDate, title.slice(0, 200), noteBody, user.userId]
    );
    return NextResponse.json({ id: result.rows[0].id }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
