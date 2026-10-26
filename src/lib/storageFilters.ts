import { escapeLike } from "./sqlSafety";

// Depolama listesinin filtreleri — liste (/api/storage) ve Excel'e dışa
// aktarma (/api/storage/export) aynı koşulları buradan kurar ki "Filtreliyi
// Dışa Aktar" ekrandaki listeyle asla farklı sonuç vermesin (bkz. Siparişler
// buildFilterParams). Sayfa da aynı query param adlarını kullanır.
export interface StorageFilters {
  search: string;
  delivered: boolean;
  // Genel Ayarlar'daki eşikten (storage_overdue_months) uzun süredir
  // bekleyenler — yalnızca aktif (teslim edilmemiş) kayıtlarda anlamlı.
  overdue: boolean;
  mevsim: string[];
  marka: string;
  ebat: string;
  model: string;
  dateFrom: string;
  dateTo: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseStorageFilters(sp: URLSearchParams): StorageFilters {
  const text = (k: string) => (sp.get(k) ?? "").trim();
  const date = (k: string) => (DATE_RE.test(text(k)) ? text(k) : "");
  const delivered = sp.get("delivered") === "true";
  return {
    search: text("search"),
    delivered,
    overdue: !delivered && sp.get("overdue") === "true",
    mevsim: sp.getAll("mevsim").map((m) => m.trim()).filter(Boolean),
    marka: text("marka"),
    ebat: text("ebat"),
    model: text("model"),
    dateFrom: date("dateFrom"),
    dateTo: date("dateTo"),
  };
}

// overdueMonths yalnızca f.overdue iken kullanılır (çağıran ayarı yalnızca o
// durumda okur). Dönen değerlerde $1 = tenantId.
export function buildStorageQuery(f: StorageFilters, tenantId: number, overdueMonths: number) {
  const conditions: string[] = ["tenant_id = $1"];
  const values: (string | number | string[])[] = [tenantId];
  const push = (v: string | number | string[]) => { values.push(v); return `$${values.length}`; };

  conditions.push(f.delivered ? "teslim_edildi = true" : "teslim_edildi = false");
  if (f.search) {
    const p = push(`%${escapeLike(f.search)}%`);
    conditions.push(`(plate ILIKE ${p} OR customer_name ILIKE ${p})`);
  }
  if (f.overdue) conditions.push(`islem_tarihi < NOW() - (${push(overdueMonths)} * INTERVAL '1 month')`);
  // Mevsim alanı formdaki çoklu seçimden virgülle birleşik gelebilir
  // ("Yazlık,Kışlık") — seçilenlerden herhangi biri geçiyorsa eşleşir.
  if (f.mevsim.length) {
    conditions.push(`EXISTS (SELECT 1 FROM unnest(string_to_array(mevsim, ',')) m WHERE btrim(m) = ANY(${push(f.mevsim)}::text[]))`);
  }
  if (f.marka) conditions.push(`marka ILIKE ${push(`%${escapeLike(f.marka)}%`)}`);
  if (f.ebat) conditions.push(`ebat ILIKE ${push(`%${escapeLike(f.ebat)}%`)}`);
  if (f.model) conditions.push(`model_name ILIKE ${push(`%${escapeLike(f.model)}%`)}`);
  if (f.dateFrom) conditions.push(`islem_tarihi >= ${push(f.dateFrom)}::date`);
  if (f.dateTo) conditions.push(`islem_tarihi <= ${push(f.dateTo)}::date`);

  return {
    where: " WHERE " + conditions.join(" AND "),
    values,
    // Bekleyenler süzülünce en uzun bekleyen en üstte (aranan şey o).
    orderBy: f.overdue ? " ORDER BY islem_tarihi ASC NULLS LAST, created_at ASC" : " ORDER BY created_at DESC",
  };
}
