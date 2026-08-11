import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import pool from "./db";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET!);
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "8h";

export interface JwtPayload {
  userId: number;
  username: string;
  role: string;
  iat?: number;
  iatMs?: number;
}

export async function signToken(payload: JwtPayload): Promise<string> {
  // iat (jose/JWT standardı) saniyeye yuvarlanır — zorla oturum sonlandırma
  // (tokens_invalid_before) kontrolü milisaniye hassasiyeti gerektirdiğinden
  // ayrıca iatMs de gömülür (bkz. getAuthUser).
  return await new SignJWT({ ...payload, iatMs: Date.now() })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRES_IN)
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as JwtPayload;
  } catch {
    return null;
  }
}

// Yetki (role) her istekte DB'den taze okunur — JWT sadece kimliği (userId)
// doğrulamak için kullanılır. Böylece bir kullanıcının rolü değiştirildiğinde
// veya hesabı silindiğinde, elindeki eski token süresi dolmadan bile artık
// eski rolüyle işlem yapamaz (aksi halde token süresine kadar, ör. 8 saat,
// yetkisi geri alınamazdı). Aynı taze-okuma pratiği hesap devre dışı
// bırakma ve zorla oturum sonlandırma (tokens_invalid_before) için de
// kullanılır — bkz. src/app/api/users/[id]/route.ts.
export async function getAuthUser(): Promise<JwtPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;
  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload) return null;

  const result = await pool.query(
    "SELECT username, role, is_active, tokens_invalid_before FROM users WHERE id = $1",
    [payload.userId]
  );
  const user = result.rows[0];
  if (!user) return null;
  if (!user.is_active) return null;
  // Bu değişiklikten önce imzalanmış eski token'larda iatMs bulunmaz —
  // öyle bir durumda saniyeye yuvarlanmış standart iat'a düşülür (aşırı
  // uçlarda ~1 sn'lik belirsizlik payı olsa da, kontrolü tamamen atlamaktan
  // çok daha güvenlidir).
  const issuedAtMs = payload.iatMs ?? (payload.iat ? payload.iat * 1000 : undefined);
  if (
    user.tokens_invalid_before &&
    issuedAtMs &&
    issuedAtMs < new Date(user.tokens_invalid_before).getTime()
  ) {
    return null;
  }

  return { userId: payload.userId, username: user.username, role: user.role };
}
