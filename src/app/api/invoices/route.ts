import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { logAudit } from "@/lib/auditLog";
import { advanceInvoice, getInvoice, openInvoice } from "@/lib/einvoice/engine";
import { einvoiceErrorResponse, einvoiceUser } from "@/lib/einvoice/guard";

const LIST_STATUSES = ["HAZIRLANIYOR", "ISLENIYOR", "RESMILESTI", "HATA", "IPTAL", "REDDEDILDI"];

// Fatura listesi (Faturalar sayfası) ya da bir siparişin faturaları (?order_id=).
export async function GET(request: NextRequest) {
  const g = await einvoiceUser("invoices.view");
  if ("response" in g) return g.response;
  try {
    const sp = request.nextUrl.searchParams;
    const page = Math.max(1, Number(sp.get("page")) || 1);
    const limit = Math.min(100, Math.max(1, Number(sp.get("limit")) || 25));
    const where = ["i.tenant_id = $1"];
    const params: unknown[] = [g.user.tenantId];
    const orderId = Number(sp.get("order_id"));
    if (orderId > 0) {
      params.push(orderId);
      // io.tenant_id, invoice_orders_tenant_order_idx'in kullanılması için (bkz. schema.sql).
      where.push(`EXISTS (SELECT 1 FROM invoice_orders io WHERE io.invoice_id = i.id AND io.tenant_id = i.tenant_id AND io.order_id = $${params.length})`);
    }
    const status = sp.get("status");
    if (status && LIST_STATUSES.includes(status)) {
      params.push(status);
      where.push(`i.status = $${params.length}`);
    }
    const q = sp.get("q")?.trim();
    if (q) {
      params.push(`%${q}%`);
      where.push(`(i.buyer_name ILIKE $${params.length} OR i.gib_invoice_no ILIKE $${params.length} OR i.plate_note ILIKE $${params.length})`);
    }
    const dateFrom = sp.get("dateFrom");
    if (dateFrom && /^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) { params.push(dateFrom); where.push(`i.issue_date >= $${params.length}`); }
    const dateTo = sp.get("dateTo");
    if (dateTo && /^\d{4}-\d{2}-\d{2}$/.test(dateTo)) { params.push(dateTo); where.push(`i.issue_date <= $${params.length}`); }

    const whereSql = where.join(" AND ");
    const [items, count] = await Promise.all([
      pool.query(
        `SELECT i.id, i.doc_type, i.status, to_char(i.issue_date, 'YYYY-MM-DD') AS issue_date, i.buyer_name, i.gib_invoice_no,
                i.gross_total::float AS gross_total, i.plate_note, i.error_message, i.cancellable_until, i.created_at,
                ARRAY(SELECT io.order_id FROM invoice_orders io WHERE io.invoice_id = i.id ORDER BY io.order_id) AS order_ids
         FROM invoices i WHERE ${whereSql}
         ORDER BY (i.status = 'HATA') DESC, i.created_at DESC
         LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
        params
      ),
      pool.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM invoices i WHERE ${whereSql}`, params),
    ]);
    return NextResponse.json({ items: items.rows, total: count.rows[0].n, page, limit });
  } catch (error) {
    return einvoiceErrorResponse(error);
  }
}

// Fatura kes: satırı açar ve bekleme noktasına kadar ilerletir (müşteri,
// fatura, resmileştirme isteği). Sonrasını ekran durum ucuyla yoklar.
export async function POST(request: NextRequest) {
  const g = await einvoiceUser("invoices.issue");
  if ("response" in g) return g.response;
  try {
    const body = await request.json().catch(() => ({}));
    const orderIds = Array.isArray(body.order_ids) ? body.order_ids.map(Number) : [];
    const invoiceId = await openInvoice({
      tenantId: g.user.tenantId,
      userId: g.user.userId,
      orderIds,
      issueDate: body.issue_date,
      buyer: body.buyer ?? {},
    });
    const created = await getInvoice(g.user.tenantId, invoiceId);
    await logAudit({
      tenantId: g.user.tenantId, userId: g.user.userId, username: g.user.username,
      action: "invoice.issue", tableName: "invoices", recordId: invoiceId,
      detail: `${created?.buyer_name ?? ""} · ${Number(created?.gross_total ?? 0).toFixed(2)} ₺ · Sipariş: ${orderIds.join(", ")}`,
    });
    const invoice = await advanceInvoice(g.user.tenantId, invoiceId);
    return NextResponse.json({ invoice }, { status: 201 });
  } catch (error) {
    return einvoiceErrorResponse(error);
  }
}
