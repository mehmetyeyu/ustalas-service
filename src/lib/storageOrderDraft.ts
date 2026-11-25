import { oppositeMevsim } from "@/lib/seasonChange";

// Siparişten "Depoya Al" — araçtan çıkan lastiğin depo formu için varsayımlar.
// Ekran ve sunucu ortak tipleri + saf hesap (storageOrderDraft.test.ts).

export interface OrderDraftLine {
  service_name: string;
  tracks_size: boolean;
  quantity: number;
  size_desc: string | null;
  // Satır bir stok partisine bağlıysa ürünün tipi/mevsimi.
  product_type: string | null;
  season: string | null;
}

export interface OrderTireDraft {
  adet: number;
  ebat: string;
  mevsim: string; // "" → tahmin yok, kullanıcı seçer
  aciklama: string;
}

// GET /api/storage/order-draft yanıtı.
export interface StorageOrderDraft extends OrderTireDraft {
  order_id: number;
  order_no: string;
  plate: string;
  customer_name: string | null;
  phone: string | null;
  // Bu siparişten zaten açılmış depo kaydı.
  existing: { depo_no: number | null; teslim_edildi: boolean } | null;
  // Aracın depodaki diğer lastikleri (tam kayıt — Değişim Yap için).
  active: {
    id: number; depo_no: number | null; adet: number | null; mevsim: string | null;
    marka: string | null; ebat: string | null; jantli: boolean; rft: boolean;
  }[];
}

const DEFAULT_ADET = 4;
const MAX_ADET = 20;

// Lastik satışı satırı mı? Ürün Tipi doluysa ona bakılır; boşsa (eski ürün ya
// da elle yazılmış satır) adı "jant" içermeyen ürün satışı hizmeti sayılır.
function isTireLine(l: OrderDraftLine): boolean {
  const lower = (s: string) => s.toLocaleLowerCase("tr-TR");
  if (l.product_type) return lower(l.product_type).includes("lastik");
  return l.tracks_size && !lower(l.service_name).includes("jant") && !lower(l.service_name).includes("aksesuar");
}

// Ürünlerdeki mevsim ("Yaz"/"Kış") → depodaki ("Yazlık"/"Kışlık").
function storageMevsim(season: string | null): string | null {
  const s = season?.trim().toLocaleLowerCase("tr-TR") ?? "";
  if (s.startsWith("kış")) return "Kışlık";
  if (s.startsWith("yaz")) return "Yazlık";
  return null;
}

// Adet = satılan lastik (yoksa 4); ebat ve mevsim yalnızca tüm satırlar aynıysa
// doldurulur — farklıysa yanlış varsayım yerine boş bırakılır.
export function buildTireDraft(lines: OrderDraftLine[], driverName: string | null): OrderTireDraft {
  const tires = lines.filter(isTireLine);
  const total = tires.reduce((sum, l) => sum + Math.max(0, Math.round(Number(l.quantity) || 0)), 0);
  const only = (values: (string | null)[]) => {
    const set = new Set(values);
    return set.size === 1 ? [...set][0] : null;
  };
  return {
    adet: total > 0 ? Math.min(total, MAX_ADET) : DEFAULT_ADET,
    ebat: only(tires.map((l) => l.size_desc?.trim() || null)) ?? "",
    mevsim: oppositeMevsim(only(tires.map((l) => storageMevsim(l.season)))),
    aciklama: driverName?.trim() ? `Aracı getiren: ${driverName.trim()}` : "",
  };
}
