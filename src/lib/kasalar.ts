interface QueryClient {
  query<T = unknown>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export class InvalidKasaError extends Error {
  constructor() {
    super("Geçersiz kasa.");
    this.name = "InvalidKasaError";
  }
}

// Kasaları Yönet'teki Para Birimi seçicisinin hazır seçenekleri — liste
// büyürse (ör. GBP) buraya bir satır eklemek yeterli; şema/validasyon
// zaten serbest 3 harfli kod kabul ediyor (bkz. kasalar/route.ts), bu
// sadece UI'da tek tıkla seçilebilecek yaygın seçenekler.
export const CURRENCY_OPTIONS = ["TRY", "USD", "EUR", "GBP"];

// Bir para biriminin şu anki TL karşılığı — TL için her zaman 1, başka bir
// para birimi için tenant'ın Kasaları Yönet'ten girdiği (ya da hiç
// girmediği, o zaman null) güncel kur. Geçmiş işlemlerin kaydında hiç
// kullanılmaz, sadece CANLI gösterim/toplam için (bkz. GET /api/kasa).
export async function getRateToTry(
  client: QueryClient,
  tenantId: number,
  currency: string
): Promise<number | null> {
  if (currency === "TRY") return 1;
  const result = await client.query<{ rate_to_try: string }>(
    "SELECT rate_to_try FROM currency_rates WHERE tenant_id = $1 AND currency = $2",
    [tenantId, currency]
  );
  return result.rows[0] ? Number(result.rows[0].rate_to_try) : null;
}

// Sipariş/masraf/Cari/manuel kasa hareketi route'larının ortak kasa_id
// doğrulaması — kasa_id verilmemişse (null/undefined) hiçbir sorgu bile
// çalıştırmadan geçer (özellik hiç kullanılmayan firmalarda maliyetsiz).
export async function assertKasaBelongsToTenant(
  client: QueryClient,
  kasaId: unknown,
  tenantId: number
): Promise<void> {
  if (kasaId == null || kasaId === "") return;
  const id = Number(kasaId);
  if (!Number.isFinite(id)) throw new InvalidKasaError();
  const result = await client.query(
    "SELECT 1 FROM kasalar WHERE id = $1 AND tenant_id = $2",
    [id, tenantId]
  );
  if (result.rows.length === 0) throw new InvalidKasaError();
}

// "kasa_id sadece Nakit'te anlamlıdır" kuralının genişlemiş hali: Nakit ise
// istemcinin seçtiği kasa_id doğrulanıp kullanılır (mevcut davranış); başka
// bir ödeme tipiyse (ör. "Nazım Hesap"), o tipe Kasaları Yönet'ten BAĞLANMIŞ
// bir kasa var mı diye bakılır — varsa otomatik o kasanın id'si döner, yoksa
// null (bugünkü gibi kasasız kalır). İstemciden gelen kasa_id, Nakit
// DIŞINDA hiçbir zaman dikkate alınmaz — bağlantı tamamen otomatik/görünmez.
export async function resolveKasaId(
  client: QueryClient,
  tenantId: number,
  paymentType: string | null | undefined,
  clientKasaId: unknown
): Promise<number | null> {
  if (paymentType === "Nakit") {
    await assertKasaBelongsToTenant(client, clientKasaId, tenantId);
    return clientKasaId == null || clientKasaId === "" ? null : Number(clientKasaId);
  }
  if (!paymentType) return null;
  const result = await client.query<{ id: number }>(
    "SELECT id FROM kasalar WHERE tenant_id = $1 AND linked_payment_type = $2",
    [tenantId, paymentType]
  );
  return result.rows[0]?.id ?? null;
}

// kasa_id alanı bulunan tablolar — Kasalar Yönet'te bir kasanın bağlı ödeme
// tipi değiştiğinde/kaldırıldığında geçmiş kayıtları senkron tutmak için
// applyKasaLinkChange'in dolaştığı sabit liste (kullanıcıdan gelen içerik
// DEĞİL, dinamik SQL riski yok).
const KASA_ID_TABLES = [
  "order_services",
  "order_payments",
  "expenses",
  "recurring_expenses",
  "customer_ledger_entries",
] as const;

// Bir kasanın linked_payment_type'ı değiştiğinde (ilk kez bağlanır ya da
// sonradan Kasaları Yönet'ten değiştirilir/kaldırılır) geçmiş kayıtları
// senkron tutar: eski bağlı tipteki VE HÂLÂ bu kasaya ait kayıtların kasa_id'si
// NULL'a döner, yeni bağlı tipteki (henüz kasasız) kayıtlar bu kasaya
// bağlanır. oldLinkedType === newLinkedType ise hiçbir şey yapmaz.
export async function applyKasaLinkChange(
  client: QueryClient,
  tenantId: number,
  kasaId: number,
  oldLinkedType: string | null,
  newLinkedType: string | null
): Promise<void> {
  if (oldLinkedType === newLinkedType) return;
  if (oldLinkedType) {
    for (const table of KASA_ID_TABLES) {
      await client.query(
        `UPDATE ${table} SET kasa_id = NULL WHERE tenant_id = $1 AND payment_type = $2 AND kasa_id = $3`,
        [tenantId, oldLinkedType, kasaId]
      );
    }
  }
  if (newLinkedType) {
    for (const table of KASA_ID_TABLES) {
      await client.query(
        `UPDATE ${table} SET kasa_id = $1 WHERE tenant_id = $2 AND payment_type = $3 AND kasa_id IS NULL`,
        [kasaId, tenantId, newLinkedType]
      );
    }
  }
}
