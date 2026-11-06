import { NextRequest, NextResponse } from "next/server";
import { fetchInvoicePdf, getInvoice, invoicePdfFileName } from "@/lib/einvoice/engine";
import { einvoiceErrorResponse, einvoiceUser } from "@/lib/einvoice/guard";

// Faturanın PDF'i — sağlayıcıdan taze alınıp akıtılır, saklanmaz
// (docs/e-fatura-tasarim.md §2). ?download=1 indirme olarak verir.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await einvoiceUser("invoices.view");
  if ("response" in g) return g.response;
  try {
    const { id } = await params;
    const invoice = /^\d+$/.test(id) ? await getInvoice(g.user.tenantId, Number(id)) : null;
    if (!invoice) return NextResponse.json({ error: "Fatura bulunamadı." }, { status: 404 });
    const upstream = await fetchInvoicePdf(g.user.tenantId, invoice);
    if (!upstream.ok || !upstream.body) return NextResponse.json({ error: "PDF alınamadı. Biraz sonra tekrar deneyin." }, { status: 502 });
    const name = invoicePdfFileName(invoice);
    return new NextResponse(upstream.body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${request.nextUrl.searchParams.get("download") ? "attachment" : "inline"}; filename="${name}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return einvoiceErrorResponse(error);
  }
}
