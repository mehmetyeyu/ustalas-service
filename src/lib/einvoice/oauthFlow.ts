// Paraşüt bağlanma akışının (connect → Paraşüt girişi → callback) ortak
// parçaları. Akış durumu sunucuda değil, şifreli bir httpOnly çerezde
// taşınır: 10 dk geçerli, tek kullanımlık (callback siler).
import { NextRequest, NextResponse } from "next/server";
import { decryptSecret } from "../secretBox";

export const OAUTH_COOKIE = "einv_oauth";
export const OAUTH_COOKIE_PATH = "/api/einvoice";

export interface OAuthFlowState {
  state: string;
  verifier: string;
  redirectUri: string;
  tenantId: number;
  userId: number;
  exp: number;
}

// Geri dönüş adresi isteğin geldiği alan adından üretilir — devhub'da kayıtlı
// adreslerden biri olmalı (prod: lastik/elevire.yeyu.co, ustalas-service.vercel.app;
// staging: localhost:3000). PARASUT_REDIRECT_URI ile sabitlenebilir.
export function callbackUrl(request: NextRequest): string {
  return process.env.PARASUT_REDIRECT_URI || new URL("/api/einvoice/callback", request.nextUrl.origin).toString();
}

export function readFlowState(request: NextRequest): OAuthFlowState | null {
  const raw = request.cookies.get(OAUTH_COOKIE)?.value;
  if (!raw) return null;
  try {
    const s = JSON.parse(decryptSecret(raw)) as OAuthFlowState;
    return s.exp > Date.now() ? s : null;
  } catch {
    return null;
  }
}

// Sonuç Ayarlar sayfasında toast ile gösterilir (EInvoiceSettingsSection).
export function settingsRedirect(request: NextRequest, result: { ok?: "connected" | "pending"; error?: string }): NextResponse {
  const u = new URL("/admin/settings", request.nextUrl.origin);
  if (result.ok) u.searchParams.set("einvoice", result.ok);
  if (result.error) u.searchParams.set("einvoice_error", result.error);
  const res = NextResponse.redirect(u);
  res.cookies.set(OAUTH_COOKIE, "", { path: OAUTH_COOKIE_PATH, maxAge: 0 });
  return res;
}
