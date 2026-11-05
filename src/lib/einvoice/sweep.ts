// Günlük e-Fatura bakımı (/api/cron/einvoice, vercel.json):
//
// 1. Bağlantı tazeleme — Paraşüt refresh token'ı kullanılmazsa ölür (belge 30
//    gün diyor, staging ~31 saat verdi; her yenileme süreyi uzatıyor). Hiç
//    fatura kesmeyen firmanın bağlantısı bu yüzden her gün bir kez yenilenir.
//    Reddedilirse getAccessToken bağlantıyı 'reauth'a düşürür → Ayarlar'da
//    "Yeniden Bağlan".
// 2. Takılı fatura süpürme — ekran kapatılınca (yoklama durunca) yarıda kalan
//    HAZIRLANIYOR/ISLENIYOR faturalar ilerletilir. HATA'dakilere dokunulmaz:
//    onları kullanıcı "Tekrar Dene" ile kararını vererek sürdürür.
//
// e-Fatura red takibi (response_type) şimdilik yok: motor e-Faturayı TEMEL
// senaryoyla keser, alıcı reddedemez (tasarım §7).
import pool from "../db";
import { advanceInvoice } from "./engine";
import { getAccessToken } from "./parasutAuth";

// Bir faturaya ekran yoklaması sürerken dokunulmasın.
const STALE_MINUTES = 10;
// Sonsuz denemeye karşı: bu kadar denenmiş fatura süpürülmez.
const MAX_ATTEMPTS = 5;
const MAX_INVOICES = 50;

export interface SweepResult {
  refreshed: number;
  refreshFailed: number;
  advanced: number;
  stillPending: number;
  failed: number;
  stoppedEarly: boolean;
}

export async function runEInvoiceSweep(deadline: number): Promise<SweepResult> {
  const result: SweepResult = { refreshed: 0, refreshFailed: 0, advanced: 0, stillPending: 0, failed: 0, stoppedEarly: false };

  const conns = await pool.query<{ tenant_id: number }>(
    "SELECT tenant_id FROM einvoice_connections WHERE provider = 'parasut' AND status = 'active' AND refresh_token_enc IS NOT NULL ORDER BY refresh_expires_at NULLS FIRST"
  );
  for (const c of conns.rows) {
    if (Date.now() > deadline) { result.stoppedEarly = true; return result; }
    try {
      await getAccessToken(c.tenant_id, { force: true });
      result.refreshed++;
    } catch (err) {
      result.refreshFailed++;
      console.error("e-Fatura bağlantı tazeleme başarısız", { tenantId: c.tenant_id, err: err instanceof Error ? err.message : err });
    }
  }

  const stuck = await pool.query<{ id: number; tenant_id: number }>(
    `SELECT i.id, i.tenant_id FROM invoices i
     JOIN einvoice_connections c ON c.tenant_id = i.tenant_id AND c.status = 'active'
     WHERE i.status IN ('HAZIRLANIYOR', 'ISLENIYOR') AND i.attempts < $1
       AND i.updated_at < NOW() - make_interval(mins => $2)
       AND (i.processing_until IS NULL OR i.processing_until < NOW())
     ORDER BY i.updated_at LIMIT $3`,
    [MAX_ATTEMPTS, STALE_MINUTES, MAX_INVOICES]
  );
  for (const inv of stuck.rows) {
    if (Date.now() > deadline) { result.stoppedEarly = true; break; }
    const after = await advanceInvoice(inv.tenant_id, inv.id);
    if (after?.status === "RESMILESTI") result.advanced++;
    else if (after?.status === "HATA") result.failed++;
    else result.stillPending++;
  }
  return result;
}
