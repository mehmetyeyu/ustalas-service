// Fatura alıcısı doğrulaması (docs/e-fatura-tasarim.md §5.1, §12.5). Saf;
// hem fatura penceresi hem POST /api/invoices kullanır.
import { ANONYMOUS_TCKN, classifyTaxId, normalizeTaxId } from "../taxId";
import type { BuyerInfo } from "./provider";

export interface BuyerInput {
  name?: unknown;
  tax_number?: unknown;
  anonymous?: unknown;      // "TC vermek istemiyor" — yalnızca bireysel
  tax_office?: unknown;
  address?: unknown;
  city?: unknown;
  district?: unknown;
  email?: unknown;
  phone?: unknown;
}

const text = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max) || null;

// fallbackPlace: alıcının il/ilçesi boşsa firmanın kendi il/ilçesi (e-Arşiv'de
// nihai tüketicinin adresi çoğu zaman bilinmez).
export function validateBuyer(
  input: BuyerInput,
  fallbackPlace: { city: string | null; district: string | null }
): { ok: true; buyer: BuyerInfo } | { ok: false; error: string } {
  const name = text(input.name, 200);
  if (!name) return { ok: false, error: "Alıcı adı / unvanı zorunlu." };

  const anonymous = input.anonymous === true;
  const raw = normalizeTaxId(input.tax_number);
  let taxNumber: string;
  let isCompany: boolean;
  if (anonymous) {
    taxNumber = ANONYMOUS_TCKN;
    isCompany = false;
  } else {
    const kind = classifyTaxId(raw);
    if (!kind) {
      return { ok: false, error: raw ? "Vergi no / TC kimlik no geçerli değil." : "TC kimlik no (bireysel) ya da vergi no (kurumsal) zorunlu. Müşteri TC vermek istemiyorsa işaretleyin." };
    }
    taxNumber = raw;
    isCompany = kind === "vkn";
  }

  const taxOffice = text(input.tax_office, 100);
  const address = text(input.address, 500);
  const city = text(input.city, 50) ?? fallbackPlace.city;
  const district = text(input.district, 50) ?? fallbackPlace.district;
  if (isCompany) {
    if (!taxOffice) return { ok: false, error: "Kurumsal alıcıda vergi dairesi zorunlu." };
    if (!address) return { ok: false, error: "Kurumsal alıcıda adres zorunlu." };
  }
  if (!city || !district) return { ok: false, error: "Alıcının il ve ilçesi zorunlu." };

  const email = text(input.email, 150);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "E-posta adresi geçerli değil." };

  return { ok: true, buyer: { name, taxNumber, taxOffice, address, city, district, email, phone: text(input.phone, 20), isCompany } };
}
