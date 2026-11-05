import { NextResponse } from "next/server";
import { getConnection } from "@/lib/einvoice/connection";
import { einvoiceErrorResponse, einvoiceUser } from "@/lib/einvoice/guard";
import { parasutRequest } from "@/lib/einvoice/parasutAuth";

// "Bağlantıyı Test Et": yalnızca okur — bağlı kullanıcı ve firmanın müşteri
// sayısı. Hiçbir şey yazmaz.
export async function GET() {
  const g = await einvoiceUser("admin");
  if ("response" in g) return g.response;
  try {
    const conn = await getConnection(g.user.tenantId);
    if (!conn || conn.provider !== "parasut" || conn.status !== "active") {
      return NextResponse.json({ error: "Aktif bir Paraşüt bağlantısı yok." }, { status: 400 });
    }
    const me = await parasutRequest(g.user.tenantId, "/me");
    if (!me.ok) return NextResponse.json({ error: `Paraşüt hesap bilgisi okunamadı (HTTP ${me.status}).` }, { status: 502 });
    const contacts = await parasutRequest(g.user.tenantId, `/${conn.external_company_id}/contacts?page[size]=1`);
    if (!contacts.ok) return NextResponse.json({ error: `Firmanın kayıtları okunamadı (HTTP ${contacts.status}).` }, { status: 502 });
    const meBody = await me.json();
    const contactsBody = await contacts.json();
    return NextResponse.json({
      user: meBody?.data?.attributes?.email ?? null,
      companyId: conn.external_company_id,
      companyName: conn.company_name,
      contactCount: contactsBody?.meta?.total_count ?? null,
    });
  } catch (error) {
    return einvoiceErrorResponse(error);
  }
}
