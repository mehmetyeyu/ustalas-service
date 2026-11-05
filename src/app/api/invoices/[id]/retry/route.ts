import { NextRequest, NextResponse } from "next/server";
import { logAudit } from "@/lib/auditLog";
import { retryInvoice } from "@/lib/einvoice/engine";
import { einvoiceErrorResponse, einvoiceUser } from "@/lib/einvoice/guard";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await einvoiceUser("invoices.issue");
  if ("response" in g) return g.response;
  try {
    const { id } = await params;
    if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Fatura bulunamadı." }, { status: 404 });
    const invoice = await retryInvoice(g.user.tenantId, Number(id));
    await logAudit({ tenantId: g.user.tenantId, userId: g.user.userId, username: g.user.username, action: "invoice.retry", tableName: "invoices", recordId: Number(id) });
    return NextResponse.json({ invoice });
  } catch (error) {
    return einvoiceErrorResponse(error);
  }
}
