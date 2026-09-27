import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { notifySuperAdmins } from "@/lib/push";

// Destek Talepleri — hiçbir kaynak iznine bağlı değil (bkz. permissions.ts
// PAGE_RESOURCE, "/admin/destek" → resource: null), panele giren herhangi
// bir kullanıcı (Yönetici ya da Personel) kendi firmasının taleplerini
// görebilir/yeni talep açabilir. Süper admin kullanıcının kendisi de
// tenant_id'si dolu (Platform tenant'a bağlı) olduğundan, WHERE tenant_id=$1
// süper admini asla bu uçtan geçirmez — o kendi ayrı /api/super-admin/
// uçlarını kullanır (tüm firmaları görmesi gerekir, tek bir tenant_id ile
// sınırlı değildir).
export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!user.tenantId) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    // last_message_is_super_admin_reply: son mesajı süper admin mi yazdı —
    // buysa ve talep ACIK ise "cevap geldi, sıra sizde" anlamına gelir,
    // liste ekranında öne çıkarılır (bkz. src/app/admin/destek/page.tsx).
    const result = await pool.query(
      `SELECT
         t.id, t.subject, t.status, t.created_at, t.updated_at,
         lm.body AS last_message_body,
         lm.is_super_admin_reply AS last_message_is_super_admin_reply
       FROM support_tickets t
       LEFT JOIN LATERAL (
         SELECT body, is_super_admin_reply
         FROM support_ticket_messages
         WHERE ticket_id = t.id
         ORDER BY created_at DESC
         LIMIT 1
       ) lm ON true
       WHERE t.tenant_id = $1
       ORDER BY t.updated_at DESC`,
      [user.tenantId]
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
  if (!user.tenantId) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const body = await request.json();
    const subject = String(body?.subject ?? "").trim();
    const message = String(body?.message ?? "").trim();
    if (!subject || !message) {
      return NextResponse.json({ error: "Konu ve mesaj zorunludur." }, { status: 400 });
    }

    const client = await pool.connect();
    let ticketId: number;
    try {
      await client.query("BEGIN");
      const ticketResult = await client.query<{ id: number }>(
        `INSERT INTO support_tickets (tenant_id, subject, created_by)
         VALUES ($1, $2, $3) RETURNING id`,
        [user.tenantId, subject.slice(0, 200), user.userId]
      );
      ticketId = ticketResult.rows[0].id;
      await client.query(
        `INSERT INTO support_ticket_messages (ticket_id, tenant_id, sender_id, is_super_admin_reply, body)
         VALUES ($1, $2, $3, false, $4)`,
        [ticketId, user.tenantId, user.userId, message]
      );
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    await notifySuperAdmins({
      title: "Yeni destek talebi",
      body: `${subject.slice(0, 80)} — bir firma yeni bir talep açtı.`,
      url: "/super-admin/destek",
    });

    return NextResponse.json({ id: ticketId }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
