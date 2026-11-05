import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { ADDON_LABELS, isAddon } from "@/lib/addons";
import { logBillingEvent } from "@/lib/billingEvents";

// Ücretli ek özelliği elle açar ("Hediye Et", source='grant' — ör. Ustalas)
// ya da geri alır (iade/fraud/elle). Satır silinmez: geri alınca revoked_at
// yazılır, kesilmiş faturalar görüntülenmeye devam eder (docs/e-fatura-
// tasarim.md §13). Hediye de kullanım kuralına tabidir — firma ücretli
// abone değilse (deneme süresi dahil) modül yine çalışmaz (src/lib/addons.ts).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user || user.role !== "super_admin") return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const { id } = await params;
    const tenantId = Number(id);
    const body = await request.json().catch(() => ({}));
    const { addon, action } = body as { addon?: unknown; action?: unknown };
    const note = String(body.note ?? "").trim().slice(0, 500) || null;
    if (!Number.isInteger(tenantId) || !isAddon(addon) || (action !== "grant" && action !== "revoke")) {
      return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
    }

    const tenant = await pool.query("SELECT 1 FROM tenants WHERE id = $1 AND is_platform = false", [tenantId]);
    if (tenant.rows.length === 0) return NextResponse.json({ error: "Firma bulunamadı." }, { status: 404 });

    if (action === "grant") {
      // Geri alınmış bir hak yeniden açılırsa hediye sayılır (yeni ödeme yok).
      const result = await pool.query(
        `INSERT INTO tenant_addons (tenant_id, addon, source, granted_by, note)
         VALUES ($1, $2, 'grant', $3, $4)
         ON CONFLICT (tenant_id, addon) DO UPDATE
           SET source = 'grant', granted_by = EXCLUDED.granted_by, note = EXCLUDED.note,
               revoked_at = NULL, created_at = NOW()
           WHERE tenant_addons.revoked_at IS NOT NULL
         RETURNING tenant_id`,
        [tenantId, addon, user.userId, note]
      );
      if (result.rowCount === 0) return NextResponse.json({ error: `${ADDON_LABELS[addon]} bu firmada zaten açık.` }, { status: 409 });
      await logBillingEvent(tenantId, `addon.${addon}.grant`, note ?? undefined);
    } else {
      const result = await pool.query(
        "UPDATE tenant_addons SET revoked_at = NOW(), note = COALESCE($3, note) WHERE tenant_id = $1 AND addon = $2 AND revoked_at IS NULL",
        [tenantId, addon, note]
      );
      if (result.rowCount === 0) return NextResponse.json({ error: `${ADDON_LABELS[addon]} bu firmada açık değil.` }, { status: 409 });
      await logBillingEvent(tenantId, `addon.${addon}.revoke`, note ?? undefined);
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
