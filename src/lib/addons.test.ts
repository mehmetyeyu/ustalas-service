import { describe, it, expect } from "vitest";
import { canPurchaseAddon, hasAddon, hasPaidSubscription } from "./addons";

const future = new Date(Date.now() + 86_400_000).toISOString();
const past = new Date(Date.now() - 86_400_000).toISOString();

describe("hasPaidSubscription", () => {
  it("active ve exempt ücretli sayılır", () => {
    expect(hasPaidSubscription({ billing_status: "active", trial_ends_at: null })).toBe(true);
    expect(hasPaidSubscription({ billing_status: "exempt", trial_ends_at: null })).toBe(true);
  });
  it("deneme süresi ücretli sayılmaz (süresi dolmamış olsa bile)", () => {
    expect(hasPaidSubscription({ billing_status: "trialing", trial_ends_at: future })).toBe(false);
  });
  it("iptal edilmiş abonelik ödenmiş dönem bitene kadar sayılır", () => {
    expect(hasPaidSubscription({ billing_status: "active", trial_ends_at: null, billing_cancel_at_period_end: true, billing_period_ends_at: future })).toBe(true);
    expect(hasPaidSubscription({ billing_status: "active", trial_ends_at: null, billing_cancel_at_period_end: true, billing_period_ends_at: past })).toBe(false);
  });
  it("past_due/canceled/null sayılmaz", () => {
    for (const s of ["past_due", "canceled", null]) expect(hasPaidSubscription({ billing_status: s, trial_ends_at: null })).toBe(false);
  });
});

describe("hasAddon", () => {
  it("hak + ücretli abonelik gerekir", () => {
    expect(hasAddon({ billing_status: "active", trial_ends_at: null }, ["einvoice"], "einvoice")).toBe(true);
    expect(hasAddon({ billing_status: "active", trial_ends_at: null }, [], "einvoice")).toBe(false);
    expect(hasAddon({ billing_status: "active", trial_ends_at: null }, null, "einvoice")).toBe(false);
  });
  it("hediye edilmiş olsa da deneme süresinde çalışmaz", () => {
    expect(hasAddon({ billing_status: "trialing", trial_ends_at: future }, ["einvoice"], "einvoice")).toBe(false);
  });
  it("abonelik bitince uyur, hak kalır", () => {
    expect(hasAddon({ billing_status: "canceled", trial_ends_at: null }, ["einvoice"], "einvoice")).toBe(false);
  });
});

describe("canPurchaseAddon", () => {
  it("denemede satın alınamaz, abonede alınır, sahipse alınamaz", () => {
    expect(canPurchaseAddon({ billing_status: "trialing", trial_ends_at: future }, [], "einvoice")).toBe(false);
    expect(canPurchaseAddon({ billing_status: "active", trial_ends_at: null }, [], "einvoice")).toBe(true);
    expect(canPurchaseAddon({ billing_status: "active", trial_ends_at: null }, ["einvoice"], "einvoice")).toBe(false);
  });
});
