import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { getAppSettings } from "@/lib/settings";
import { hasPermission } from "@/lib/permissions";
import { isValidPaymentType, flatPaymentOptions } from "@/lib/paymentTypes";

const MAX_LINES = 500;

// Sipariş Listesi'ndeki toplu seçim ile birden fazla satırın (order_services)
// Ödeme Şekli'ni tek seferde değiştirir — ör. bir müşterinin "Cari" olarak
// girilmiş 10-15 siparişini toplu olarak "Fatura Edildi."ye çekmek.
// "Ödeme Al & Kapat" ile parçalı ödeme girilmiş (order_payments'ta kaydı olan)
// siparişler bilinçli olarak dışarıda bırakılır — bu tabloda gerçek ödeme
// dağılımı (ör. 7.000 POS + 15.000 Garanti Hesap) tutulur ve toplu işlem
// bunu güncellemez; satır/sipariş özetini buradan değiştirmek gerçek ödeme
// kaydıyla çelişen yanlış bir görünüm yaratırdı. Bu siparişler PUT /api/orders/[id]
// (Düzelt ekranı) üzerinden, ödeme kırılımı da birlikte düzenlenerek değiştirilmeli.
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
      // satırlarına dokunulmasını engeller. NOT EXISTS ile order_payments'ta
      // kaydı olan siparişlerin satırları güncellemenin dışında bırakılır
      // (yukarıdaki dosya yorumuna bkz.).
      const updated = await client.query<{ order_id: number }>(
        `UPDATE order_services os SET payment_type = $1
         WHERE os.id = ANY($2) AND os.tenant_id = $3
           AND NOT EXISTS (
             SELECT 1 FROM order_payments op WHERE op.order_id = os.order_id AND op.tenant_id = os.tenant_id
           )
         RETURNING os.order_id`,
        [paymentType, lineIds, user.tenantId]
      );

      const affectedOrderIds = Array.from(new Set(updated.rows.map((r) => r.order_id)));
      if (affectedOrderIds.length > 0) {
        // Sipariş seviyesindeki payment_type özet değeri (bkz. PUT /api/orders/[id]) —
        // etkilenmeyen diğer satırlar farklı bir ödeme tipinde kalmış olabileceğinden
        // doğrudan yeni değer atanmaz, aynı distinct-count mantığıyla yeniden hesaplanır.
        await client.query(
          `UPDATE orders o SET payment_type = sub.summary
           FROM (
             SELECT order_id,
               CASE
                 WHEN COUNT(payment_type) = 0 THEN NULL
                 WHEN COUNT(DISTINCT payment_type) = 1 THEN MIN(payment_type)
                 ELSE 'Karışık'
               END AS summary
             FROM order_services
             WHERE order_id = ANY($1) AND tenant_id = $2
             GROUP BY order_id
           ) sub
           WHERE o.id = sub.order_id AND o.tenant_id = $2`,
          [affectedOrderIds, user.tenantId]
        );
      }

      await client.query("COMMIT");
      const updatedCount = updated.rowCount ?? 0;
      return NextResponse.json({ success: true, updated: updatedCount, skipped: lineIds.length - updatedCount });
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
