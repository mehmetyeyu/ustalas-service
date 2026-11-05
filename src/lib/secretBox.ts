// Dış servis gizli bilgilerini (ör. e-Fatura sağlayıcısının OAuth token'ları,
// bkz. einvoice_connections) veritabanında şifreli tutmak için AES-256-GCM.
// Anahtar INTEGRATION_ENC_KEY: base64, 32 bayt (`openssl rand -base64 32`).
// Biçim "v1:<iv>:<tag>:<şifreli>" (base64) — anahtar döndürmek gerekirse
// sürüm öneki yeni biçimi eskisinden ayırır. Yalnızca sunucuda kullanılır.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";

function loadKey(raw: string | undefined = process.env.INTEGRATION_ENC_KEY): Buffer {
  if (!raw) throw new Error("INTEGRATION_ENC_KEY tanımlı değil.");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("INTEGRATION_ENC_KEY 32 baytlık base64 olmalı.");
  return key;
}

export function encryptSecret(plain: string, rawKey?: string): string {
  const key = loadKey(rawKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64"), cipher.getAuthTag().toString("base64"), ct.toString("base64")].join(":");
}

export function decryptSecret(box: string, rawKey?: string): string {
  const [version, iv, tag, ct] = box.split(":");
  if (version !== VERSION || !iv || !tag || ct == null) throw new Error("Şifreli değer biçimi tanınmadı.");
  const decipher = createDecipheriv("aes-256-gcm", loadKey(rawKey), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64")), decipher.final()]).toString("utf8");
}
