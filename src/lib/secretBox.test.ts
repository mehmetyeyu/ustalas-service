import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { decryptSecret, encryptSecret } from "./secretBox";

const key = randomBytes(32).toString("base64");

describe("secretBox", () => {
  it("şifreler ve geri çözer; her seferinde farklı çıktı", () => {
    const a = encryptSecret("erişim-token-ğüş", key);
    const b = encryptSecret("erişim-token-ğüş", key);
    expect(a).not.toBe(b);
    expect(a.startsWith("v1:")).toBe(true);
    expect(decryptSecret(a, key)).toBe("erişim-token-ğüş");
  });
  it("başka anahtarla ya da bozulmuş değerle çözülmez", () => {
    const box = encryptSecret("gizli", key);
    expect(() => decryptSecret(box, randomBytes(32).toString("base64"))).toThrow();
    const parts = box.split(":");
    parts[3] = Buffer.from("başka").toString("base64");
    expect(() => decryptSecret(parts.join(":"), key)).toThrow();
  });
  it("anahtar yoksa ya da boyu yanlışsa hata", () => {
    expect(() => encryptSecret("x", "")).toThrow();
    expect(() => encryptSecret("x", Buffer.from("kısa").toString("base64"))).toThrow();
  });
});
