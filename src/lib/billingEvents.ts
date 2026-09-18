import pool from "@/lib/db";

// Faturalandırma olaylarının (webhook başarı/başarısızlık, IFN reddi,
// repricing) Süper Admin panelinde görünür olması için (bkz. src/app/
// super-admin/page.tsx) — öncesinde bunlar sadece console.warn/error ile
// Vercel loglarına düşüyordu. Best-effort: bu loglama başarısız olursa
// (ör. geçici DB sorunu) ana faturalandırma akışını ASLA bloklamamalı,
// bu yüzden hata sadece console.error'a düşer, yeniden fırlatılmaz.
export async function logBillingEvent(tenantId: number | null, eventType: string, detail?: string): Promise<void> {
  try {
    await pool.query(
      "INSERT INTO billing_events (tenant_id, event_type, detail) VALUES ($1, $2, $3)",
      [tenantId, eventType, detail ?? null]
    );
  } catch (error) {
    console.error("billing_events kaydı başarısız:", { tenantId, eventType, error });
  }
}
