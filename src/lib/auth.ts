import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import pool from "./db";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET!);
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "8h";

export interface JwtPayload {
  userId: number;
  username: string;
  role: string;
}

export async function signToken(payload: JwtPayload): Promise<string> {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
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
// yetkisi geri alınamazdı).
export async function getAuthUser(): Promise<JwtPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth_token")?.value;
  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload) return null;

  const result = await pool.query(
    "SELECT username, role FROM users WHERE id = $1",
    [payload.userId]
  );
  const user = result.rows[0];
  if (!user) return null;

  return { userId: payload.userId, username: user.username, role: user.role };
}
