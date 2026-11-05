// Ücretli ek özellikler (tenant_addons, bkz. docs/e-fatura-tasarim.md §13).
// Tek seferlik satın alınır ama yalnızca ÜCRETLİ abonelik sürdükçe (ya da
// exempt firmada) kullanılır. Deneme süresinde yoktur — kullanıcı kararı
// 2026-10-30: "ne zaman aylık veya yıllık abone olursa o zaman alabilsin".
// Süper Admin'in hediyesi (source='grant') de bu kurala tabidir. Saf
// fonksiyonlar; hem sunucu hem istemci (AuthContext) kullanır.
import { isBillingLocked, type BillingTenant } from "./billing";

export const ADDONS = ["einvoice"] as const;
export type Addon = (typeof ADDONS)[number];

export const ADDON_LABELS: Record<Addon, string> = {
  einvoice: "e-Fatura / e-Arşiv",
};

export function isAddon(v: unknown): v is Addon {
  return ADDONS.includes(v as Addon);
}

// Ücretli abonelik: 'active' (iptal edilmiş ama ödenmiş dönemi süren dahil)
// ya da 'exempt'. 'trialing' hiçbir zaman sayılmaz.
export function hasPaidSubscription(tenant: BillingTenant): boolean {
  if (tenant.billing_status === "exempt") return true;
  return tenant.billing_status === "active" && !isBillingLocked(tenant);
}

// ownedAddons: tenant_addons'tan revoked_at IS NULL satırların addon'ları.
export function hasAddon(tenant: BillingTenant, ownedAddons: readonly string[] | null | undefined, addon: Addon): boolean {
  return (ownedAddons ?? []).includes(addon) && hasPaidSubscription(tenant);
}

// Satın alma kartı/ucu için: yalnızca ücretli abonelikte ve henüz sahip
// değilken.
export function canPurchaseAddon(tenant: BillingTenant, ownedAddons: readonly string[] | null | undefined, addon: Addon): boolean {
  return hasPaidSubscription(tenant) && !(ownedAddons ?? []).includes(addon);
}
