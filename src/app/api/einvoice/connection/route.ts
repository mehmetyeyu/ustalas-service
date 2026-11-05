import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { logAudit } from "@/lib/auditLog";
import { CONNECTION_COLUMNS, getConnection, mockProviderAllowed } from "@/lib/einvoice/connection";
import { einvoiceErrorResponse, einvoiceUser } from "@/lib/einvoice/guard";
import { VAT_RATES } from "@/lib/einvoice/vat";
import { parasutConfig, revokeRefreshToken } from "@/lib/einvoice/parasutAuth";
import { decryptSecret } from "@/lib/secretBox";

// e-Fatura sağlayıcı bağlantısı ve ayarları (Ayarlar → e-Fatura, yalnızca
// admin). Token'lar hiçbir zaman dönmez.
export async function GET() {
  const g = await einvoiceUser("admin");
  if ("response" in g) return g.response;
  try {
    const connection = await getConnection(g.user.tenantId);
    return NextResponse.json({ connection, mockAllowed: mockProviderAllowed(), parasutConfigured: parasutConfig() !== null });
  } catch (error) {
    return einvoiceErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  const g = await einvoiceUser("admin");
  if ("response" in g) return g.response;
  try {
    const body = await request.json().catch(() => ({}));
    const series = body.invoice_series == null ? null : String(body.invoice_series).trim().toUpperCase();
    if (series != null && !/^[A-Z0-9]{0,10}$/.test(series)) {
      return NextResponse.json({ error: "Fatura serisi en fazla 10 harf/rakam olmalı." }, { status: 400 });
    }
    const vat = body.default_vat_rate == null ? null : Number(body.default_vat_rate);
    if (vat != null && !VAT_RATES.includes(vat as (typeof VAT_RATES)[number])) {
      return NextResponse.json({ error: "KDV oranı %20, %10, %1 ya da %0 olmalı." }, { status: 400 });
    }
    const recordPayments = typeof body.record_payments === "boolean" ? body.record_payments : null;
    const result = await pool.query(
      `UPDATE einvoice_connections SET
         invoice_series = CASE WHEN $2::text IS NULL THEN invoice_series ELSE NULLIF($2, '') END,
         default_vat_rate = COALESCE($3, default_vat_rate),
         record_payments = COALESCE($4, record_payments),
         updated_at = NOW()
       WHERE tenant_id = $1 RETURNING ${CONNECTION_COLUMNS}`,
      [g.user.tenantId, series, vat, recordPayments]
    );
    if (result.rowCount === 0) return NextResponse.json({ error: "Bağlantı yok." }, { status: 404 });
    return NextResponse.json({ connection: result.rows[0] });
  } catch (error) {
    return einvoiceErrorResponse(error);
  }
}

// Bağlantıyı keser: token'lar silinir (Paraşüt'te de iptal edilir), kesilmiş
// faturalar kalır.
export async function DELETE() {
  const g = await einvoiceUser("admin");
  if ("response" in g) return g.response;
  try {
    const cur = await pool.query<{ provider: string; refresh_token_enc: string | null }>(
      "SELECT provider, refresh_token_enc FROM einvoice_connections WHERE tenant_id = $1",
      [g.user.tenantId]
    );
    const cfg = parasutConfig();
    const row = cur.rows[0];
    if (row?.provider === "parasut" && row.refresh_token_enc && cfg) {
      try {
        await revokeRefreshToken(cfg, decryptSecret(row.refresh_token_enc));
      } catch {
        // Çözülemeyen (ör. anahtarı değişmiş) token zaten kullanılamaz.
      }
    }
    const result = await pool.query(
      `UPDATE einvoice_connections SET status = 'disabled', access_token_enc = NULL, refresh_token_enc = NULL,
         token_expires_at = NULL, refresh_expires_at = NULL, pending_companies = NULL, updated_at = NOW() WHERE tenant_id = $1`,
      [g.user.tenantId]
    );
    if (result.rowCount === 0) return NextResponse.json({ error: "Bağlantı yok." }, { status: 404 });
    await logAudit({ tenantId: g.user.tenantId, userId: g.user.userId, username: g.user.username, action: "einvoice.disconnect", tableName: "einvoice_connections", recordId: null });
    return NextResponse.json({ success: true });
  } catch (error) {
    return einvoiceErrorResponse(error);
  }
}
