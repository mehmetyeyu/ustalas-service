import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

// Kasa (Nakit) Özeti — seçili aydan/aralıktan BAĞIMSIZ, kuruluştan bugüne tüm
// zamanların toplamı: fiziksel kasadaki nakit hiçbir ay sınırında sıfırlanmaz,
// o yüzden aylık rapor gibi tarih filtreli olması anlamsız (FB Lastik geri
// bildirimi: "2 aylık toplam nakiti göremiyorum" + "kasadan çıkan masrafları
// görmüyorum"). Gelir tarafı, aylık Ödeme Tipi Kırılımı'yla aynı
// order_payments/order_services ayrıştırma mantığını tarih filtresiz
// tekrarlar; gider tarafı expenses.payment_type='Nakit' olan tüm masrafların
// toplamıdır.
//
// PERFORMANS: bu değer year/month/periodRange/serviceRange'den TAMAMEN
// bağımsız olduğu hâlde önceden /api/reports'un Promise.all'ına dahildi —
// kullanıcı Raporlar sayfasında ay değiştirdiğinde, Dönemsel/Hizmet Dağılımı
// aralığını her değiştirdiğinde bu sınırsız (kuruluştan bugüne) UNION yeniden
// hesaplanıyordu. Ayrı bir endpoint'e taşındı, istemci bunu sadece mount'ta
// bir kez çağırır (bkz. reports/page.tsx).
//
// UYARI: bu order_payments/order_services Nakit ayrıştırma mantığı
// src/app/api/kasa/route.ts'te SATIR BAZINDA tekrar yazılıdır (Kasa sayfası
// aynı kaynağı toplam yerine tek tek listeler) — burada bir değişiklik
// yapılırsa orası da güncellenmeli, aksi halde Kasa sayfası ile bu özet kart
// sessizce birbirinden sapar.
export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "reports.view")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const result = await pool.query<{ income: number; expense: number }>(
      `SELECT
         (SELECT COALESCE(SUM(total), 0) FROM (
           SELECT op.amount AS total
           FROM order_payments op
           JOIN orders o ON o.id = op.order_id
           WHERE op.payment_type = 'Nakit' AND o.tenant_id = $1

           UNION ALL

           SELECT os.unit_price AS total
           FROM order_services os
           JOIN orders o ON os.order_id = o.id
           WHERE os.payment_type = 'Nakit'
             AND NOT EXISTS (SELECT 1 FROM order_payments op2 WHERE op2.order_id = o.id AND op2.tenant_id = o.tenant_id)
             AND o.tenant_id = $1

           UNION ALL

           -- Cari bakiyeden sonradan Nakit tahsil edilen tutarlar (bkz.
           -- src/lib/customerLedger.ts) — hiçbir siparişe bağlı olmadığından
           -- yukarıdaki iki kaynakta hiç görünmez, ama kasaya giren gerçek
           -- nakittir. Gelir raporlarına (tahakkuk esası) KASITLI olarak
           -- eklenmez, sadece bu Kasa özetine eklenir.
           SELECT cle.amount AS total
           FROM customer_ledger_entries cle
           WHERE cle.entry_type = 'MANUEL' AND cle.direction = -1
             AND cle.payment_type = 'Nakit' AND cle.tenant_id = $1

           UNION ALL

           -- Kasa sayfasındaki serbest manuel nakit girişleri (bkz.
           -- src/app/api/kasa/route.ts) — Para Girişi (direction=1).
           SELECT amount AS total FROM cash_ledger_entries
           WHERE tenant_id = $1 AND direction = 1
         ) combined)::float AS income,
         (SELECT COALESCE(SUM(total), 0) FROM (
           SELECT amount AS total FROM expenses WHERE payment_type = 'Nakit' AND tenant_id = $1

           UNION ALL

           -- Kasa sayfasındaki serbest manuel nakit çıkışları — Para
           -- Çıkışı (direction=-1).
           SELECT amount AS total FROM cash_ledger_entries
           WHERE tenant_id = $1 AND direction = -1
         ) combined2)::float AS expense`,
      [user.tenantId]
    );

    const income = result.rows[0]?.income ?? 0;
    const expense = result.rows[0]?.expense ?? 0;

    return NextResponse.json({ income, expense, balance: income - expense });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
