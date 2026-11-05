import { NextRequest, NextResponse } from "next/server";
import { advanceInvoice, getInvoice } from "@/lib/einvoice/engine";
import { einvoiceErrorResponse, einvoiceUser } from "@/lib/einvoice/guard";

// Yoklama ucu: fatura işleniyorsa bir sonraki bekleme noktasına kadar
// ilerletir (sağlayıcıda webhook yok, docs/e-fatura-tasarim.md §5.2), değilse
// güncel hâli döner. Ekran işlem sürerken birkaç saniyede bir çağırır.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await einvoiceUser("invoices.view");
  if ("response" in g) return g.response;
  try {
    const { id } = await params;
    if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Fatura bulunamadı." }, { status: 404 });
    const current = await getInvoice(g.user.tenantId, Number(id));
    if (!current) return NextResponse.json({ error: "Fatura bulunamadı." }, { status: 404 });
    const invoice = current.status === "HAZIRLANIYOR" || current.status === "ISLENIYOR" ? await advanceInvoice(g.user.tenantId, current.id) : current;
    return NextResponse.json({ invoice });
  } catch (error) {
    return einvoiceErrorResponse(error);
  }
}
