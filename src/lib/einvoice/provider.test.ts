import { describe, it, expect } from "vitest";
import { ProviderAuthError, ProviderError, staysInProgress } from "./provider";

describe("staysInProgress", () => {
  it("istek sınırı (429) faturayı HATA'ya düşürmez", () => {
    expect(staysInProgress(new ProviderError("Paraşüt istek sınırı doldu.", true, 429))).toBe(true);
  });
  it("diğer hatalar HATA'ya düşürür", () => {
    expect(staysInProgress(new ProviderError("Paraşüt'e ulaşılamadı."))).toBe(false);
    expect(staysInProgress(new ProviderError("izin yok", false, 403))).toBe(false);
    expect(staysInProgress(new ProviderAuthError())).toBe(false);
    expect(staysInProgress(new Error("x"))).toBe(false);
  });
});
