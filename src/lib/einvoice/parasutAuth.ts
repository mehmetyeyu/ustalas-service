// Paraşüt bağlantısı ve token yönetimi. Paraşüt 2026'da giriş sistemini
// Keycloak OIDC'ye taşıdı (devhub belgesi, 2026-11-02 — eski /oauth/token
// notları docs/parasut-api-referans.md'de geçersiz): Authorization Code +
// PKCE (S256) zorunlu, confidential client token isteklerinde client_secret
// de gönderir. access token 2 saat, refresh token 30 gün kullanılmazsa ölür
// ve her yenilemede döner (yenisi saklanmalı). Geri dönüş adresleri devhub
// başvurusunda sabittir (prod: 3 alan adı, staging: localhost).
//
// Ortam: PARASUT_CLIENT_ID/SECRET (sunucuda), PARASUT_ID_URL (giriş sunucusu,
// staging: id-staging), PARASUT_API_URL (API, v4 yolları bunun altında).
import { createHash, randomBytes } from "node:crypto";
import pool from "../db";
import { decryptSecret, encryptSecret } from "../secretBox";
import { ProviderAuthError, ProviderError } from "./provider";

export interface ParasutConfig {
  clientId: string;
  clientSecret: string;
  idUrl: string;
  apiUrl: string;
}

export function parasutConfig(): ParasutConfig | null {
  const clientId = process.env.PARASUT_CLIENT_ID;
  const clientSecret = process.env.PARASUT_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    idUrl: (process.env.PARASUT_ID_URL || "https://id.parasut.com/realms/parasut").replace(/\/$/, ""),
    apiUrl: (process.env.PARASUT_API_URL || "https://api.parasut.com").replace(/\/$/, ""),
  };
}

export function requireParasutConfig(): ParasutConfig {
  const cfg = parasutConfig();
  if (!cfg) throw new ProviderError("Paraşüt entegrasyonu bu sunucuda yapılandırılmamış.", false);
  return cfg;
}

// RFC 7636: 43–128 karakter [A-Za-z0-9-._~]; base64url bu kümeye uyar.
export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function authorizeUrl(cfg: ParasutConfig, input: { redirectUri: string; state: string; challenge: string }): string {
  const u = new URL(`${cfg.idUrl}/protocol/openid-connect/auth`);
  u.searchParams.set("client_id", cfg.clientId);
  u.searchParams.set("redirect_uri", input.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "openid");
  u.searchParams.set("state", input.state);
  u.searchParams.set("code_challenge", input.challenge);
  u.searchParams.set("code_challenge_method", "S256");
  // Kimlik sağlayıcı seçim ekranını atlar, doğrudan Paraşüt girişine gider.
  u.searchParams.set("kc_idp_hint", "parasut");
  return u.toString();
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number | null;
}

async function tokenRequest(cfg: ParasutConfig, params: Record<string, string>): Promise<TokenSet> {
  let res: Response;
  try {
    res = await fetch(`${cfg.idUrl}/protocol/openid-connect/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ ...params, client_id: cfg.clientId, client_secret: cfg.clientSecret }),
      cache: "no-store",
    });
  } catch {
    throw new ProviderError("Paraşüt giriş sunucusuna ulaşılamadı.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // invalid_grant: kod/refresh token geçersiz ya da süresi dolmuş → yeniden bağlanmak gerekir.
    if (data.error === "invalid_grant") throw new ProviderAuthError();
    console.error("Paraşüt token hatası", res.status, data.error, data.error_description);
    throw new ProviderError("Paraşüt bağlantısı kurulamadı.", res.status >= 500, res.status);
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: Number(data.expires_in) || 7200,
    refreshExpiresIn: data.refresh_expires_in ? Number(data.refresh_expires_in) : null,
  };
}

export function exchangeCode(cfg: ParasutConfig, input: { code: string; redirectUri: string; verifier: string }): Promise<TokenSet> {
  return tokenRequest(cfg, { grant_type: "authorization_code", code: input.code, redirect_uri: input.redirectUri, code_verifier: input.verifier });
}

// Bağlantı kesilince refresh token Paraşüt'te de iptal edilir (en iyi çaba).
export async function revokeRefreshToken(cfg: ParasutConfig, refreshToken: string): Promise<void> {
  try {
    await fetch(`${cfg.idUrl}/protocol/openid-connect/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: refreshToken, token_type_hint: "refresh_token", client_id: cfg.clientId, client_secret: cfg.clientSecret }),
      cache: "no-store",
    });
  } catch {
    // Paraşüt'e ulaşılamasa da bizdeki token'lar silinir.
  }
}

// Token'ları şifreli yazar. `db` bir transaction istemcisi olabilir.
export async function storeTokens(db: Pick<typeof pool, "query">, tenantId: number, t: TokenSet): Promise<void> {
  await db.query(
    `UPDATE einvoice_connections SET access_token_enc = $2, refresh_token_enc = $3,
       token_expires_at = NOW() + make_interval(secs => $4),
       refresh_expires_at = CASE WHEN $5::int IS NULL THEN NULL ELSE NOW() + make_interval(secs => $5::int) END,
       updated_at = NOW()
     WHERE tenant_id = $1`,
    [tenantId, encryptSecret(t.accessToken), encryptSecret(t.refreshToken), t.expiresIn, t.refreshExpiresIn]
  );
}

async function markReauth(tenantId: number, message: string): Promise<void> {
  await pool.query("UPDATE einvoice_connections SET status = 'reauth', last_error = $2, updated_at = NOW() WHERE tenant_id = $1", [tenantId, message]);
}

// Geçerli access token. Süresi 2 dk içinde doluyorsa (ya da force) satır
// kilitlenip yenilenir — refresh token döndüğü için iki eşzamanlı yenileme
// birini geçersiz kılar, kilit bunu önler. Kilit alındıktan sonra tekrar
// bakılır: başka istek az önce yenilemiş olabilir.
export async function getAccessToken(tenantId: number, opts: { force?: boolean } = {}): Promise<string> {
  const cfg = requireParasutConfig();
  const cur = await pool.query<{ access_token_enc: string | null; fresh: boolean; status: string }>(
    `SELECT access_token_enc, status, (token_expires_at > NOW() + interval '2 minutes') AS fresh
     FROM einvoice_connections WHERE tenant_id = $1 AND provider = 'parasut'`,
    [tenantId]
  );
  const row = cur.rows[0];
  if (!row || row.status === "disabled" || row.status === "reauth" || !row.access_token_enc) throw new ProviderAuthError();
  if (row.fresh && !opts.force) return decryptSecret(row.access_token_enc);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query<{ access_token_enc: string | null; refresh_token_enc: string | null; fresh: boolean; changed: boolean }>(
      `SELECT access_token_enc, refresh_token_enc, (token_expires_at > NOW() + interval '2 minutes') AS fresh,
              (access_token_enc IS DISTINCT FROM $2) AS changed
       FROM einvoice_connections WHERE tenant_id = $1 FOR UPDATE`,
      [tenantId, row.access_token_enc]
    );
    const l = locked.rows[0];
    if (!l?.refresh_token_enc) throw new ProviderAuthError();
    // Başka bir istek biz beklerken yenilediyse onunkini kullan.
    if (l.access_token_enc && l.fresh && (!opts.force || l.changed)) {
      await client.query("COMMIT");
      return decryptSecret(l.access_token_enc);
    }
    const t = await tokenRequest(cfg, { grant_type: "refresh_token", refresh_token: decryptSecret(l.refresh_token_enc) });
    await storeTokens(client, tenantId, t);
    await client.query("COMMIT");
    return t.accessToken;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (error instanceof ProviderAuthError) await markReauth(tenantId, error.message);
    throw error;
  } finally {
    client.release();
  }
}

// Ham API çağrısı (bağlantı kurulurken, henüz satır yokken de kullanılır).
// 403'te tekrar denenmez — Paraşüt çok sayıda 401/403 alan istemciyi engelleyebilir.
// İstek sınırında (429) Paraşüt'ün söylediği süre kısaysa (≤ 5 sn) bekleyip
// en fazla iki kez tekrar denenir — tek bir fatura bile 5–10 istek tutar
// (kişi, her satır için ürün, fatura, resmileştirme). Daha uzunsa hata döner,
// "Tekrar Dene" kaldığı adımdan sürdürür.
const RATE_LIMIT_MAX_WAIT_S = 5;
const RATE_LIMIT_RETRIES = 2;

export async function apiRequest(cfg: ParasutConfig, accessToken: string, path: string, init: RequestInit = {}): Promise<Response> {
  let res: Response;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetch(`${cfg.apiUrl}/v4${path}`, {
        ...init,
        headers: { Accept: "application/json", "Content-Type": "application/json", ...init.headers, Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
    } catch {
      throw new ProviderError("Paraşüt'e ulaşılamadı.");
    }
    const wait = Number(res.headers.get("retry-after"));
    if (res.status !== 429 || attempt >= RATE_LIMIT_RETRIES || !(wait > 0 && wait <= RATE_LIMIT_MAX_WAIT_S)) break;
    await new Promise((r) => setTimeout(r, wait * 1000 + 250));
  }
  // Paraşüt 2026: "Uygulama Entegrasyonları" yetkisi varsayılan kapalı (şirket
  // sahibi dahil); yetkisiz kullanıcı adına her istek 403 alır.
  if (res.status === 403) {
    throw new ProviderError(
      "Paraşüt bu işleme izin vermedi. Paraşüt'te Ayarlar > Kullanıcılar > Düzenle > Uygulama Entegrasyonları yetkisinin açık olduğundan ve kullanıcınızın satış faturası yetkisi olduğundan emin olun.",
      false,
      403
    );
  }
  if (res.status === 429) {
    const wait = res.headers.get("retry-after");
    throw new ProviderError(`Paraşüt istek sınırı doldu${wait ? `, ${wait} sn sonra tekrar deneyin` : ""}.`, true, 429);
  }
  return res;
}

// Firmanın bağlantısıyla API çağrısı: 401'de bir kez zorla yenileyip tekrar dener.
export async function parasutRequest(tenantId: number, path: string, init: RequestInit = {}): Promise<Response> {
  const cfg = requireParasutConfig();
  let res = await apiRequest(cfg, await getAccessToken(tenantId), path, init);
  if (res.status === 401) {
    res = await apiRequest(cfg, await getAccessToken(tenantId, { force: true }), path, init);
    if (res.status === 401) {
      await markReauth(tenantId, "Paraşüt erişimi reddetti.");
      throw new ProviderAuthError();
    }
  }
  return res;
}

export interface ParasutCompany {
  id: string;
  name: string;
  taxNumber: string | null;
  city: string | null;
  district: string | null;
  eInvoicingActivatedAt: string | null;
  canWriteInvoices: boolean;
}

type JsonApiItem = { id: string; type: string; attributes?: Record<string, unknown>; relationships?: Record<string, { data?: { id: string } | null }> };

// GET /me?include=companies,user_roles → kullanıcının firmaları ve her
// birinde satış faturası yazma yetkisi (user_roles.sales_invoices == "rw").
export function parseMeCompanies(body: { included?: JsonApiItem[] }): ParasutCompany[] {
  const included = body.included ?? [];
  const roles = included.filter((i) => i.type === "user_roles");
  return included
    .filter((i) => i.type === "companies")
    .map((c) => {
      const a = c.attributes ?? {};
      const role = roles.find((r) => r.relationships?.company?.data?.id === c.id);
      const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
      return {
        id: String(c.id),
        name: str(a.legal_name) ?? str(a.name) ?? `Firma ${c.id}`,
        taxNumber: str(a.tax_number),
        city: str(a.city),
        district: str(a.district),
        eInvoicingActivatedAt: str(a.e_invoicing_activated_at),
        canWriteInvoices: role?.attributes?.sales_invoices === "rw",
      };
    });
}
