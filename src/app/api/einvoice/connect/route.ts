import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { encryptSecret } from "@/lib/secretBox";
import { einvoiceUser } from "@/lib/einvoice/guard";
import { authorizeUrl, createPkcePair, parasutConfig } from "@/lib/einvoice/parasutAuth";
import { OAUTH_COOKIE, OAUTH_COOKIE_PATH, callbackUrl, settingsRedirect } from "@/lib/einvoice/oauthFlow";

// "Paraşüt'e Bağlan": PKCE + state üretir, ikisini (ve kimin başlattığını)
// şifreli, kısa ömürlü bir httpOnly çerezde tutar, kullanıcıyı Paraşüt
// girişine yönlendirir. Geri dönüş: /api/einvoice/callback.
export async function GET(request: NextRequest) {
  const g = await einvoiceUser("admin");
  if ("response" in g) return settingsRedirect(request, { error: "Bu işlem için yönetici olmalı ve e-Fatura modülü açık olmalı." });
  const cfg = parasutConfig();
  if (!cfg) return settingsRedirect(request, { error: "Paraşüt entegrasyonu bu sunucuda yapılandırılmamış." });

  const { verifier, challenge } = createPkcePair();
  const state = randomBytes(24).toString("base64url");
  const redirectUri = callbackUrl(request);
  const res = NextResponse.redirect(authorizeUrl(cfg, { redirectUri, state, challenge }));
  res.cookies.set(OAUTH_COOKIE, encryptSecret(JSON.stringify({ state, verifier, redirectUri, tenantId: g.user.tenantId, userId: g.user.userId, exp: Date.now() + 10 * 60_000 })), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // Paraşüt'ten dönüş üst düzey GET yönlendirmesi — lax çerez gönderilir.
    sameSite: "lax",
    path: OAUTH_COOKIE_PATH,
    maxAge: 600,
  });
  return res;
}
