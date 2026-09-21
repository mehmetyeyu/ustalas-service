import { describe, it, expect } from "vitest";
import { isBillingLocked, trialDaysLeft, isInvoiceInfoComplete, type InvoiceInfo } from "./billing";

const DAY_MS = 24 * 60 * 60 * 1000;
const future = (days: number) => new Date(Date.now() + days * DAY_MS).toISOString();
const past = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString();

describe("isBillingLocked", () => {
  it("exempt asla kilitlenmez", () => {
    expect(isBillingLocked({ billing_status: "exempt", trial_ends_at: null })).toBe(false);
  });

  it("active, iptal edilmemişse kilitlenmez (billing_period_ends_at geçmiş olsa bile)", () => {
    expect(
      isBillingLocked({
        billing_status: "active",
        trial_ends_at: null,
        billing_cancel_at_period_end: false,
        billing_period_ends_at: past(5),
      })
    ).toBe(false);
  });

  it("active + iptal edilmiş + dönem sonu henüz gelmemişse kilitlenmez (Netflix modeli)", () => {
    expect(
      isBillingLocked({
        billing_status: "active",
        trial_ends_at: null,
        billing_cancel_at_period_end: true,
        billing_period_ends_at: future(3),
      })
    ).toBe(false);
  });

  it("active + iptal edilmiş + dönem sonu geçmişse kilitlenir", () => {
    expect(
      isBillingLocked({
        billing_status: "active",
        trial_ends_at: null,
        billing_cancel_at_period_end: true,
        billing_period_ends_at: past(1),
      })
    ).toBe(true);
  });

  it("trialing, deneme süresi bitmemişse kilitlenmez", () => {
    expect(isBillingLocked({ billing_status: "trialing", trial_ends_at: future(2) })).toBe(false);
  });

  it("trialing, deneme süresi bitmişse kilitlenir", () => {
    expect(isBillingLocked({ billing_status: "trialing", trial_ends_at: past(1) })).toBe(true);
  });

  it("trialing ama trial_ends_at hiç yoksa kilitlenir", () => {
    expect(isBillingLocked({ billing_status: "trialing", trial_ends_at: null })).toBe(true);
  });

  it.each(["past_due", "canceled", null])("billing_status=%s koşulsuz kilitlenir", (status) => {
    expect(isBillingLocked({ billing_status: status, trial_ends_at: null })).toBe(true);
  });
});

describe("trialDaysLeft", () => {
  it("null tarih için 0 döner", () => {
    expect(trialDaysLeft(null)).toBe(0);
  });

  it("geçmiş bir tarih için negatif değil 0 döner (clamp)", () => {
    expect(trialDaysLeft(past(3))).toBe(0);
  });

  it("gelecekteki bir tarih için gün sayısını yukarı yuvarlar", () => {
    // 2.1 gün sonrası -> 3 (Math.ceil)
    const dateStr = new Date(Date.now() + 2.1 * DAY_MS).toISOString();
    expect(trialDaysLeft(dateStr)).toBe(3);
  });
});

describe("isInvoiceInfoComplete", () => {
  const base: InvoiceInfo = {
    billing_entity_type: null,
    billing_tax_id: null,
    billing_tax_office: null,
    billing_invoice_title: "Test",
    billing_city: "İstanbul",
    billing_district: "Kadıköy",
    billing_address: "Test Mah. No:1",
  };

  it("bireysel + geçerli 11 haneli TCKN ile tamamlanmış sayılır", () => {
    expect(isInvoiceInfoComplete({ ...base, billing_entity_type: "individual", billing_tax_id: "12345678901" })).toBe(true);
  });

  it("bireysel + 10 haneli (VKN uzunluğunda) bir numara TCKN olarak geçersizdir", () => {
    expect(isInvoiceInfoComplete({ ...base, billing_entity_type: "individual", billing_tax_id: "1234567890" })).toBe(false);
  });

  it("şirket + geçerli 10 haneli VKN + vergi dairesi ile tamamlanmış sayılır", () => {
    expect(
      isInvoiceInfoComplete({
        ...base,
        billing_entity_type: "company",
        billing_tax_id: "1234567890",
        billing_tax_office: "Kadıköy",
      })
    ).toBe(true);
  });

  it("şirket + geçerli VKN ama vergi dairesi eksikse tamamlanmamış sayılır", () => {
    expect(
      isInvoiceInfoComplete({ ...base, billing_entity_type: "company", billing_tax_id: "1234567890", billing_tax_office: "" })
    ).toBe(false);
  });

  it("il/ilçe/adres/unvan alanlarından biri eksikse (entity_type geçerli olsa bile) tamamlanmamış sayılır", () => {
    expect(
      isInvoiceInfoComplete({ ...base, billing_entity_type: "individual", billing_tax_id: "12345678901", billing_city: "" })
    ).toBe(false);
  });

  it("geçersiz/boş entity_type için tamamlanmamış sayılır", () => {
    expect(isInvoiceInfoComplete({ ...base, billing_entity_type: null })).toBe(false);
    expect(isInvoiceInfoComplete({ ...base, billing_entity_type: "garbage", billing_tax_id: "12345678901" })).toBe(false);
  });
});
