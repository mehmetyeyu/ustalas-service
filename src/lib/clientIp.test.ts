import { describe, it, expect } from "vitest";
import type { NextRequest } from "next/server";
import { getClientIp } from "./clientIp";

// getClientIp sadece request.headers.get(...) kullanıyor — gerçek bir
// NextRequest kurmaya gerek yok, minimal bir sahte nesne yeterli.
function fakeRequest(headers: Record<string, string>): NextRequest {
  return {
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
  } as unknown as NextRequest;
}

describe("getClientIp", () => {
  it("x-forwarded-for varsa İLK değeri (asıl istemci, sonrakiler ara proxy) döner", () => {
    expect(getClientIp(fakeRequest({ "x-forwarded-for": "1.2.3.4, 5.6.7.8, 9.10.11.12" }))).toBe("1.2.3.4");
  });

  it("x-forwarded-for'daki boşlukları kırpar", () => {
    expect(getClientIp(fakeRequest({ "x-forwarded-for": "  1.2.3.4  , 5.6.7.8" }))).toBe("1.2.3.4");
  });

  it("x-forwarded-for yoksa x-real-ip'e düşer", () => {
    expect(getClientIp(fakeRequest({ "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9");
  });

  it("hiçbir header yoksa (ör. lokal geliştirme) 'bilinmiyor' döner", () => {
    expect(getClientIp(fakeRequest({}))).toBe("bilinmiyor");
  });
});
