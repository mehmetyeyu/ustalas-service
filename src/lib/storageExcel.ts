import { normalizeHeader } from "@/lib/excelParsing";
import { parseWeekYear } from "@/lib/productsExcel";

// Depolama Excel'i — Şablon İndir, Dışa Aktar ve İçe Aktar AYNI sütun
// tanımını kullanır. Önceden içe aktarma sütunları SIRAYLA okuyordu, dışa
// aktarma ise İşlem Tarihi'ni araya koyduğundan dışa aktarılan dosya geri
// yüklenince Model'e tarih, Üretim'e model yazılıyordu. Artık başlık adına
// göre okunur: sütun sırası/eksik sütun sorun değildir (eski şablonlar da
// çalışır), tanınmayan sütunlar (ör. Lastik Detayı) yok sayılır.
export const STORAGE_EXCEL_COLUMNS: { header: string; key: string; width: number }[] = [
  { header: "Depo No", key: "depo_no", width: 8 },
  { header: "Plaka", key: "plate", width: 12 },
  { header: "Müşteri", key: "customer_name", width: 20 },
  { header: "Telefon", key: "phone", width: 14 },
  { header: "Ebat", key: "ebat", width: 12 },
  { header: "Marka", key: "marka", width: 14 },
  { header: "Diş Derinliği", key: "dis_derinligi", width: 12 },
  { header: "Adet", key: "adet", width: 6 },
  { header: "Mevsim", key: "mevsim", width: 12 },
  { header: "Açıklama", key: "aciklama", width: 30 },
  { header: "Model", key: "model_name", width: 20 },
  { header: "Üretim Haftası/Yılı", key: "production_week_year", width: 16 },
  { header: "Yük/Hız", key: "load_speed_index", width: 10 },
  { header: "İşlem Tarihi", key: "islem_tarihi", width: 14 },
  { header: "RFT", key: "rft", width: 7 },
  { header: "Jantlı", key: "jantli", width: 7 },
];

const HEADER_ALIASES: Record<string, string> = {
  "müşteri adı": "customer_name",
  "diş": "dis_derinligi",
  "model / ürün hattı": "model_name",
  "üretim haftası / yılı": "production_week_year",
  "üretim tarihi": "production_week_year",
  "dot": "production_week_year",
  "yük / hız": "load_speed_index",
  "tarih": "islem_tarihi",
};
const HEADER_MAP: Record<string, string> = {
  ...Object.fromEntries(STORAGE_EXCEL_COLUMNS.map((c) => [normalizeHeader(c.header), c.key])),
  ...HEADER_ALIASES,
};

export const STORAGE_MEVSIM_OPTIONS = ["Kışlık", "Yazlık", "Dört Mevsim"];

// Güncellenen kayıtta boş hücre mevcut değeri korur (bkz. storage/import).
export interface ParsedStorageRow {
  depo_no: number | null;
  plate: string;
  customer_name: string | null;
  phone: string | null;
  ebat: string | null;
  marka: string | null;
  dis_derinligi: string | null;
  adet: number | null; // null → yeni kayıtta 4, güncellemede değişmez
  mevsim: string | null;
  aciklama: string | null;
  model_name: string | null;
  production_week: number | null;
  production_year: number | null;
  load_speed_index: string | null;
  islem_tarihi: string | null; // YYYY-MM-DD; null → bugün (yeni) / değişmez (güncelleme)
  rft: boolean | null; // null → boş/"Kısmi": yeni kayıtta hayır, güncellemede değişmez
  jantli: boolean | null;
}

function text(v: unknown, max: number): string | null {
  if (v == null) return null;
  const s = (v instanceof Date ? v.toISOString().split("T")[0] : String(v)).trim().slice(0, max);
  return s || null;
}

// Formdaki seçeneklere eşlenir; yazım farkları ("kış", "KIŞLIK", "4 mevsim")
// kabul edilir. Formdaki gibi virgülle birden çok mevsim olabilir.
function parseMevsim(v: unknown): { value: string | null; error?: string } {
  const raw = text(v, 100);
  if (!raw) return { value: null };
  const out: string[] = [];
  for (const part of raw.split(",").map((p) => p.trim()).filter(Boolean)) {
    const k = part.toLocaleLowerCase("tr-TR").replace(/\s+/g, " ");
    const m = k.startsWith("kış") || k.startsWith("kis") ? "Kışlık"
      : k.startsWith("yaz") ? "Yazlık"
      : /^(dört|dort|4) ?mevsim/.test(k) ? "Dört Mevsim"
      : null;
    if (!m) return { value: null, error: `Mevsim "${part}" tanınmadı (Kışlık, Yazlık ya da Dört Mevsim olmalı).` };
    if (!out.includes(m)) out.push(m);
  }
  return { value: out.join(",") || null };
}

function parseFlag(v: unknown): { value: boolean | null; error?: string } {
  if (v == null || v === "") return { value: null };
  if (typeof v === "boolean") return { value: v };
  const k = String(v).trim().toLocaleLowerCase("tr-TR");
  if (!k || k === "kısmi" || k === "kismi") return { value: null };
  if (["evet", "e", "x", "✓", "var", "1", "true"].includes(k)) return { value: true };
  if (["hayır", "hayir", "h", "-", "yok", "0", "false"].includes(k)) return { value: false };
  return { value: null, error: `"${String(v).trim()}" Evet ya da Hayır olmalı.` };
}

const pad = (n: number) => String(n).padStart(2, "0");

// Excel seri tarihi, Date, "16.11.2026" (dışa aktarmanın biçimi), "16/11/2026"
// ya da "2026-11-16" kabul edilir.
function parseDate(v: unknown, today: string): { value: string | null; error?: string } {
  if (v == null || v === "") return { value: null };
  let y: number, m: number, d: number;
  if (v instanceof Date) {
    y = v.getFullYear(); m = v.getMonth() + 1; d = v.getDate();
  } else if (typeof v === "number") {
    const dt = new Date(Math.round((v - 25569) * 86400 * 1000));
    y = dt.getUTCFullYear(); m = dt.getUTCMonth() + 1; d = dt.getUTCDate();
  } else {
    const s = String(v).trim();
    const tr = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (tr) { d = +tr[1]; m = +tr[2]; y = +tr[3]; }
    else if (iso) { y = +iso[1]; m = +iso[2]; d = +iso[3]; }
    else return { value: null, error: `İşlem Tarihi "${s}" anlaşılamadı (ör. 16.11.2026).` };
  }
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d || y < 2000) {
    return { value: null, error: "Geçersiz İşlem Tarihi." };
  }
  const value = `${y}-${pad(m)}-${pad(d)}`;
  if (value > today) return { value: null, error: "İşlem Tarihi bugünden sonra olamaz." };
  return { value };
}

export class StorageImportError extends Error {}

// Başlık satırı + veri satırları (sheet_to_json header:1). Plakasız satırlar
// atlanır (skipped). Hatalı hücreler satır numarasıyla toplanır; tek bir hata
// bile varsa çağıran hiçbir satırı yazmaz (yarım içe aktarma olmaz).
export function parseStorageRows(rows: unknown[][], today: string): { rows: ParsedStorageRow[]; skipped: number; errors: string[] } {
  const header = (rows[0] ?? []) as unknown[];
  const col: Record<string, number> = {};
  header.forEach((h, i) => {
    const key = HEADER_MAP[normalizeHeader(h)];
    if (key && col[key] === undefined) col[key] = i;
  });
  if (col.plate === undefined) throw new StorageImportError('"Plaka" sütunu bulunamadı — Şablon İndir ile gelen başlıkları kullanın.');

  const parsed: ParsedStorageRow[] = [];
  const errors: string[] = [];
  let skipped = 0;
  rows.slice(1).forEach((row, idx) => {
    const r = row as unknown[];
    if (!r.some((c) => c !== null && c !== undefined && c !== "")) return;
    const line = idx + 2; // Excel satır numarası (1 = başlık)
    const get = (k: string) => (col[k] === undefined ? null : r[col[k]]);
    const plate = text(get("plate"), 20)?.toLocaleUpperCase("tr-TR") ?? null;
    if (!plate) { skipped++; return; }
    const rowErrors: string[] = [];

    const depoRaw = get("depo_no");
    let depo_no: number | null = null;
    if (depoRaw != null && depoRaw !== "") {
      const n = Number(depoRaw);
      if (Number.isInteger(n) && n > 0) depo_no = n;
      else rowErrors.push(`Depo No "${depoRaw}" pozitif bir tam sayı olmalı.`);
    }
    const adetRaw = get("adet");
    let adet: number | null = null;
    if (adetRaw != null && adetRaw !== "") {
      const n = Number(adetRaw);
      if (Number.isInteger(n) && n >= 1 && n <= 20) adet = n;
      else rowErrors.push(`Adet "${adetRaw}" 1-20 arası bir tam sayı olmalı.`);
    }
    const mevsim = parseMevsim(get("mevsim"));
    const islem = parseDate(get("islem_tarihi"), today);
    const rft = parseFlag(get("rft"));
    const jantli = parseFlag(get("jantli"));
    for (const e of [mevsim.error, islem.error, rft.error && `RFT ${rft.error}`, jantli.error && `Jantlı ${jantli.error}`]) {
      if (e) rowErrors.push(e);
    }
    const { week, year } = parseWeekYear(get("production_week_year"));

    if (rowErrors.length) { errors.push(`Satır ${line} (${plate}): ${rowErrors.join(" ")}`); return; }
    parsed.push({
      depo_no, plate,
      customer_name: text(get("customer_name"), 100),
      phone: text(get("phone"), 30),
      ebat: text(get("ebat"), 50),
      marka: text(get("marka"), 100),
      // Diş derinliği ("5-5-5-5") Excel'de bazen tarihe dönüşüyor — text() Date'i metne çevirir.
      dis_derinligi: text(get("dis_derinligi"), 50),
      adet,
      mevsim: mevsim.value,
      aciklama: text(get("aciklama"), 1000),
      model_name: text(get("model_name"), 80),
      production_week: week,
      production_year: year,
      load_speed_index: text(get("load_speed_index"), 20),
      islem_tarihi: islem.value,
      rft: rft.value,
      jantli: jantli.value,
    });
  });
  return { rows: parsed, skipped, errors };
}

// Dışa aktarma satırı (DB satırından). Lastik Detayı yalnızca dışa aktarmada.
export function formatIslemTarihi(d: Date | string | null): string {
  if (!d) return "";
  const dt = new Date(d);
  return `${pad(dt.getDate())}.${pad(dt.getMonth() + 1)}.${dt.getFullYear()}`;
}
