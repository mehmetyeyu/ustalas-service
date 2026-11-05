// Faturanın müşteriyle paylaşılan PDF linki (WhatsApp, tasarım §8.2):
// /api/public/invoice-pdf/<token>. Paraşüt'ün PDF adresi 1 saat geçerli ve
// "müşteriyle paylaşmayın" deniyor — bu yüzden kendi imzalı linkimizi veririz,
// her açılışta PDF sağlayıcıdan taze alınıp akıtılır (saklanmaz).
//
// Token durumsuz: firma + fatura + son geçerlilik, HMAC-SHA256 ile imzalı
// (anahtar JWT_SECRET'ten bu amaca özel türetilir — oturum token'larıyla
// karıştırılamaz). 30 gün geçerli; fatura iptal edilirse link de çalışmaz
// (açılışta durum kontrol edilir).
import { createHmac, timingSafeEqual } from "node:crypto";

export const SHARE_LINK_TTL_DAYS = 30;

function signingKey(secret: string | undefined): Buffer {
  if (!secret) throw new Error("JWT_SECRET tanımlı değil.");
  return createHmac("sha256", secret).update("einvoice-pdf-share-v1").digest();
}

function sign(payload: string, secret: string | undefined): string {
  return createHmac("sha256", signingKey(secret)).update(payload).digest("base64url");
}

export function createShareToken(tenantId: number, invoiceId: number, opts: { now?: number; secret?: string } = {}): string {
  const exp = Math.floor((opts.now ?? Date.now()) / 1000) + SHARE_LINK_TTL_DAYS * 86_400;
  const payload = `${tenantId}.${invoiceId}.${exp}`;
  return `${Buffer.from(payload).toString("base64url")}.${sign(payload, opts.secret ?? process.env.JWT_SECRET)}`;
}

export function verifyShareToken(token: string, opts: { now?: number; secret?: string } = {}): { tenantId: number; invoiceId: number } | null {
  const [encoded, sig] = token.split(".");
  if (!encoded || !sig) return null;
  const payload = Buffer.from(encoded, "base64url").toString();
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(payload);
  if (!m) return null;
  const expected = Buffer.from(sign(payload, opts.secret ?? process.env.JWT_SECRET));
  const given = Buffer.from(sig);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  if (Number(m[3]) * 1000 < (opts.now ?? Date.now())) return null;
  return { tenantId: Number(m[1]), invoiceId: Number(m[2]) };
}
