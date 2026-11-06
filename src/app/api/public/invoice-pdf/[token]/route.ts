import { NextRequest, NextResponse } from "next/server";
import { fetchInvoicePdf, getInvoice, invoicePdfFileName, InvoiceError } from "@/lib/einvoice/engine";
import { ProviderError } from "@/lib/einvoice/provider";
import { verifyShareToken } from "@/lib/einvoice/shareLink";

// Müşterinin WhatsApp'tan açtığı fatura PDF'i (kimliksiz). Token imzalı ve 30
// gün geçerli (src/lib/einvoice/shareLink.ts); iptal edilmiş faturanın linki
// çalışmaz. PDF her açılışta sağlayıcıdan taze alınır, saklanmaz. IP başına
// istek sınırı middleware'de.
function notAvailable(message: string, status: number) {
  return new NextResponse(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ref = verifyShareToken(token);
  if (!ref) return notAvailable("Bu bağlantı geçersiz ya da süresi dolmuş. Faturanızı firmadan tekrar isteyebilirsiniz.", 404);
  try {
    const inv = await getInvoice(ref.tenantId, ref.invoiceId);
    if (!inv || inv.status !== "RESMILESTI") return notAvailable("Bu fatura artık görüntülenemiyor.", 404);
    const upstream = await fetchInvoicePdf(ref.tenantId, inv);
    if (!upstream.ok || !upstream.body) return notAvailable("Fatura şu an alınamadı, biraz sonra tekrar deneyin.", 502);
    return new NextResponse(upstream.body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${invoicePdfFileName(inv)}"`,
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (error) {
    if (error instanceof InvoiceError || error instanceof ProviderError) return notAvailable("Fatura şu an alınamadı, biraz sonra tekrar deneyin.", 502);
    console.error("Paylaşılan fatura PDF hatası", error);
    return notAvailable("Fatura şu an alınamadı, biraz sonra tekrar deneyin.", 500);
  }
}
