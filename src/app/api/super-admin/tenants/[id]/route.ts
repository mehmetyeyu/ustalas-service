import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { cancelSubscription } from "@/lib/iyzico";
import { TENANT_ID_TABLES_IN_DELETE_ORDER } from "@/lib/tenantDeletion";

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
// Silme sırası: src/lib/tenantDeletion.ts.
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
      const existing = await client.query<{ name: string; billing_subscription_ref: string | null; billing_cancel_at_period_end: boolean }>(
        "SELECT name, billing_subscription_ref, billing_cancel_at_period_end FROM tenants WHERE id = $1 AND is_platform = false FOR UPDATE",
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

      // Aktif bir aboneliği olan firma silinirse ve iyzico'daki abonelik
      // ayrıca iptal edilmezse, firma veritabanımızdan tamamen kalksa bile
      // iyzico müşterinin kartından tahsilata DEVAM EDER — var olmayan bir
      // hizmet için sonsuza kadar ücretlendirme riski (gerçek bir müşteri
      // güveni/itiraz sorunu). Bu yüzden silme, aboneliği iptal etmeden asla
      // devam etmez — iptal başarısız olursa TÜM işlem durdurulur (sessizce
      // devam etmek yerine). billing_cancel_at_period_end zaten true ise
      // (bkz. /api/billing/cancel'daki aynı kontrol) abonelik iyzico'da
      // zaten iptal edilmiş demektir, tekrar denemek gereksiz/hataya yol açar.
      const { billing_subscription_ref: subscriptionRef, billing_cancel_at_period_end: alreadyCancelled } = existing.rows[0];
      if (subscriptionRef && !alreadyCancelled) {
        try {
          await cancelSubscription(subscriptionRef);
        } catch (cancelError) {
          await client.query("ROLLBACK");
          console.error("Süper admin firma silme — iyzico aboneliği iptal edilemedi, silme durduruldu:", { tenantId: id, subscriptionRef, cancelError });
          return NextResponse.json(
            { error: "Bu firmanın aktif bir aboneliği var ve iyzico'da iptal edilemedi — firma silinmedi. Önce aboneliği manuel kontrol edin." },
            { status: 409 }
          );
        }
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
