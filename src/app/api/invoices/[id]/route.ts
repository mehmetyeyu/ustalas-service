import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getInvoice } from "@/lib/einvoice/engine";
import { einvoiceErrorResponse, einvoiceUser } from "@/lib/einvoice/guard";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await einvoiceUser("invoices.view");
  if ("response" in g) return g.response;
  try {
    const { id } = await params;
    const invoice = /^\d+$/.test(id) ? await getInvoice(g.user.tenantId, Number(id)) : null;
    if (!invoice) return NextResponse.json({ error: "Fatura bulunamadı." }, { status: 404 });
    const orders = await pool.query(
      `SELECT o.id, o.plate, o.custom_order_no, o.created_at FROM invoice_orders io
       JOIN orders o ON o.id = io.order_id AND o.tenant_id = io.tenant_id
       WHERE io.invoice_id = $1 AND io.tenant_id = $2 ORDER BY o.created_at`,
      [invoice.id, g.user.tenantId]
    );
    return NextResponse.json({ invoice, orders: orders.rows });
  } catch (error) {
    return einvoiceErrorResponse(error);
  }
}
