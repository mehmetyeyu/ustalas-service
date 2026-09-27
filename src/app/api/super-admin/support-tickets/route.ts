import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

// Tüm firmaların destek taleplerini listeler — bkz. src/app/super-admin/destek/page.tsx.
// last_message_is_super_admin_reply=false (ya da hiç mesaj yoksa null) ve
// status='ACIK' ise "sıra sizde" anlamına gelir, listede öne çıkarılır.
export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user || user.role !== "super_admin") return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const conditions: string[] = [];
    const values: string[] = [];
    if (status === "ACIK" || status === "KAPALI") {
      values.push(status);
      conditions.push(`t.status = $${values.length}`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await pool.query(
      `SELECT
         t.id, t.subject, t.status, t.created_at, t.updated_at,
         te.name AS tenant_name, te.code AS tenant_code,
         lm.body AS last_message_body,
         lm.is_super_admin_reply AS last_message_is_super_admin_reply
       FROM support_tickets t
       JOIN tenants te ON te.id = t.tenant_id
       LEFT JOIN LATERAL (
         SELECT body, is_super_admin_reply
         FROM support_ticket_messages
         WHERE ticket_id = t.id
         ORDER BY created_at DESC
         LIMIT 1
       ) lm ON true
       ${where}
       ORDER BY t.updated_at DESC`,
      values
    );
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
