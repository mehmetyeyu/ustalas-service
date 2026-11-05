import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { logAudit } from "@/lib/auditLog";
import { CONNECTION_COLUMNS } from "@/lib/einvoice/connection";
import { einvoiceErrorResponse, einvoiceUser } from "@/lib/einvoice/guard";
import type { ParasutCompany } from "@/lib/einvoice/parasutAuth";

// Paraşüt kullanıcısının birden çok firması varsa (status='pending')
// hangisinin bağlanacağını seçer. Yalnızca callback'te bulunan, fatura yazma
// yetkisi olan firmalar seçilebilir.
export async function POST(request: NextRequest) {
  const g = await einvoiceUser("admin");
  if ("response" in g) return g.response;
  try {
    const { company_id } = await request.json().catch(() => ({}));
    const cur = await pool.query<{ pending_companies: ParasutCompany[] | null }>(
      "SELECT pending_companies FROM einvoice_connections WHERE tenant_id = $1 AND status = 'pending'",
      [g.user.tenantId]
    );
    const c = cur.rows[0]?.pending_companies?.find((p) => p.id === String(company_id));
    if (!c) return NextResponse.json({ error: "Seçilebilecek bir firma yok, yeniden bağlanın." }, { status: 400 });
    const result = await pool.query(
      `UPDATE einvoice_connections SET external_company_id = $2, company_name = $3, company_tax_number = $4,
         company_city = $5, company_district = $6, e_invoicing_activated_at = $7, status = 'active',
         pending_companies = NULL, updated_at = NOW()
       WHERE tenant_id = $1 AND status = 'pending' RETURNING ${CONNECTION_COLUMNS}`,
      [g.user.tenantId, c.id, c.name, c.taxNumber?.slice(0, 11) ?? null, c.city, c.district, c.eInvoicingActivatedAt]
    );
    await logAudit({ tenantId: g.user.tenantId, userId: g.user.userId, username: g.user.username, action: "einvoice.connect", tableName: "einvoice_connections", recordId: null, detail: `Paraşüt: ${c.name} (${c.id})` });
    return NextResponse.json({ connection: result.rows[0] });
  } catch (error) {
    return einvoiceErrorResponse(error);
  }
}
