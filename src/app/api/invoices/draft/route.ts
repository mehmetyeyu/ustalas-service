import { NextRequest, NextResponse } from "next/server";
import { buildDraft, requireActiveConnection } from "@/lib/einvoice/engine";
import { einvoiceErrorResponse, einvoiceUser } from "@/lib/einvoice/guard";

// Fatura kes penceresi için ön izleme: alıcı varsayılanları (müşteri kaydından),
// satırlar, KDV ayrımı, indirim. Hiçbir şey yazmaz.
export async function GET(request: NextRequest) {
  const g = await einvoiceUser("invoices.issue");
  if ("response" in g) return g.response;
  try {
    const conn = await requireActiveConnection(g.user.tenantId);
    const ids = (request.nextUrl.searchParams.get("order_ids") ?? "").split(",").map(Number);
    const draft = await buildDraft(g.user.tenantId, ids, conn.default_vat_rate);
    return NextResponse.json({
      orders: draft.orders,
      customer: draft.customer ? { id: draft.customer.id, is_corporate: draft.customer.is_corporate } : null,
      buyer: draft.buyerDefaults,
      lines: draft.amounts.lines,
      totals: { net: draft.amounts.net, vat: draft.amounts.vat, gross: draft.amounts.gross, discount: draft.amounts.discountGross },
      plate_note: draft.plateNote,
      company_place: { city: conn.company_city, district: conn.company_district },
    });
  } catch (error) {
    return einvoiceErrorResponse(error);
  }
}
