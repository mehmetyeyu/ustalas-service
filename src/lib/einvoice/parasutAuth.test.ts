import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { authorizeUrl, createPkcePair, parseMeCompanies } from "./parasutAuth";

const cfg = { clientId: "cid", clientSecret: "sec", idUrl: "https://id-staging.parasut.com/realms/parasut", apiUrl: "https://api.example" };

describe("PKCE", () => {
  it("verifier RFC 7636 kurallarına uyar, challenge onun SHA-256 base64url'i", () => {
    const { verifier, challenge } = createPkcePair();
    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]{43,128}$/);
    expect(challenge).toBe(createHash("sha256").update(verifier).digest("base64url"));
    expect(challenge).not.toContain("=");
    expect(createPkcePair().verifier).not.toBe(verifier);
  });
});

describe("authorizeUrl", () => {
  it("Paraşüt'ün istediği parametreleri taşır, secret'ı taşımaz", () => {
    const u = new URL(authorizeUrl(cfg, { redirectUri: "http://localhost:3000/api/einvoice/callback", state: "st", challenge: "ch" }));
    expect(u.origin + u.pathname).toBe("https://id-staging.parasut.com/realms/parasut/protocol/openid-connect/auth");
    expect(Object.fromEntries(u.searchParams)).toEqual({
      client_id: "cid",
      redirect_uri: "http://localhost:3000/api/einvoice/callback",
      response_type: "code",
      scope: "openid",
      state: "st",
      code_challenge: "ch",
      code_challenge_method: "S256",
      kc_idp_hint: "parasut",
    });
    expect(u.toString()).not.toContain("sec");
  });
});

describe("parseMeCompanies", () => {
  it("firmaları rolleriyle eşler; yalnızca sales_invoices=rw yazabilir", () => {
    const companies = parseMeCompanies({
      included: [
        { id: "35266", type: "companies", attributes: { name: "Test", legal_name: "Test Lastik A.Ş.", tax_number: "1234567890", city: "İstanbul", district: "Kadıköy", e_invoicing_activated_at: "2025-01-01T00:00:00+03:00" } },
        { id: "99", type: "companies", attributes: { name: "Salt Okunur", tax_number: "" } },
        { id: "r1", type: "user_roles", attributes: { sales_invoices: "rw" }, relationships: { company: { data: { id: "35266" } } } },
        { id: "r2", type: "user_roles", attributes: { sales_invoices: "ro" }, relationships: { company: { data: { id: "99" } } } },
        { id: "p1", type: "profiles", attributes: {} },
      ],
    });
    expect(companies).toEqual([
      { id: "35266", name: "Test Lastik A.Ş.", taxNumber: "1234567890", city: "İstanbul", district: "Kadıköy", eInvoicingActivatedAt: "2025-01-01T00:00:00+03:00", canWriteInvoices: true },
      { id: "99", name: "Salt Okunur", taxNumber: null, city: null, district: null, eInvoicingActivatedAt: null, canWriteInvoices: false },
    ]);
  });
  it("included yoksa boş liste", () => {
    expect(parseMeCompanies({})).toEqual([]);
  });
});
