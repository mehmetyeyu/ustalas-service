// Kurumsal müşteri alanları (bkz. database/schema.sql "Kurumsal müşteri ve
// filo araçları"). is_corporate gönderilmediyse null — çağıran mevcut değeri
// korur.
export function parseCorporateFields(body: Record<string, unknown>): {
  isCorporate: boolean | null;
  taxNo: string | null;
  contactName: string | null;
} {
  const text = (v: unknown, max: number) => {
    const s = String(v ?? "").trim().slice(0, max);
    return s || null;
  };
  return {
    isCorporate: typeof body.is_corporate === "boolean" ? body.is_corporate : null,
    taxNo: text(body.tax_no, 20),
    contactName: text(body.contact_name, 100),
  };
}

// Cari limiti (customers.credit_limit). Alan gönderilmediyse provided=false —
// çağıran mevcut değeri korur; boş/null limiti kaldırır.
export function parseCreditLimit(body: Record<string, unknown>):
  | { provided: false }
  | { provided: true; value: number | null }
  | { provided: true; error: string } {
  if (!("credit_limit" in body)) return { provided: false };
  const raw = body.credit_limit;
  if (raw === null || raw === "") return { provided: true, value: null };
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n > 9_999_999_999) {
    return { provided: true, error: "Cari limiti geçerli bir tutar olmalıdır." };
  }
  return { provided: true, value: Math.round(n * 100) / 100 };
}

// Limit aşımı: mevcut bakiye + bu işlemle eklenecek cari borç limiti geçiyor mu.
export function exceedsCreditLimit(limit: number | null, balance: number, amount: number): boolean {
  if (limit == null) return false;
  return balance + amount > limit + 0.005;
}

// Kurumsal indirim oranı (customers.discount_rate, %). Gönderilmediyse
// provided=false; boş/null/0 indirimi kaldırır.
export function parseDiscountRate(body: Record<string, unknown>):
  | { provided: false }
  | { provided: true; value: number | null }
  | { provided: true; error: string } {
  if (!("discount_rate" in body)) return { provided: false };
  const raw = body.discount_rate;
  if (raw === null || raw === "") return { provided: true, value: null };
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n >= 100) {
    return { provided: true, error: "İndirim oranı 0 ile 100 arasında olmalıdır." };
  }
  const value = Math.round(n * 100) / 100;
  return { provided: true, value: value === 0 ? null : value };
}

// İndirimli tutar (kuruşa yuvarlanır).
export function applyDiscount(amount: number, rate: number | null | undefined): number {
  if (!rate) return amount;
  return Math.round(amount * (100 - rate)) / 100;
}

// Formda yazılan müşteri adını dizindeki kayıtlı yazımına eşler. Cari kaydı
// müşteriyi TAM adla bulur (bkz. customerLedger.ts) — "test filo" yazılınca
// "Test Filo" yerine yeni bir müşteri açılıp borç oraya düşüyordu, oysa form
// (büyük/küçük harf duyarsız) kurumsal indirimi/alanları zaten göstermişti.
// Tam eşleşme varsa o; yoksa TEK bir harf-duyarsız eşleşme varsa onun yazımı;
// birden fazla aday ya da hiç yoksa yazılan değer olduğu gibi kalır.
export function canonicalCustomerName(input: string, names: readonly string[]): string {
  const trimmed = input.trim();
  if (!trimmed || names.includes(trimmed)) return trimmed;
  const key = trimmed.toLocaleLowerCase("tr-TR");
  const matches = names.filter((n) => n.toLocaleLowerCase("tr-TR") === key);
  return matches.length === 1 ? matches[0] : trimmed;
}
