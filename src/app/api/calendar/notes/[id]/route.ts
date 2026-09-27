import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "calendar.edit")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const { id } = await params;
    const body = await request.json();
    const noteDate = String(body?.note_date ?? "");
    const title = String(body?.title ?? "").trim();
    const noteBody = body?.body != null ? String(body.body).trim().slice(0, 5000) : null;
    if (!ISO_DATE_RE.test(noteDate)) {
      return NextResponse.json({ error: "Geçerli bir tarih gerekli." }, { status: 400 });
    }
    if (!title) {
      return NextResponse.json({ error: "Başlık zorunludur." }, { status: 400 });
    }

    const result = await pool.query(
      `UPDATE calendar_notes SET note_date = $1, title = $2, body = $3, updated_at = NOW()
       WHERE id = $4 AND tenant_id = $5 RETURNING id`,
      [noteDate, title.slice(0, 200), noteBody, id, user.tenantId]
    );
    if (result.rowCount === 0) return NextResponse.json({ error: "Not bulunamadı." }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
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
  if (!hasPermission(user, "calendar.delete")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const { id } = await params;
    const result = await pool.query(
      "DELETE FROM calendar_notes WHERE id = $1 AND tenant_id = $2 RETURNING id",
      [id, user.tenantId]
    );
    if (result.rowCount === 0) return NextResponse.json({ error: "Not bulunamadı." }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
