import { describe, it, expect } from "vitest";
import { createShareToken, verifyShareToken, SHARE_LINK_TTL_DAYS } from "./shareLink";

const secret = "test-secret";
const now = Date.UTC(2026, 10, 5);

describe("fatura paylaşım linki", () => {
  it("imzalı token geri çözülür", () => {
    const t = createShareToken(2, 28, { now, secret });
    expect(verifyShareToken(t, { now, secret })).toEqual({ tenantId: 2, invoiceId: 28 });
  });
  it("30 gün sonra geçersiz", () => {
    const t = createShareToken(2, 28, { now, secret });
    expect(verifyShareToken(t, { now: now + (SHARE_LINK_TTL_DAYS - 1) * 86_400_000, secret })).not.toBeNull();
    expect(verifyShareToken(t, { now: now + (SHARE_LINK_TTL_DAYS + 1) * 86_400_000, secret })).toBeNull();
  });
  it("başka anahtarla, değiştirilmiş fatura no'yla ya da bozuk biçimde reddedilir", () => {
    const t = createShareToken(2, 28, { now, secret });
    expect(verifyShareToken(t, { now, secret: "baska" })).toBeNull();
    const [, sig] = t.split(".");
    const forged = `${Buffer.from(`2.29.${Math.floor(now / 1000) + 86_400}`).toString("base64url")}.${sig}`;
    expect(verifyShareToken(forged, { now, secret })).toBeNull();
    expect(verifyShareToken("bozuk", { now, secret })).toBeNull();
    expect(verifyShareToken(`${Buffer.from("a.b.c").toString("base64url")}.x`, { now, secret })).toBeNull();
  });
});
