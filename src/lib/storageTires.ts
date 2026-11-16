// Depolama — lastiklerin konuma göre farklı olabilmesi (müşteri isteği:
// ön/arka ebatı-markası farklı araçlar, uç durumda dört lastiğin dördü de
// farklı). storage.lastikler NULL ise klasik "hepsi aynı" kayıttır: tek
// ebat/marka/model/diş/adet ana kolonlarda durur. Doluysa her konumun kendi
// bilgisi bu dizidedir ve ana kolonlar bu diziden üretilen bir ÖZETtir —
// liste, arama/filtre (ILIKE), Excel dışa aktarma, araç sayfası ve toplu
// mevsim değişimi ana kolonları okumaya devam eder, hiçbiri kırılmaz.
// İstemci (Depolama formu, etiket) ve sunucu (storage route'ları) ortak.

export type StorageTireLayout = "ayni" | "aks" | "tek";

export const STORAGE_TIRE_LAYOUTS: { value: StorageTireLayout; label: string }[] = [
  { value: "ayni", label: "Hepsi aynı" },
  { value: "aks", label: "Ön / Arka farklı" },
  { value: "tek", label: "Her lastik farklı" },
];

// Her düzenin konumları ve konum başına adet (aks: aks başına 2 lastik).
export const STORAGE_TIRE_POSITIONS: Record<Exclude<StorageTireLayout, "ayni">, { konum: string; adet: number }[]> = {
  aks: [{ konum: "Ön", adet: 2 }, { konum: "Arka", adet: 2 }],
  tek: [
    { konum: "Ön Sol", adet: 1 }, { konum: "Ön Sağ", adet: 1 },
    { konum: "Arka Sol", adet: 1 }, { konum: "Arka Sağ", adet: 1 },
  ],
};

export interface StorageTire {
  konum: string;
  adet: number;
  ebat: string | null;
  marka: string | null;
  model_name: string | null;
  dis_derinligi: string | null;
  production_week: number | null;
  production_year: number | null;
  load_speed_index: string | null;
  // Konum başına: karışık sette (ör. patlayan tek lastiğin yerine normal
  // lastik) bir kısmı RFT olabilir. storage.rft = en az biri RFT.
  rft: boolean;
}

export function layoutOf(tires: StorageTire[] | null | undefined): StorageTireLayout {
  if (!tires || tires.length === 0) return "ayni";
  return tires.length === STORAGE_TIRE_POSITIONS.aks.length ? "aks" : "tek";
}

export class StorageTiresValidationError extends Error {}

function text(v: unknown, max: number): string | null {
  const s = String(v ?? "").trim().slice(0, max);
  return s || null;
}

function int(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

// İstek gövdesindeki lastikler alanını doğrular (istemciye güvenilmez).
// Konum listesi düzenlerden birine birebir uymalı; adetler düzenden gelir.
// normalizeYear: 2 haneli yılı 4 haneye çevirir (productsExcel'deki).
export function parseStorageTires(raw: unknown, normalizeYear: (y: number) => number): StorageTire[] | null {
  if (raw == null) return null;
  if (!Array.isArray(raw)) throw new StorageTiresValidationError("Geçersiz lastik bilgisi.");
  const layout = (["aks", "tek"] as const).find((l) =>
    STORAGE_TIRE_POSITIONS[l].length === raw.length &&
    STORAGE_TIRE_POSITIONS[l].every((p, i) => (raw[i] as { konum?: unknown } | null)?.konum === p.konum)
  );
  if (!layout) throw new StorageTiresValidationError("Geçersiz lastik konumları.");
  return raw.map((r: Record<string, unknown>, i) => {
    const week = int(r.production_week);
    const year = int(r.production_year);
    return {
      konum: STORAGE_TIRE_POSITIONS[layout][i].konum,
      adet: STORAGE_TIRE_POSITIONS[layout][i].adet,
      ebat: text(r.ebat, 50),
      marka: text(r.marka, 100),
      model_name: text(r.model_name, 80),
      dis_derinligi: text(r.dis_derinligi, 50),
      production_week: week != null && week >= 1 && week <= 53 ? week : null,
      production_year: year ? normalizeYear(year) : null,
      load_speed_index: text(r.load_speed_index, 20),
      rft: r.rft === true,
    };
  });
}

const SEP = " · ";

// Ana kolonlara yazılacak özet. Aynı değer tekrar etmez (ön/arka markası aynı
// ama ebat farklıysa Marka tek kalır); Diş Derinliği konumla birlikte yazılır
// (hangi değerin hangi lastiğe ait olduğu kaybolmasın). Üretim tarihi en
// ESKİ lastiğinki — depoda yaş kontrolü (DOT) en eskiye göre yapılır.
export function summarizeStorageTires(tires: StorageTire[]) {
  const distinct = (vals: (string | null)[], max: number) => {
    const s = [...new Set(vals.filter((v): v is string => !!v))].join(SEP);
    return s ? s.slice(0, max) : null;
  };
  const dis = tires.filter((t) => t.dis_derinligi).map((t) => `${t.konum} ${t.dis_derinligi}`).join(SEP);
  const dated = tires
    .filter((t) => t.production_year != null)
    .sort((a, b) => (a.production_year! - b.production_year!) || ((a.production_week ?? 0) - (b.production_week ?? 0)));
  return {
    ebat: distinct(tires.map((t) => t.ebat), 50),
    marka: distinct(tires.map((t) => t.marka), 100),
    model_name: distinct(tires.map((t) => t.model_name), 80),
    dis_derinligi: dis ? dis.slice(0, 50) : null,
    adet: tires.reduce((s, t) => s + t.adet, 0),
    production_week: dated[0]?.production_week ?? null,
    production_year: dated[0]?.production_year ?? null,
    load_speed_index: distinct(tires.map((t) => t.load_speed_index), 20),
  };
}

// "RFT" rozeti: hepsi aynı kayıtta işaret; farklı lastiklerde hepsi RFT ise
// "RFT", bir kısmıysa "RFT (kısmi)", hiçbiri değilse null.
export function rftLabel(item: { rft: boolean; lastikler: StorageTire[] | null }): string | null {
  if (!item.lastikler) return item.rft ? "RFT" : null;
  const n = item.lastikler.filter((t) => t.rft).length;
  return n === 0 ? null : n === item.lastikler.length ? "RFT" : "RFT (kısmi)";
}

// Etiket/araç sayfası gibi yerlerde tek satırlık konum açıklaması.
export function describeStorageTire(t: StorageTire): string {
  return [t.marka, t.model_name, t.ebat, t.load_speed_index, t.rft ? "RFT" : null, t.dis_derinligi ? `Diş ${t.dis_derinligi}` : null]
    .filter(Boolean).join(" ") || "—";
}

// Storage POST/PATCH/değişim gövdesinden lastik kolonlarını çıkarır: lastikler
// doluysa ana kolonlar özetten, değilse (hepsi aynı) gövdenin kendisinden.
// lastikler pg'ye JSON metni olarak verilir (dizi parametresi Postgres
// array'ine çevrilmesin diye).
export function resolveStorageTireColumns(body: Record<string, unknown>, normalizeYear: (y: number) => number) {
  const tires = parseStorageTires(body.lastikler, normalizeYear);
  const flags = { rft: body.rft === true, jantli: body.jantli === true };
  if (tires) return { ...summarizeStorageTires(tires), lastikler: JSON.stringify(tires), ...flags, rft: tires.some((t) => t.rft) };
  const year = body.production_year ? normalizeYear(Number(body.production_year)) : null;
  return {
    ebat: (body.ebat as string) || null,
    marka: (body.marka as string) || null,
    model_name: (body.model_name as string) || null,
    dis_derinligi: (body.dis_derinligi as string) || null,
    adet: Number(body.adet) || 4,
    production_week: (body.production_week as number) || null,
    production_year: year,
    load_speed_index: (body.load_speed_index as string) || null,
    lastikler: null,
    ...flags,
  };
}
