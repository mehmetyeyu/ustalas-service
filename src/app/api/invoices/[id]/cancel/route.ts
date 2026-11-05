import { NextRequest, NextResponse } from "next/server";
import { logAudit } from "@/lib/auditLog";
import { cancelInvoice } from "@/lib/einvoice/engine";
import { einvoiceErrorResponse, einvoiceUser } from "@/lib/einvoice/guard";

// Resmileşmiş e-Arşiv'i iptal süresi içinde iptal eder ya da hatalı faturadan
// vazgeçer; iki durumda da siparişler yeniden faturalanabilir olur.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await einvoiceUser("invoices.cancel");
  if ("response" in g) return g.response;
  try {
    const { id } = await params;
    if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Fatura bulunamadı." }, { status: 404 });
    const invoice = await cancelInvoice(g.user.tenantId, Number(id));
    await logAudit({
      tenantId: g.user.tenantId, userId: g.user.userId, username: g.user.username, action: "invoice.cancel", tableName: "invoices",
      recordId: Number(id), detail: invoice?.gib_invoice_no ?? undefined,
    });
    return NextResponse.json({ invoice });
  } catch (error) {
    return einvoiceErrorResponse(error);
  }
}
