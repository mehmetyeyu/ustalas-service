import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { notifySuperAdmins } from "@/lib/push";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!user.tenantId) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const { id } = await params;
    const ticketResult = await pool.query(
      "SELECT id, subject, status, created_at, updated_at FROM support_tickets WHERE id = $1 AND tenant_id = $2",
      [id, user.tenantId]
    );
    if (ticketResult.rows.length === 0) {
      return NextResponse.json({ error: "Talep bulunamadı." }, { status: 404 });
    }
    const messagesResult = await pool.query(
      `SELECT m.id, m.body, m.is_super_admin_reply, m.created_at, u.username AS sender_username
       FROM support_ticket_messages m
       LEFT JOIN users u ON u.id = m.sender_id
       WHERE m.ticket_id = $1 AND m.tenant_id = $2
       ORDER BY m.created_at`,
      [id, user.tenantId]
    );
    return NextResponse.json({ ticket: ticketResult.rows[0], messages: messagesResult.rows });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}

// Yeni mesaj ekleme — talep KAPALI ise otomatik ACIK'a döner (yeni bir mesaj
// gelmesi demek konuşmanın devam ettiği anlamına gelir, bkz. schema.sql'deki
// support_tickets yorumu).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!user.tenantId) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const { id } = await params;
    const body = await request.json();
    const message = String(body?.message ?? "").trim();
    if (!message) return NextResponse.json({ error: "Mesaj zorunludur." }, { status: 400 });

    const ticketResult = await pool.query<{ id: number; subject: string }>(
      "SELECT id, subject FROM support_tickets WHERE id = $1 AND tenant_id = $2",
      [id, user.tenantId]
    );
    if (ticketResult.rows.length === 0) {
      return NextResponse.json({ error: "Talep bulunamadı." }, { status: 404 });
    }

    await pool.query(
      `INSERT INTO support_ticket_messages (ticket_id, tenant_id, sender_id, is_super_admin_reply, body)
       VALUES ($1, $2, $3, false, $4)`,
      [id, user.tenantId, user.userId, message]
    );
    await pool.query(
      "UPDATE support_tickets SET status = 'ACIK', updated_at = NOW() WHERE id = $1 AND tenant_id = $2",
      [id, user.tenantId]
    );

    await notifySuperAdmins({
      title: "Destek talebine yeni mesaj",
      body: `${ticketResult.rows[0].subject.slice(0, 80)} — firma yeni bir mesaj yazdı.`,
      url: "/super-admin/destek",
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}

// Tenant kendi talebini kapatabilir (sorun çözüldüyse süper admini beklemeden).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!user.tenantId) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const { id } = await params;
    const body = await request.json();
    const status = String(body?.status ?? "");
    if (status !== "ACIK" && status !== "KAPALI") {
      return NextResponse.json({ error: "Geçersiz durum." }, { status: 400 });
    }
    const result = await pool.query(
      "UPDATE support_tickets SET status = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3 RETURNING id",
      [status, id, user.tenantId]
    );
    if (result.rowCount === 0) return NextResponse.json({ error: "Talep bulunamadı." }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
