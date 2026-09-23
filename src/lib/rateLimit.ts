import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Redis env var'ları yoksa (ör. Upstash henüz bağlanmamış bir ortam) rate
// limiting tamamen atlanır — bu bir savunma katmanı, çekirdek iş mantığı
// değil; Redis'in kendisi çökse/yanıt vermese bile login/kayıt akışını
// kilitlememesi gerekir (bkz. checkRateLimit'teki fail-open).
const redis =
  process.env.REDIS_KV_REST_API_URL && process.env.REDIS_KV_REST_API_TOKEN
    ? new Redis({
        url: process.env.REDIS_KV_REST_API_URL,
        token: process.env.REDIS_KV_REST_API_TOKEN,
      })
    : null;

function makeLimiter(prefix: string, requests: number, window: `${number} ${"s" | "m" | "h"}`) {
  if (!redis) return null;
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(requests, window),
    prefix: `ratelimit:${prefix}`,
  });
}

// Hesap bazlı kilit zaten var (bkz. /api/auth/login, 5 yanlış deneme → 15
// dk kilit) — bu ayrıca IP bazlı, farklı kullanıcı adlarıyla hacim/enumerasyon
// denemesine karşı.
export const loginRateLimit = makeLimiter("login", 10, "60 s");
// Spam firma kaydı — firma kodu üretimi, DB kirliliği.
export const registerRateLimit = makeLimiter("register", 5, "1 h");
// Bir firmanın herkese açık randevu takvimini spam'le doldurma.
export const bookingRateLimit = makeLimiter("booking", 20, "1 h");

// Redis yoksa veya erişilemezse istek engellenmez (fail-open) — rate
// limiting bir savunma katmanıdır, bir Upstash kesintisi tüm login/kayıt
// akışını durdurmamalı.
export async function isRateLimited(limiter: Ratelimit | null, identifier: string): Promise<boolean> {
  if (!limiter) return false;
  try {
    const { success } = await limiter.limit(identifier);
    return !success;
  } catch (error) {
    console.error("Rate limit kontrolü başarısız (fail-open, istek engellenmedi):", error);
    return false;
  }
}
