// Faturalandırma kilidi — tenants.is_active'ten KASITLI olarak ayrı bir
// mekanizma. is_active=false zaten "giriş bile yapılamaz" demek (bkz.
// src/lib/auth.ts, getAuthUserByToken). Faturalandırma kilidinde ise
// kullanıcının giriş yapıp /admin/billing'e ulaşıp kendi kendine tekrar
// abone olabilmesi gerekiyor — bu yüzden hesap is_active=true kalır,
// sadece middleware sayfa yönlendirmesini kısıtlar (bkz. src/middleware.ts).
export interface BillingTenant {
  billing_status: string | null;
  trial_ends_at: string | Date | null;
  // İptal edilmiş ama ödenmiş dönemi henüz bitmemiş abonelikler için —
  // bkz. /api/billing/cancel: iyzico'da hemen iptal edilir (bir daha
  // tahsilat yapılmaz) ama erişim billing_period_ends_at'e kadar sürer.
  billing_cancel_at_period_end?: boolean | null;
  billing_period_ends_at?: string | Date | null;
}

// 'exempt' (Süper Admin panelinden elle eklenen / eski manuel firmalar,
// bkz. src/lib/provisionTenant.ts) ve 'active' (iyzico'da geçerli abonelik)
// dışında her durum kilitli sayılır: 'trialing' ise deneme süresi geçmişse,
// 'past_due'/'canceled'/null ise koşulsuz. 'active' ama iptal edilmiş bir
// abonelik, ödenmiş dönem bitene kadar kilitlenmez (Netflix vb. SaaS
// standardı) — bkz. plan.
export function isBillingLocked(tenant: BillingTenant): boolean {
  if (tenant.billing_status === "exempt") return false;
  if (tenant.billing_status === "active") {
    if (tenant.billing_cancel_at_period_end && tenant.billing_period_ends_at) {
      return new Date(tenant.billing_period_ends_at).getTime() < Date.now();
    }
    return false;
  }
  if (tenant.billing_status === "trialing") {
    if (!tenant.trial_ends_at) return true;
    return new Date(tenant.trial_ends_at).getTime() < Date.now();
  }
  return true;
}

export function trialDaysLeft(trialEndsAt: string | Date | null): number {
  if (!trialEndsAt) return 0;
  const ms = new Date(trialEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

// Fatura bilgileri — VUK md. 231/5 (ilk tahsilattan itibaren 7 gün içinde
// e-Fatura/e-Arşiv kesme zorunluluğu) gereği checkout/switch-plan'dan ÖNCE
// tam olmaları gerekiyor (bkz. database/schema.sql tenants.billing_* notu).
// TEK doğruluk kaynağı burası — hem /api/billing/invoice-info (kaydetme),
// hem /api/billing/checkout ve switch-plan (ödeme öncesi zorunlu kontrol)
// aynı fonksiyonu kullanır.
export interface InvoiceInfo {
  billing_entity_type: string | null;
  billing_tax_id: string | null;
  billing_tax_office: string | null;
  billing_invoice_title: string | null;
  billing_city: string | null;
  billing_district: string | null;
  billing_address: string | null;
}

const TCKN_RE = /^\d{11}$/;
const VKN_RE = /^\d{10}$/;

export function isInvoiceInfoComplete(info: InvoiceInfo): boolean {
  if (
    !info.billing_entity_type ||
    !info.billing_invoice_title?.trim() ||
    !info.billing_city?.trim() ||
    !info.billing_district?.trim() ||
    !info.billing_address?.trim()
  ) {
    return false;
  }
  if (info.billing_entity_type === "individual") {
    return TCKN_RE.test(info.billing_tax_id ?? "");
  }
  if (info.billing_entity_type === "company") {
    return VKN_RE.test(info.billing_tax_id ?? "") && !!info.billing_tax_office?.trim();
  }
  return false;
}
