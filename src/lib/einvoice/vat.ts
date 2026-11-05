// Fatura KDV oranları. Sipariş tutarları her zaman KDV dahildir; oran
// hizmet bazında (services.vat_rate) ya da bağlantının varsayılanıyla
// (einvoice_connections.default_vat_rate, %20 — kullanıcı kararı
// 2026-10-30) belirlenir.
import { VAT_RATES, isVatRate } from "../quotes";

export { VAT_RATES };
export const DEFAULT_INVOICE_VAT_RATE = 20;

// services.vat_rate gövdede gönderilmediyse provided=false (mevcut değer
// korunur); null/"" = varsayılanı kullan.
export function parseServiceVatRate(body: Record<string, unknown>):
  | { provided: false }
  | { provided: true; value: number | null }
  | { provided: true; error: string } {
  if (!("vat_rate" in body)) return { provided: false };
  const raw = body.vat_rate;
  if (raw === null || raw === "") return { provided: true, value: null };
  const n = Number(raw);
  return isVatRate(n) ? { provided: true, value: n } : { provided: true, error: "KDV oranı %20, %10, %1 ya da %0 olmalı." };
}

export function effectiveVatRate(serviceVatRate: number | null | undefined, defaultRate: number = DEFAULT_INVOICE_VAT_RATE): number {
  return serviceVatRate ?? defaultRate;
}
