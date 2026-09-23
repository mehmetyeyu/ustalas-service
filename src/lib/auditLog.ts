import pool from "@/lib/db";

export interface AuditLogEntry {
  id: number;
  username: string;
  action: string;
  table_name: string;
  record_id: number | null;
  detail: string | null;
  created_at: string;
}

// Sipariş/cari/kullanıcı gibi hassas kayıtlarda "kim, ne zaman değiştirdi"
// izini tutar. logBillingEvent ile aynı best-effort felsefe: bu loglama
// başarısız olursa (ör. geçici DB sorunu) asıl işlemi ASLA bloklamamalı, bu
// yüzden hata sadece console.error'a düşer, yeniden fırlatılmaz.
export async function logAudit(params: {
  tenantId: number;
  userId: number;
  username: string;
  action: string;
  tableName: string;
  recordId: number | null;
  detail?: string;
}): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO audit_log (tenant_id, user_id, username, action, table_name, record_id, detail)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [params.tenantId, params.userId, params.username, params.action, params.tableName, params.recordId, params.detail ?? null]
    );
  } catch (error) {
    console.error("audit_log kaydı başarısız:", { ...params, error });
  }
}

export async function getAuditLog(
  tenantId: number,
  { page, limit }: { page: number; limit: number }
): Promise<{ items: AuditLogEntry[]; total: number }> {
  const offset = (page - 1) * limit;
  const [itemsResult, countResult] = await Promise.all([
    pool.query<AuditLogEntry>(
      `SELECT id, username, action, table_name, record_id, detail, created_at
       FROM audit_log WHERE tenant_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT $2 OFFSET $3`,
      [tenantId, limit, offset]
    ),
    pool.query<{ total: number }>("SELECT COUNT(*)::int AS total FROM audit_log WHERE tenant_id = $1", [tenantId]),
  ]);
  return { items: itemsResult.rows, total: countResult.rows[0].total };
}
