import { StorageTiresValidationError } from "@/lib/storageTires";

// Depolama API girdileri — sütun sınırını aşan/bozuk değer veritabanı hatası
// (500) yerine anlaşılır 400 döner (StorageTiresValidationError).

const PG_INT_MAX = 2147483647;

// URL'deki kayıt no; geçersizse null (çağıran 404 döner).
export function parseStorageId(raw: string): number | null {
  if (!/^\d{1,10}$/.test(raw)) return null;
  const n = Number(raw);
  return n > 0 && n <= PG_INT_MAX ? n : null;
}

function text(v: unknown, label: string, max: number): string | null {
  if (v == null) return null;
  if (typeof v !== "string" && typeof v !== "number") throw new StorageTiresValidationError(`Geçersiz ${label}.`);
  const s = String(v);
  if (s.length > max) throw new StorageTiresValidationError(`${label} en fazla ${max} karakter olabilir.`);
  return s || null;
}

function date(v: unknown): string | null {
  if (v == null || v === "") return null;
  const day = typeof v === "string" ? v.slice(0, 10) : "";
  const d = new Date(`${day}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== day) {
    throw new StorageTiresValidationError("Geçersiz İşlem Tarihi.");
  }
  return day;
}

export interface StorageTextFields {
  depo_no: number | null;
  plate: string | null;
  customer_name: string | null;
  phone: string | null;
  mevsim: string | null;
  aciklama: string | null;
  islem_tarihi: string | null;
}

export function resolveStorageTextFields(body: Record<string, unknown>): StorageTextFields {
  let depo_no: number | null = null;
  if (body.depo_no != null && body.depo_no !== "") {
    depo_no = Number(body.depo_no);
    if (!Number.isInteger(depo_no) || depo_no <= 0 || depo_no > PG_INT_MAX) {
      throw new StorageTiresValidationError("Depo No pozitif bir tam sayı olmalı.");
    }
  }
  return {
    depo_no,
    plate: text(body.plate, "Plaka", 20),
    customer_name: text(body.customer_name, "Müşteri adı", 100),
    phone: text(body.phone, "Telefon", 30),
    mevsim: text(body.mevsim, "Mevsim", 30),
    aciklama: text(body.aciklama, "Açıklama", 1000),
    islem_tarihi: date(body.islem_tarihi),
  };
}
