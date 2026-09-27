import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { notifyTenantUsers } from "@/lib/push";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user || user.role !== "super_admin") return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const { id } = await params;
    const ticketResult = await pool.query(
      `SELECT t.id, t.subject, t.status, t.created_at, t.updated_at,
              te.name AS tenant_name, te.code AS tenant_code,
              te.contact_email, te.contact_phone
       FROM support_tickets t
       JOIN tenants te ON te.id = t.tenant_id
       WHERE t.id = $1`,
      [id]
    );
    if (ticketResult.rows.length === 0) {
      return NextResponse.json({ error: "Talep bulunamadı." }, { status: 404 });
    }
    const messagesResult = await pool.query(
      `SELECT m.id, m.body, m.is_super_admin_reply, m.created_at, u.username AS sender_username
       FROM support_ticket_messages m
       LEFT JOIN users u ON u.id = m.sender_id
       WHERE m.ticket_id = $1
       ORDER BY m.created_at`,
      [id]
    );
    return NextResponse.json({ ticket: ticketResult.rows[0], messages: messagesResult.rows });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user || user.role !== "super_admin") return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const { id } = await params;
    const body = await request.json();
    const message = String(body?.message ?? "").trim();
    if (!message) return NextResponse.json({ error: "Mesaj zorunludur." }, { status: 400 });

    const ticketResult = await pool.query<{ id: number; tenant_id: number; subject: string }>(
      "SELECT id, tenant_id, subject FROM support_tickets WHERE id = $1",
      [id]
    );
    if (ticketResult.rows.length === 0) {
      return NextResponse.json({ error: "Talep bulunamadı." }, { status: 404 });
    }
    const ticket = ticketResult.rows[0];

    await pool.query(
      `INSERT INTO support_ticket_messages (ticket_id, tenant_id, sender_id, is_super_admin_reply, body)
       VALUES ($1, $2, $3, true, $4)`,
      [id, ticket.tenant_id, user.userId, message]
    );
    await pool.query(
      "UPDATE support_tickets SET status = 'ACIK', updated_at = NOW() WHERE id = $1",
      [id]
    );

    await notifyTenantUsers(ticket.tenant_id, {
      title: "Destek talebinize cevap geldi",
      body: `${ticket.subject.slice(0, 80)} — yeni bir yanıt var.`,
      url: "/admin/destek",
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user || user.role !== "super_admin") return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const { id } = await params;
    const body = await request.json();
    const status = String(body?.status ?? "");
    if (status !== "ACIK" && status !== "KAPALI") {
      return NextResponse.json({ error: "Geçersiz durum." }, { status: 400 });
    }
    const result = await pool.query(
      "UPDATE support_tickets SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id",
      [status, id]
    );
    if (result.rowCount === 0) return NextResponse.json({ error: "Talep bulunamadı." }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
