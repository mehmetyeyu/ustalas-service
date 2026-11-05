import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { formatCurrency } from "@/lib/format";
import { buildWhatsAppUrl } from "@/lib/quoteDocument";
import { getInvoice } from "@/lib/einvoice/engine";
import { einvoiceErrorResponse, einvoiceUser } from "@/lib/einvoice/guard";
import { createShareToken, SHARE_LINK_TTL_DAYS } from "@/lib/einvoice/shareLink";

// Resmileşmiş faturanın müşteriye gidecek WhatsApp mesajı: bizim imzalı PDF
// linkimiz (bkz. src/lib/einvoice/shareLink.ts) + kısa özet. Telefon
// faturanın siparişindeki ya da müşteri kaydındaki numaradır.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await einvoiceUser("invoices.view");
  if ("response" in g) return g.response;
  try {
    const { id } = await params;
    const inv = /^\d+$/.test(id) ? await getInvoice(g.user.tenantId, Number(id)) : null;
    if (!inv) return NextResponse.json({ error: "Fatura bulunamadı." }, { status: 404 });
    if (inv.status !== "RESMILESTI") return NextResponse.json({ error: "Yalnızca resmileşmiş fatura paylaşılabilir." }, { status: 409 });

    const extra = await pool.query<{ company: string | null; phone: string | null }>(
      `SELECT t.name AS company,
              COALESCE(NULLIF((SELECT o.customer_phone FROM invoice_orders io JOIN orders o ON o.id = io.order_id AND o.tenant_id = io.tenant_id
                               WHERE io.invoice_id = $2 ORDER BY o.created_at LIMIT 1), ''),
                       (SELECT c.phone FROM customers c WHERE c.id = $3 AND c.tenant_id = $1)) AS phone
       FROM tenants t WHERE t.id = $1`,
      [g.user.tenantId, inv.id, inv.customer_id]
    );
    const { company, phone } = extra.rows[0] ?? { company: null, phone: null };
    const url = new URL(`/api/public/invoice-pdf/${createShareToken(g.user.tenantId, inv.id)}`, request.nextUrl.origin).toString();
    const kind = inv.doc_type === "e_fatura" ? "e-Faturanız" : "e-Arşiv faturanız";
    const text = [
      `Merhaba ${inv.buyer_name},`,
      `${company ? `${company} olarak ` : ""}${inv.gib_invoice_no ? `${inv.gib_invoice_no} numaralı ` : ""}${kind} hazır.`,
      `Tutar: ${formatCurrency(Number(inv.gross_total))}`,
      "",
      `Faturayı görüntülemek için: ${url}`,
      `(Bağlantı ${SHARE_LINK_TTL_DAYS} gün geçerlidir.)`,
    ].join("\n");
    return NextResponse.json({ url, whatsappUrl: buildWhatsAppUrl(phone, text) });
  } catch (error) {
    return einvoiceErrorResponse(error);
  }
}
