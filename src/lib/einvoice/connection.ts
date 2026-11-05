// Firmanın e-belge sağlayıcı bağlantısı (einvoice_connections) ve sağlayıcı
// seçimi. Sahte sağlayıcı üretimde asla seçilmez.
import pool from "../db";
import type { EInvoiceProvider, ProviderContext } from "./provider";
import { ProviderError } from "./provider";
import { mockProvider } from "./mockProvider";
import { parasutProvider } from "./parasut";

export interface EInvoiceConnection {
  tenant_id: number;
  provider: "parasut" | "mock";
  external_company_id: string;
  company_name: string | null;
  company_tax_number: string | null;
  company_city: string | null;
  company_district: string | null;
  status: "active" | "pending" | "reauth" | "disabled";
  // status='pending': kullanıcının fatura yazabildiği firmalar, biri seçilecek
  pending_companies: { id: string; name: string; taxNumber: string | null }[] | null;
  e_invoicing_activated_at: string | Date | null;
  invoice_series: string | null;
  default_vat_rate: number;
  record_payments: boolean;
  last_error: string | null;
  connected_at: string;
}

export const CONNECTION_COLUMNS = `tenant_id, provider, external_company_id, company_name, company_tax_number, company_city, company_district,
  status, pending_companies, e_invoicing_activated_at, invoice_series, default_vat_rate, record_payments, last_error, connected_at`;

export function mockProviderAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.EINVOICE_MOCK_ENABLED === "1";
}

export async function getConnection(tenantId: number): Promise<EInvoiceConnection | null> {
  const r = await pool.query<EInvoiceConnection>(`SELECT ${CONNECTION_COLUMNS} FROM einvoice_connections WHERE tenant_id = $1`, [tenantId]);
  return r.rows[0] ?? null;
}

// Sağlayıcıdaki kişi/ürün kimlikleri (customers.ext_contact_id,
// einvoice_product_map) bağlı firmaya aittir. Sağlayıcı ya da firma
// değişirse (ör. dev'de sahte sağlayıcıdan Paraşüt'e, ya da başka bir Paraşüt
// firmasına) eski kimlikler geçersizdir — sıfırlanır, ilk faturada yeniden
// bulunur/oluşturulur. Bağlantı satırı güncellenmeden ÖNCE çağrılır.
export async function resetExternalIdsIfScopeChanged(tenantId: number, provider: EInvoiceConnection["provider"], companyId: string): Promise<void> {
  const prev = await pool.query<{ provider: string; external_company_id: string }>(
    "SELECT provider, external_company_id FROM einvoice_connections WHERE tenant_id = $1",
    [tenantId]
  );
  const p = prev.rows[0];
  if (p && p.provider === provider && p.external_company_id === companyId) return;
  await pool.query("DELETE FROM einvoice_product_map WHERE tenant_id = $1", [tenantId]);
  await pool.query("UPDATE customers SET ext_contact_id = NULL WHERE tenant_id = $1 AND ext_contact_id IS NOT NULL", [tenantId]);
}

export function getProvider(conn: Pick<EInvoiceConnection, "provider">): EInvoiceProvider {
  if (conn.provider === "mock") {
    if (!mockProviderAllowed()) throw new ProviderError("Sahte e-Fatura sağlayıcısı üretimde kullanılamaz.", false);
    return mockProvider;
  }
  return parasutProvider;
}

export function providerContext(conn: Pick<EInvoiceConnection, "tenant_id" | "external_company_id">): ProviderContext {
  return { tenantId: conn.tenant_id, externalCompanyId: conn.external_company_id };
}

// Fatura serisi: Paraşüt'te tekrar kontrolü ve muhasebecinin ayırt etmesi
// için. Ayarlanmamışsa "ELV".
export function invoiceSeries(conn: Pick<EInvoiceConnection, "invoice_series">): string {
  return conn.invoice_series || "ELV";
}
