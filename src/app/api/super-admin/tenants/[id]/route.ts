import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

// Bir firmayı Aktif/Pasif yapar — bkz. src/lib/auth.ts (getAuthUserByToken)
// ve src/app/api/auth/login/route.ts: is_active=false olan bir firmanın
// TÜM kullanıcıları (mevcut oturumları dahil) anında erişimi kaybeder.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user || user.role !== "super_admin") return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const { id } = await params;
    const { is_active } = await request.json();
    if (typeof is_active !== "boolean") {
      return NextResponse.json({ error: "Geçersiz durum." }, { status: 400 });
    }

    // is_platform = false koşulu, dahili Platform kaydının bu uçtan
    // yanlışlıkla pasifleştirilmesini engeller (savunma amaçlı — panel zaten
    // bu kaydı hiç listelemiyor).
    const result = await pool.query(
      "UPDATE tenants SET is_active = $1 WHERE id = $2 AND is_platform = false",
      [is_active, id]
    );
    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Firma bulunamadı." }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}

// Bir firmayı ve TÜM verisini (sipariş, ürün, müşteri, Cari, Kasa, randevu,
// kullanıcı — her şey) KALICI olarak siler. Geri alınamaz — bkz. Süper Admin
// Paneli'ndeki "isim yazarak onayla" adımı (src/app/super-admin/page.tsx).
// Test firmalarını temizlemek için (Pasif Yap tersine çevrilebilir, bu değil).
//
// Silme sırası, database/schema.sql'deki tüm tenant_id/composite FK'ların
// RESTRICT (varsayılan) olduğu gerçek bağımlılık grafiğini takip eder —
// sıra yanlış olsa bile bir sonraki adım FK ihlaliyle başarısız olur ve TÜM
// transaction geri alınır (asla yarım/sessiz veri kalmaz), ama doğru sırayla
// tek seferde tamamlanması amaçlanır. orders/products'a CASCADE ile bağlı
// alt tablolar (order_services, order_payments, product_stock_entries)
// ayrıca silinmez — ebeveynleri silinince otomatik gider.
const TENANT_ID_TABLES_IN_DELETE_ORDER = [
  "push_subscriptions",
  "whatsapp_message_log",
  "appointments",
  "customer_ledger_entries",
  "cash_ledger_entries",
  "expenses",
  "recurring_expenses",
  "orders",
  "products",
  "kasalar",
  "currency_rates",
  "customers",
  "suppliers",
  "services",
  "storage",
  "app_settings",
  "users",
] as const;

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user || user.role !== "super_admin") return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const { id } = await params;
    const { confirmName } = await request.json();

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query<{ name: string }>(
        "SELECT name FROM tenants WHERE id = $1 AND is_platform = false FOR UPDATE",
        [id]
      );
      if (existing.rows.length === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Firma bulunamadı." }, { status: 404 });
      }
      if (String(confirmName ?? "").trim() !== existing.rows[0].name) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Firma adı eşleşmedi." }, { status: 400 });
      }

      for (const table of TENANT_ID_TABLES_IN_DELETE_ORDER) {
        await client.query(`DELETE FROM ${table} WHERE tenant_id = $1`, [id]);
      }
      await client.query("DELETE FROM tenants WHERE id = $1", [id]);

      await client.query("COMMIT");
      return NextResponse.json({ success: true });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
