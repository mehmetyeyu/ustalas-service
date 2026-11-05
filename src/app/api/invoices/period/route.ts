import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { parseStatementMonth } from "@/lib/statement";
import { einvoiceErrorResponse, einvoiceUser } from "@/lib/einvoice/guard";

// Ekstre ekranının e-Fatura bölümü (filo aylık faturası, tasarım §8.2 madde
// 7): bir müşterinin seçili aydaki faturalanmamış tamamlanmış siparişleri ve
// o ayın siparişlerine kesilmiş faturalar. Sipariş–müşteri eşlemesi ekstreyle
// aynı (orders.customer_name = customers.name, ay sınırı İstanbul'a göre).
export async function GET(request: NextRequest) {
  const g = await einvoiceUser("invoices.view");
  if ("response" in g) return g.response;
  const customerId = Number(request.nextUrl.searchParams.get("customer_id"));
  const period = parseStatementMonth(request.nextUrl.searchParams.get("month"));
  if (!Number.isInteger(customerId) || customerId <= 0 || !period) return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  try {
    const customer = await pool.query<{ name: string }>("SELECT name FROM customers WHERE id = $1 AND tenant_id = $2", [customerId, g.user.tenantId]);
    if (!customer.rows[0]) return NextResponse.json({ error: "Müşteri bulunamadı." }, { status: 404 });
    const monthFilter = `o.tenant_id = $1 AND o.customer_name = $2 AND o.status = 'TAMAMLANDI'
      AND o.created_at >= ($3::timestamp AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'UTC'
      AND o.created_at < ($4::timestamp AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'UTC'`;
    const args = [g.user.tenantId, customer.rows[0].name, period.start, period.next];
    const [uninvoiced, invoices] = await Promise.all([
      pool.query<{ id: number; total: number }>(
        `SELECT o.id, COALESCE(o.paid_amount, o.total_amount)::float AS total FROM orders o
         WHERE ${monthFilter}
           AND NOT EXISTS (SELECT 1 FROM invoice_orders io WHERE io.tenant_id = o.tenant_id AND io.order_id = o.id AND io.active)
         ORDER BY o.created_at, o.id`,
        args
      ),
      pool.query(
        `SELECT i.id, i.status, i.doc_type, i.gib_invoice_no, i.gross_total, to_char(i.issue_date, 'YYYY-MM-DD') AS issue_date,
                i.error_message, COUNT(DISTINCT io.order_id)::int AS order_count
         FROM invoices i JOIN invoice_orders io ON io.invoice_id = i.id AND io.tenant_id = i.tenant_id
         JOIN orders o ON o.id = io.order_id AND o.tenant_id = io.tenant_id
         WHERE i.tenant_id = $1 AND ${monthFilter.replace("o.tenant_id = $1 AND ", "")}
         GROUP BY i.id ORDER BY i.id DESC`,
        args
      ),
    ]);
    return NextResponse.json({
      uninvoiced: {
        order_ids: uninvoiced.rows.map((r) => r.id),
        count: uninvoiced.rows.length,
        total: Math.round(uninvoiced.rows.reduce((s, r) => s + r.total, 0) * 100) / 100,
      },
      invoices: invoices.rows,
    });
  } catch (error) {
    return einvoiceErrorResponse(error);
  }
}
