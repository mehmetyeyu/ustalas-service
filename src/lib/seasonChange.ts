// Mevsim değişimi yardımcıları — tekli "Değişim Yap" (Depolama) ve kurumsal
// müşterideki toplu değişim (POST /api/customers/[id]/season-change) ortak.

// Değişimde araçtan çıkan lastiğin mevsimi için varsayım: depodakinin tersi.
// Dört Mevsim/boşsa tahmin yapılmaz (kullanıcı seçer).
export function oppositeMevsim(mevsim: string | null): string {
  if (mevsim === "Kışlık") return "Yazlık";
  if (mevsim === "Yazlık") return "Kışlık";
  return "";
}

export const MAX_BULK_SEASON_ITEMS = 100;

export interface SeasonChangeItem {
  storage_id: number;
  ebat: string | null;
  marka: string | null;
  model_name: string | null;
  mevsim: string | null;
  adet: number;
  dis_derinligi: string | null;
  custom_order_no: string | null;
}

export interface SeasonChangeInput {
  islem_tarihi: string;
  items: SeasonChangeItem[];
  order: { service_name: string; unit_price: number } | null;
}

export class SeasonChangeValidationError extends Error {}

function text(v: unknown, max: number): string | null {
  const s = String(v ?? "").trim().slice(0, max);
  return s || null;
}

// İstek gövdesini doğrular (istemciye güvenilmez). today: varsayılan işlem
// tarihi (YYYY-MM-DD, İstanbul).
export function parseSeasonChangeInput(body: unknown, today: string): SeasonChangeInput {
  if (!body || typeof body !== "object") throw new SeasonChangeValidationError("Geçersiz istek.");
  const b = body as Record<string, unknown>;
  const rawItems = Array.isArray(b.items) ? b.items : [];
  if (rawItems.length === 0) throw new SeasonChangeValidationError("En az bir araç seçin.");
  if (rawItems.length > MAX_BULK_SEASON_ITEMS) {
    throw new SeasonChangeValidationError(`Tek seferde en fazla ${MAX_BULK_SEASON_ITEMS} araç değiştirilebilir.`);
  }
  const islem = b.islem_tarihi == null || b.islem_tarihi === "" ? today : String(b.islem_tarihi);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(islem) || Number.isNaN(Date.parse(islem))) {
    throw new SeasonChangeValidationError("Geçersiz işlem tarihi.");
  }
  // Teslim tarihi olarak da yazılır — ileri tarih geçmişi bozar.
  if (islem > today) throw new SeasonChangeValidationError("İşlem tarihi bugünden sonra olamaz.");
  const seen = new Set<number>();
  const items = rawItems.map((raw) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    const id = Number(r.storage_id);
    if (!Number.isInteger(id) || id <= 0) throw new SeasonChangeValidationError("Geçersiz depo kaydı.");
    if (seen.has(id)) throw new SeasonChangeValidationError("Aynı depo kaydı iki kez seçilmiş.");
    seen.add(id);
    const adet = r.adet == null || r.adet === "" ? 4 : Number(r.adet);
    if (!Number.isInteger(adet) || adet < 1 || adet > 20) throw new SeasonChangeValidationError("Geçersiz adet.");
    return {
      storage_id: id,
      ebat: text(r.ebat, 50),
      marka: text(r.marka, 50),
      model_name: text(r.model_name, 100),
      mevsim: text(r.mevsim, 50),
      adet,
      dis_derinligi: text(r.dis_derinligi, 50),
      custom_order_no: text(r.custom_order_no, 50),
    };
  });
  let order: SeasonChangeInput["order"] = null;
  if (b.order != null) {
    const o = b.order as Record<string, unknown>;
    const serviceName = text(o.service_name, 100);
    const price = Number(o.unit_price);
    if (!serviceName) throw new SeasonChangeValidationError("Sipariş için hizmet seçin.");
    if (!Number.isFinite(price) || price < 0 || price > 10_000_000) throw new SeasonChangeValidationError("Geçersiz sipariş tutarı.");
    order = { service_name: serviceName, unit_price: Math.round(price * 100) / 100 };
  }
  return { islem_tarihi: islem, items, order };
}
