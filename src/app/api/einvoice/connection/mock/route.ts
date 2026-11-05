import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { logAudit } from "@/lib/auditLog";
import { CONNECTION_COLUMNS, mockProviderAllowed, resetExternalIdsIfScopeChanged } from "@/lib/einvoice/connection";
import { einvoiceErrorResponse, einvoiceUser } from "@/lib/einvoice/guard";

// Geliştirme: sahte sağlayıcıyla bağlantı kurar (Paraşüt erişimi gelene kadar
// akışı uçtan uca denemek için, docs/e-fatura-tasarim.md §10 Faz 0).
// Üretimde kapalı.
export async function POST() {
  const g = await einvoiceUser("admin");
  if ("response" in g) return g.response;
  if (!mockProviderAllowed()) return NextResponse.json({ error: "Sahte sağlayıcı üretimde kullanılamaz." }, { status: 403 });
  try {
    const tenant = await pool.query<{ name: string; billing_tax_id: string | null; billing_city: string | null; billing_district: string | null }>(
      "SELECT name, billing_tax_id, billing_city, billing_district FROM tenants WHERE id = $1",
      [g.user.tenantId]
    );
    const t = tenant.rows[0];
    await resetExternalIdsIfScopeChanged(g.user.tenantId, "mock", `mock-${g.user.tenantId}`);
    const result = await pool.query(
      `INSERT INTO einvoice_connections (tenant_id, provider, external_company_id, company_name, company_tax_number,
                                         company_city, company_district, status, e_invoicing_activated_at, connected_by)
       VALUES ($1, 'mock', $7, $2, $3, $4, $5, 'active', '2020-01-01', $6)
       ON CONFLICT (tenant_id) DO UPDATE SET provider = 'mock', external_company_id = EXCLUDED.external_company_id,
         company_name = EXCLUDED.company_name, company_tax_number = EXCLUDED.company_tax_number,
         company_city = EXCLUDED.company_city, company_district = EXCLUDED.company_district,
         status = 'active', last_error = NULL, connected_by = EXCLUDED.connected_by, connected_at = NOW(), updated_at = NOW()
       RETURNING ${CONNECTION_COLUMNS}`,
      [g.user.tenantId, `${t?.name ?? "Firma"} (sahte)`, t?.billing_tax_id ?? null, t?.billing_city || "İstanbul", t?.billing_district || "Merkez", g.user.userId, `mock-${g.user.tenantId}`]
    );
    await logAudit({ tenantId: g.user.tenantId, userId: g.user.userId, username: g.user.username, action: "einvoice.connect", tableName: "einvoice_connections", recordId: null, detail: "Sahte sağlayıcı (geliştirme)" });
    return NextResponse.json({ connection: result.rows[0] });
  } catch (error) {
    return einvoiceErrorResponse(error);
  }
}
