import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { getAppSettings } from "@/lib/settings";
import { hasPermission } from "@/lib/permissions";
import { isValidPaymentType, flatPaymentOptions } from "@/lib/paymentTypes";
import { syncOrderLedgerBatch, LedgerCustomerRequiredError } from "@/lib/customerLedger";

const MAX_LINES = 500;

// Sipariş Listesi'ndeki toplu seçim ile birden fazla satırın (order_services)
// Ödeme Şekli'ni tek seferde değiştirir — ör. bir müşterinin "Cari" olarak
// girilmiş 10-15 siparişini toplu olarak "Fatura Edildi."ye çekmek.
//
// "Ödeme Al & Kapat" ile kapatılan HER sipariş order_payments'a en az bir satır
// yazar (bkz. PATCH /api/orders/[id]) — tek bir ödeme tipiyle kapatılmış olması
// (ki gerçek verinin ezici çoğunluğu budur) bunu "parçalı ödeme" yapmaz. Gerçekten
// birden fazla FARKLI ödeme tipine bölünmüş (ör. 7.000 POS + 15.000 Garanti Hesap,
// bkz. mixed_orders CTE) siparişler hariç, sipariş satırları güncellendikten sonra
// TÜMÜYLE tekdüze yeni tipte kalan siparişlerin order_payments'ı da aynı tipe
// çekilir — aksi halde sipariş özeti değişirken gerçek ödeme kaydı eski tipte
// kalıp birbirleriyle çelişirdi. Kısmi seçim yüzünden "Karışık" kalan siparişlerin
// order_payments'ına dokunulmaz (bkz. uniformOrderIds). Gerçekten karma olanlar bu
// işlemin dışında bırakılır; onlar PUT /api/orders/[id] (Düzelt ekranı) üzerinden,
// ödeme kırılımı elle gözden geçirilerek değiştirilmeli. Bu tanım GET /api/orders'daki
// has_split_payment ile birebir aynı olmalı (bkz. src/app/api/orders/route.ts) —
// aksi halde liste ekranındaki devre dışı checkbox'lar burasıyla tutarsız olur.
export async function PATCH(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "orders.edit")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const body = await request.json();
    const lineIds = Array.isArray(body.line_ids)
      ? Array.from(new Set(body.line_ids.map(Number).filter((n: number) => Number.isInteger(n))))
      : [];
    const paymentType = String(body.payment_type ?? "");

    if (lineIds.length === 0) {
      return NextResponse.json({ error: "En az bir satır seçilmelidir." }, { status: 400 });
    }
    if (lineIds.length > MAX_LINES) {
      return NextResponse.json({ error: `Tek seferde en fazla ${MAX_LINES} satır güncellenebilir.` }, { status: 400 });
    }

    const { payment_types } = await getAppSettings(user.tenantId!);
    if (!paymentType || !isValidPaymentType(paymentType, flatPaymentOptions(payment_types))) {
      return NextResponse.json({ error: "Geçersiz ödeme tipi." }, { status: 400 });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // tenant_id koşulu, client'tan gelen id'lerle başka bir firmanın
      // satırlarına dokunulmasını engeller. mixed_orders: seçilen satırların
      // ait olduğu siparişlerden, order_payments'ta gerçekten BİRDEN FAZLA
      // FARKLI ödeme tipi kayıtlı olanlar — bunlar güncellemenin dışında
      // bırakılır (yukarıdaki dosya yorumuna bkz.).
      // kasa_id de NULL'a çekilir — bu toplu işlem hangi kasadan/kasaya
      // olduğunu hiç bilmez (bkz. src/lib/kasalar.ts: "kasa_id sadece
      // Nakit'te anlamlıdır"), aksi halde ör. Nakit'ten POS'a toplu
      // çevrilen bir satır eski kasa_id'yi taşımaya devam eder ve sonradan
      // tekrar Nakit'e çevrilince o kasaya sessizce yeniden atanmış olurdu.
      const updated = await client.query<{ order_id: number }>(
        `WITH mixed_orders AS (
           SELECT op.order_id
           FROM order_payments op
           WHERE op.tenant_id = $3
             AND op.order_id IN (
               SELECT DISTINCT order_id FROM order_services WHERE id = ANY($2) AND tenant_id = $3
             )
           GROUP BY op.order_id
           HAVING COUNT(DISTINCT op.payment_type) > 1
         )
         UPDATE order_services os SET payment_type = $1, kasa_id = NULL
         WHERE os.id = ANY($2) AND os.tenant_id = $3
           AND os.order_id NOT IN (SELECT order_id FROM mixed_orders)
         RETURNING os.order_id`,
        [paymentType, lineIds, user.tenantId]
      );

      const affectedOrderIds = Array.from(new Set(updated.rows.map((r) => r.order_id)));
      if (affectedOrderIds.length > 0) {
        // Sipariş seviyesindeki payment_type özet değeri (bkz. PUT /api/orders/[id]) —
        // seçilmeyen kardeş satırlar farklı bir ödeme tipinde kalmış olabileceğinden
        // (ör. çok satırlı bir siparişin sadece bir satırı seçilmişse) doğrudan yeni
        // değer atanmaz, tüm satırlar üzerinden aynı distinct-count mantığıyla
        // yeniden hesaplanır.
        const summaries = await client.query<{ order_id: number; summary: string | null }>(
          `SELECT order_id,
             CASE
               WHEN COUNT(payment_type) = 0 THEN NULL
               WHEN COUNT(DISTINCT payment_type) = 1 THEN MIN(payment_type)
               ELSE 'Karışık'
             END AS summary
           FROM order_services
           WHERE order_id = ANY($1) AND tenant_id = $2
           GROUP BY order_id`,
          [affectedOrderIds, user.tenantId]
        );

        // order_payments (gerçek ödeme kaydı) yalnızca siparişin TÜM satırları artık
        // tekdüze biçimde yeni tipteyse (summary === paymentType) güncellenir. Kısmi
        // seçim yüzünden sipariş "Karışık" kaldıysa dokunulmaz — aksi halde, mesela
        // 2 satırlı bir siparişin sadece 1 satırı seçilmişken order_payments'ı
        // tamamen yeni tipe çevirmek, hâlâ eski tipte kalan diğer satırın parasını
        // da yanlışlıkla yeni tipe aitmiş gibi gösterirdi.
        const uniformOrderIds = summaries.rows.filter((r) => r.summary === paymentType).map((r) => r.order_id);
        if (uniformOrderIds.length > 0) {
          await client.query(
            `UPDATE order_payments SET payment_type = $1, kasa_id = NULL WHERE order_id = ANY($2) AND tenant_id = $3`,
            [paymentType, uniformOrderIds, user.tenantId]
          );
        }

        // orders.payment_type, yukarıda zaten hesaplanmış summaries satırlarından
        // (VALUES ile) yazılır — aynı GROUP BY'ı ikinci kez çalıştırmaya gerek yok.
        const summaryValues = summaries.rows.map((_, i) => `($${i * 2 + 1}::int, $${i * 2 + 2}::text)`).join(", ");
        const summaryParams = summaries.rows.flatMap((r) => [r.order_id, r.summary]);
        await client.query(
          `UPDATE orders o SET payment_type = v.summary
           FROM (VALUES ${summaryValues}) AS v(order_id, summary)
           WHERE o.id = v.order_id AND o.tenant_id = $${summaryParams.length + 1}`,
          [...summaryParams, user.tenantId]
        );

        // Etkilenen her sipariş için Cari bakiyesi yeniden hesaplanır — bkz.
        // src/lib/customerLedger.ts. Satır bazında Cari'ye girilen/çıkarılan
        // tutar, siparişin geri kalanı "Karışık" kalsa bile bu sync'e yansır
        // (SIPARIS satırının SUM() mantığı satır uyumluluğundan bağımsızdır).
        const orderCustomers = await client.query<{ id: number; customer_name: string | null }>(
          `SELECT id, customer_name FROM orders WHERE id = ANY($1) AND tenant_id = $2`,
          [affectedOrderIds, user.tenantId]
        );
        const customerNameByOrderId = new Map(orderCustomers.rows.map((r) => [r.id, r.customer_name]));
        await syncOrderLedgerBatch(client, user.tenantId!, customerNameByOrderId, user.userId);
      }

      await client.query("COMMIT");
      const updatedCount = updated.rowCount ?? 0;
      return NextResponse.json({ success: true, updated: updatedCount, skipped: lineIds.length - updatedCount });
    } catch (err) {
      await client.query("ROLLBACK");
      if (err instanceof LedgerCustomerRequiredError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
