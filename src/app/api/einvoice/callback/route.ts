import { NextRequest } from "next/server";
import pool from "@/lib/db";
import { logAudit } from "@/lib/auditLog";
import { encryptSecret } from "@/lib/secretBox";
import { resetExternalIdsIfScopeChanged } from "@/lib/einvoice/connection";
import { einvoiceUser } from "@/lib/einvoice/guard";
import { ProviderAuthError, ProviderError } from "@/lib/einvoice/provider";
import { apiRequest, exchangeCode, parasutConfig, parseMeCompanies, type ParasutCompany } from "@/lib/einvoice/parasutAuth";
import { readFlowState, settingsRedirect } from "@/lib/einvoice/oauthFlow";

// Paraşüt girişinden dönüş: state + çerez doğrulanır, kod token'a çevrilir,
// /me ile kullanıcının fatura yazma yetkisi olan firmaları bulunur. Tek firma
// → bağlantı hemen aktif; birden çok → status='pending', Ayarlar'da seçilir.
export async function GET(request: NextRequest) {
  const g = await einvoiceUser("admin");
  if ("response" in g) return settingsRedirect(request, { error: "Oturumunuz kapanmış ya da yetkiniz yok, tekrar deneyin." });
  const flow = readFlowState(request);
  const q = request.nextUrl.searchParams;
  if (!flow || flow.state !== q.get("state") || flow.tenantId !== g.user.tenantId || flow.userId !== g.user.userId) {
    return settingsRedirect(request, { error: "Bağlantı isteği doğrulanamadı ya da süresi doldu, tekrar deneyin." });
  }
  if (q.get("error")) return settingsRedirect(request, { error: "Paraşüt bağlantısı iptal edildi." });
  const code = q.get("code");
  const cfg = parasutConfig();
  if (!code || !cfg) return settingsRedirect(request, { error: "Paraşüt bağlantısı kurulamadı." });

  try {
    const tokens = await exchangeCode(cfg, { code, redirectUri: flow.redirectUri, verifier: flow.verifier });
    const meRes = await apiRequest(cfg, tokens.accessToken, "/me?include=companies,user_roles");
    if (!meRes.ok) {
      console.error("Paraşüt /me hatası", meRes.status, (await meRes.text()).slice(0, 300));
      return settingsRedirect(request, { error: "Paraşüt hesap bilgileri okunamadı." });
    }
    const companies = parseMeCompanies(await meRes.json()).filter((c) => c.canWriteInvoices);
    if (companies.length === 0) {
      return settingsRedirect(request, { error: "Bu Paraşüt kullanıcısının satış faturası yazma yetkisi olan bir firması yok." });
    }
    const only: ParasutCompany | null = companies.length === 1 ? companies[0] : null;
    // Birden çok firmada seçim yapılınca (connection/company) kontrol edilir.
    if (only) await resetExternalIdsIfScopeChanged(g.user.tenantId, "parasut", only.id);
    await pool.query(
      `INSERT INTO einvoice_connections (tenant_id, provider, external_company_id, company_name, company_tax_number,
         company_city, company_district, e_invoicing_activated_at, status, pending_companies,
         access_token_enc, refresh_token_enc, token_expires_at, refresh_expires_at, last_error, connected_by)
       VALUES ($1, 'parasut', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW() + make_interval(secs => $12),
               CASE WHEN $13::int IS NULL THEN NULL ELSE NOW() + make_interval(secs => $13::int) END, NULL, $14)
       ON CONFLICT (tenant_id) DO UPDATE SET provider = 'parasut', external_company_id = EXCLUDED.external_company_id,
         company_name = EXCLUDED.company_name, company_tax_number = EXCLUDED.company_tax_number,
         company_city = EXCLUDED.company_city, company_district = EXCLUDED.company_district,
         e_invoicing_activated_at = EXCLUDED.e_invoicing_activated_at, status = EXCLUDED.status,
         pending_companies = EXCLUDED.pending_companies, access_token_enc = EXCLUDED.access_token_enc,
         refresh_token_enc = EXCLUDED.refresh_token_enc, token_expires_at = EXCLUDED.token_expires_at,
         refresh_expires_at = EXCLUDED.refresh_expires_at, last_error = NULL,
         connected_by = EXCLUDED.connected_by, connected_at = NOW(), updated_at = NOW()`,
      [
        g.user.tenantId, only?.id ?? "", only?.name ?? null, only?.taxNumber?.slice(0, 11) ?? null,
        only?.city ?? null, only?.district ?? null, only?.eInvoicingActivatedAt ?? null,
        only ? "active" : "pending", only ? null : JSON.stringify(companies),
        encryptSecret(tokens.accessToken), encryptSecret(tokens.refreshToken), tokens.expiresIn, tokens.refreshExpiresIn, g.user.userId,
      ]
    );
    await logAudit({
      tenantId: g.user.tenantId, userId: g.user.userId, username: g.user.username, action: "einvoice.connect",
      tableName: "einvoice_connections", recordId: null, detail: only ? `Paraşüt: ${only.name} (${only.id})` : `Paraşüt: ${companies.length} firma, seçim bekleniyor`,
    });
    return settingsRedirect(request, { ok: only ? "connected" : "pending" });
  } catch (error) {
    if (error instanceof ProviderAuthError) return settingsRedirect(request, { error: "Paraşüt giriş kodu geçersiz ya da süresi doldu, tekrar deneyin." });
    if (error instanceof ProviderError) return settingsRedirect(request, { error: error.message });
    console.error(error);
    return settingsRedirect(request, { error: "Paraşüt bağlantısı kurulamadı." });
  }
}
