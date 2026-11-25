import { normalizeHeader } from "@/lib/excelParsing";
import { normalizeTurkishPhone } from "@/lib/phone";
import { classifyTaxId } from "@/lib/taxId";
import { normalizeTrSearch } from "@/lib/trSearch";

// Müşteri listesi Excel'i — şablon ve içe aktarma aynı sütun tanımını
// kullanır; içe aktarma başlık adına göre okur (sütun sırası/eksik sütun
// sorun değil), tanınmayan sütunları yok sayar.
export const CUSTOMER_EXCEL_COLUMNS: { header: string; key: string; width: number }[] = [
  { header: "Müşteri Adı", key: "name", width: 28 },
  { header: "Telefon", key: "phone", width: 16 },
  { header: "Kurumsal", key: "is_corporate", width: 10 },
  { header: "Vergi No", key: "tax_no", width: 14 },
  { header: "Vergi Dairesi", key: "tax_office", width: 18 },
  { header: "Yetkili", key: "contact_name", width: 20 },
  { header: "E-posta", key: "email", width: 24 },
  { header: "Adres", key: "address", width: 36 },
  { header: "İl", key: "city", width: 14 },
  { header: "İlçe", key: "district", width: 14 },
];

// Şablondaki örnek satır silinmeden yüklenirse müşteri olarak açılmaz.
export const CUSTOMER_EXAMPLE_NAME = "Örnek Müşteri (bu satırı silin)";

const HEADER_ALIASES: Record<string, string> = {
  "müşteri": "name", "ad soyad": "name", "adı soyadı": "name", "müşteri adı soyadı": "name",
  "ünvan": "name", "unvan": "name", "firma adı": "name", "cari adı": "name", "cari ünvanı": "name",
  "tel": "phone", "gsm": "phone", "cep": "phone", "cep telefonu": "phone", "telefon no": "phone",
  "vkn": "tax_no", "tckn": "tax_no", "vergi numarası": "tax_no", "vkn/tckn": "tax_no", "vergi no / tc": "tax_no",
  "yetkili kişi": "contact_name", "yetkili adı": "contact_name",
  "eposta": "email", "e-mail": "email", "email": "email", "mail": "email",
  "şehir": "city",
};
const HEADER_MAP: Record<string, string> = {
  ...Object.fromEntries(CUSTOMER_EXCEL_COLUMNS.map((c) => [normalizeHeader(c.header), c.key])),
  ...HEADER_ALIASES,
};

// Boş hücre var olan müşteride hiçbir şeyi değiştirmez (bkz. customers/import).
export interface ParsedCustomerRow {
  name: string;
  phone: string | null;
  is_corporate: boolean;
  tax_no: string | null;
  tax_office: string | null;
  contact_name: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  district: string | null;
}

export class CustomerImportError extends Error {}

// Aynı müşteri farklı yazımla ikinci kez açılmasın: büyük/küçük harf (İ/I/ı/i
// dahil) ve fazla boşluk göz ardı edilir.
export function customerNameKey(name: string): string {
  return normalizeTrSearch(name.trim().replace(/\s+/g, " "));
}

// Hücre → tek satır metin. Kontrol karakterleri (ör. NUL, PostgreSQL kabul
// etmez) ve hücre içi satır sonları boşluğa çevrilir.
function text(v: unknown): string | null {
  if (v == null) return null;
  // eslint-disable-next-line no-control-regex
  const s = String(v).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return s || null;
}

function parseCorporate(v: unknown): { value: boolean; error?: string } {
  if (typeof v === "boolean") return { value: v };
  const raw = text(v);
  if (!raw) return { value: false };
  const k = raw.toLocaleLowerCase("tr-TR");
  if (["evet", "e", "x", "✓", "1", "true", "kurumsal", "firma"].includes(k)) return { value: true };
  if (["hayır", "hayir", "h", "-", "0", "false", "bireysel", "perakende"].includes(k)) return { value: false };
  return { value: false, error: `Kurumsal "${raw}" Evet ya da Hayır olmalı.` };
}

// Excel numarayı sayı tuttuysa baştaki sıfır düşer (VKN 9 hane kalır).
function parseTaxNo(v: unknown): { value: string | null; error?: string } {
  let raw = text(v)?.replace(/[\s.-]/g, "") ?? null;
  if (!raw) return { value: null };
  if (typeof v === "number" && raw.length === 9) raw = `0${raw}`;
  if (!classifyTaxId(raw)) return { value: null, error: `Vergi No "${raw}" geçerli bir VKN (10 hane) ya da TC kimlik no (11 hane) değil.` };
  return { value: raw };
}

const MAX: Record<"name" | "phone" | "tax_office" | "contact_name" | "email" | "address" | "city" | "district", [number, string]> = {
  name: [100, "Müşteri Adı"], phone: [20, "Telefon"], tax_office: [100, "Vergi Dairesi"], contact_name: [100, "Yetkili"],
  email: [150, "E-posta"], address: [500, "Adres"], city: [50, "İl"], district: [50, "İlçe"],
};

// Başlık satırı + veri satırları (sheet_to_json header:1). Adı olmayan satır
// atlanır. Tek bir hatalı hücre bile varsa çağıran hiçbir satırı yazmaz.
// Aynı ad dosyada birden çok kez geçerse tek müşteride birleşir (ilk dolu değer).
export function parseCustomerRows(rows: unknown[][]): { rows: ParsedCustomerRow[]; skipped: number; errors: string[] } {
  const col: Record<string, number> = {};
  ((rows[0] ?? []) as unknown[]).forEach((h, i) => {
    const key = HEADER_MAP[normalizeHeader(h)];
    if (key && col[key] === undefined) col[key] = i;
  });
  if (col.name === undefined) throw new CustomerImportError('"Müşteri Adı" sütunu bulunamadı — Şablon İndir ile gelen başlıkları kullanın.');

  const byKey = new Map<string, ParsedCustomerRow>();
  const errors: string[] = [];
  const exampleKey = customerNameKey(CUSTOMER_EXAMPLE_NAME);
  let skipped = 0;
  rows.slice(1).forEach((r, idx) => {
    if (!r.some((c) => c !== null && c !== undefined && c !== "")) return;
    const line = idx + 2; // Excel satır numarası (1 = başlık)
    const get = (k: string) => (col[k] === undefined ? null : r[col[k]]);
    const name = text(get("name"));
    if (!name) { skipped++; return; }
    const key = customerNameKey(name);
    if (key === exampleKey) return;

    const rawPhone = text(get("phone"));
    const corporate = parseCorporate(get("is_corporate"));
    const tax = parseTaxNo(get("tax_no"));
    const row: ParsedCustomerRow = {
      name,
      phone: rawPhone ? normalizeTurkishPhone(rawPhone) ?? rawPhone : null,
      is_corporate: corporate.value,
      tax_no: tax.value,
      tax_office: text(get("tax_office")),
      contact_name: text(get("contact_name")),
      email: text(get("email")),
      address: text(get("address")),
      city: text(get("city")),
      district: text(get("district")),
    };
    const rowErrors = [corporate.error, tax.error].filter((e): e is string => !!e);
    for (const [k, [max, label]] of Object.entries(MAX) as [keyof typeof MAX, [number, string]][]) {
      const v = row[k];
      if (v && v.length > max) rowErrors.push(`${label} en fazla ${max} karakter olabilir.`);
    }
    if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) rowErrors.push(`E-posta "${row.email}" geçerli değil.`);
    if (rowErrors.length) { errors.push(`Satır ${line} (${name.slice(0, 40)}): ${rowErrors.join(" ")}`); return; }

    const prev = byKey.get(key);
    if (!prev) { byKey.set(key, row); return; }
    byKey.set(key, {
      name: prev.name,
      phone: prev.phone ?? row.phone,
      is_corporate: prev.is_corporate || row.is_corporate,
      tax_no: prev.tax_no ?? row.tax_no,
      tax_office: prev.tax_office ?? row.tax_office,
      contact_name: prev.contact_name ?? row.contact_name,
      email: prev.email ?? row.email,
      address: prev.address ?? row.address,
      city: prev.city ?? row.city,
      district: prev.district ?? row.district,
    });
  });
  return { rows: [...byKey.values()], skipped, errors };
}

// Dosyadaki adları var olan müşterilere eşler. Tam yazım eşleşmesi önceliklidir;
// yoksa harf-duyarsız TEK aday. Birden çok aday varsa hangisi olduğu belirsizdir
// (ambiguous) — ne yeni kayıt açılır ne de biri değiştirilir.
export function matchCustomers(rows: ParsedCustomerRow[], existing: { id: number; name: string }[]): {
  toInsert: ParsedCustomerRow[];
  toUpdate: (ParsedCustomerRow & { id: number })[];
  ambiguous: number;
} {
  const exact = new Map(existing.map((e) => [e.name, e.id]));
  const loose = new Map<string, number[]>();
  for (const e of existing) {
    const k = customerNameKey(e.name);
    const list = loose.get(k);
    if (list) list.push(e.id);
    else loose.set(k, [e.id]);
  }
  const toInsert: ParsedCustomerRow[] = [];
  const toUpdate: (ParsedCustomerRow & { id: number })[] = [];
  let ambiguous = 0;
  for (const r of rows) {
    const candidates = loose.get(customerNameKey(r.name)) ?? [];
    const id = exact.get(r.name) ?? (candidates.length === 1 ? candidates[0] : undefined);
    if (id !== undefined) toUpdate.push({ ...r, id });
    else if (candidates.length > 1) ambiguous++;
    else toInsert.push(r);
  }
  return { toInsert, toUpdate, ambiguous };
}
