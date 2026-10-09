import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "reports.view")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()));
  const month = parseInt(searchParams.get("month") || String(new Date().getMonth() + 1));

  // Türkiye sabit UTC+3 kullanır (2016'dan beri yaz saati yok), bu yüzden
  // istenen ayın Europe/Istanbul gece yarısı sınırları burada bir kez UTC
  // timestamp'e çevrilip WHERE'lerde düz aralık karşılaştırması (created_at
  // >= $1 AND created_at < $2) olarak kullanılır. Önceki hâl her satırda
  // EXTRACT(... AT TIME ZONE ...) hesaplıyordu — sargable olmadığından
  // orders_created_at_idx'i kullanamıyor, her istekte tam tarama yapıyordu.
  // AT TIME ZONE dönüşümü yalnızca günlük kırılımın tarih etiketi için kalır.
  const startDate = new Date(Date.UTC(year, month - 1, 1, -3, 0, 0));
  const endDate = new Date(Date.UTC(year, month, 1, -3, 0, 0));

  // Raporlar sayfasındaki "Dönemsel Ciro/Maliyet/Masraf/Kâr" ve "Hizmet Dağılımı"
  // widget'ları, üstteki Ay/Yıl seçiciden TAMAMEN BAĞIMSIZ, kendi tarih aralığını
  // seçebilir (kullanıcı isteği: ikisi de kendi Tarih/Günlük/Haftalık/Aylık
  // kontrolüne sahip). Bu yüzden iki AYRI, birbirinden bağımsız aralık kabul
  // edilir — periodFrom/To Dönemsel'i, serviceFrom/To Hizmet Dağılımı'nı besler.
  // İkisi de "to" dahil (inclusive) gönderilir, aşağıda +1 gün ile exclusive
  // üst sınıra çevrilir (istanbulMidnightUTC ile aynı desen).
  const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  function istanbulMidnightUTC(dateStr: string): Date {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d, -3, 0, 0));
  }
  function addDayUTC(d: Date): Date {
    return new Date(d.getTime() + 24 * 60 * 60 * 1000);
  }

  const periodFromRaw = searchParams.get("periodFrom");
  const periodToRaw = searchParams.get("periodTo");
  const hasPeriodRange = !!periodFromRaw && !!periodToRaw && ISO_DATE_RE.test(periodFromRaw) && ISO_DATE_RE.test(periodToRaw);
  const periodStart = hasPeriodRange ? istanbulMidnightUTC(periodFromRaw) : null;
  const periodEnd = hasPeriodRange ? addDayUTC(istanbulMidnightUTC(periodToRaw)) : null;

  const serviceFromRaw = searchParams.get("serviceFrom");
  const serviceToRaw = searchParams.get("serviceTo");
  const hasServiceRange = !!serviceFromRaw && !!serviceToRaw && ISO_DATE_RE.test(serviceFromRaw) && ISO_DATE_RE.test(serviceToRaw);
  const serviceStatsStart = hasServiceRange ? istanbulMidnightUTC(serviceFromRaw) : startDate;
  const serviceStatsEnd = hasServiceRange ? addDayUTC(istanbulMidnightUTC(serviceToRaw)) : endDate;

  // expenses.expense_date bir DATE kolonu (saat/saat dilimi yok) — timestamp
  // aralık dönüşümüne gerek yok, ayın ilk günü ile bir sonraki ayın ilk günü
  // arasındaki düz tarih string aralığı yeterli.
  const expenseStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const expenseNextYear = month === 12 ? year + 1 : year;
  const expenseNextMonth = month === 12 ? 1 : month + 1;
  const expenseEnd = `${expenseNextYear}-${String(expenseNextMonth).padStart(2, "0")}-01`;

  // Dönemsel'in masraf toplamı da expense_date (DATE, saatsiz) üzerinden — periodTo
  // dahil olduğundan, karşılaştırma için bir sonraki günün tarih string'i gerekir
  // (yukarıdaki periodEnd/addDayUTC ile aynı mantık, ama DATE kolonu için timestamp
  // yerine düz string).
  function nextDateStr(dateStr: string): string {
    const [y, m, d] = dateStr.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + 1));
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
  }
  const periodExpenseEnd = hasPeriodRange ? nextDateStr(periodToRaw!) : null;

  try {
    // Rapor tarihi, ödemenin alındığı gün (payment_date) değil, hizmetin GİRİLDİĞİ
    // gündür (created_at) — bir hizmet Temmuz'da girilip parası Ağustos'ta alınsa
    // bile Temmuz cirosu/maliyeti olarak sayılır. Ciro (sipariş bazlı, indirim
    // dahil) ve Maliyet (işlem/satır bazlı) ayrı sorgularla toplanır — tek sorguda
    // JOIN edilirse sipariş çok satırlıysa ciro çoklanır (fan-out).
    // NOT: Tarih doğrudan metin (::text) olarak alınır. Postgres DATE değerini JS
    // Date nesnesine çevirip .toISOString() ile geri metne dökmek, sunucu UTC'nin
    // doğusundaki bir saat diliminde (Europe/Istanbul, UTC+3) çalışıyorsa günü bir
    // gün geriye kaydırıyordu (ör. bugünün verisi bir önceki günde görünüyordu).
    // Statüye bakılmaz (BEKLEMEDE dahil tüm siparişler sayılır) — stok zaten
    // statüden bağımsız düşüldüğü için rakamlar da statüden bağımsız yansır;
    // paid_amount BEKLEMEDE'de hep NULL olduğundan otomatik total_amount'a döner.
    //
    // Aşağıdaki 5 sorgu birbirinden bağımsızdır — sırayla değil Promise.all ile
    // paralel çalıştırılır (toplam gecikme 5 sorgunun toplamı değil en yavaşı kadar olur).
    // Kasa (Nakit) Özeti artık burada DEĞİL — ayrı bir endpoint'e taşındı
    // (bkz. /api/reports/cash-summary/route.ts yorumu): değeri year/month/
    // periodRange/serviceRange'den bağımsız (kuruluştan bugüne tüm zamanların
    // toplamı) olduğu hâlde önceden bu Promise.all'ın bir parçasıydı, yani
    // kullanıcı sadece ay değiştirse bile sınırsız UNION'ı yeniden hesaplardı.
    const [
      dailyCiroResult,
      dailyMaliyetResult,
      dailyExpenseResult,
      serviceStatsResult,
      summaryResult,
      paymentBreakdownResult,
      unaddedRecurringResult,
      periodSummaryResult,
    ] = await Promise.all([
      pool.query(
        `SELECT
           ((created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul')::date)::text AS date,
           SUM(COALESCE(paid_amount, total_amount))::float AS ciro
         FROM orders
         WHERE created_at >= $1 AND created_at < $2 AND tenant_id = $3
         GROUP BY date`,
        [startDate, endDate, user.tenantId]
      ),
      pool.query(
        `SELECT
           ((o.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul')::date)::text AS date,
           SUM(COALESCE(os.cost_price, 0))::float AS maliyet
         FROM order_services os
         JOIN orders o ON os.order_id = o.id
         WHERE o.created_at >= $1 AND o.created_at < $2 AND o.tenant_id = $3
         GROUP BY date`,
        [startDate, endDate, user.tenantId]
      ),
      // Masraflar (kira, elektrik, personel vb.) — sipariş/hizmetlerden bağımsız,
      // Kâr hesabından günlük bazda düşülür (bkz. dailyData birleştirmesi altta).
      pool.query(
        `SELECT expense_date::text AS date, SUM(amount)::float AS masraf
         FROM expenses
         WHERE expense_date >= $1 AND expense_date < $2 AND tenant_id = $3
         GROUP BY date`,
        [expenseStart, expenseEnd, user.tenantId]
      ),
      // Hizmet Dağılımı: sadece adet değil, o hizmetten gelen Ciro/Maliyet/Kâr da
      // gösterilir — "Bijon'dan ne kadar kazandım" gibi sorulara pasta grafik tek
      // başına cevap vermiyordu.
      pool.query(
        `SELECT
           s.name,
           COALESCE(SUM(os.quantity), 0)::int AS count,
           COALESCE(SUM(os.unit_price), 0)::float AS ciro,
           COALESCE(SUM(os.cost_price), 0)::float AS maliyet
         FROM order_services os
         JOIN services s ON os.service_id = s.id
         JOIN orders o ON os.order_id = o.id
         WHERE o.created_at >= $1 AND o.created_at < $2 AND o.tenant_id = $3
         GROUP BY s.name
         ORDER BY count DESC`,
        [serviceStatsStart, serviceStatsEnd, user.tenantId]
      ),
      // total_orders/completed/pending artık created_at'e göre sayılır — önceden
      // payment_date'e göre filtrelendiği için BEKLEMEDE siparişler (payment_date
      // hiç set edilmediğinden NULL) hiçbir ayda görünmüyordu. Toplam ciro
      // (total_revenue) burada ayrıca sorgulanmaz — dailyCiroResult'un toplamından
      // türetilir (aynı WHERE'i tekrar tarayan gereksiz bir sorgu olmasın diye).
      pool.query(
        `SELECT
           COUNT(*)::int AS total_orders,
           COUNT(CASE WHEN status = 'TAMAMLANDI' THEN 1 END)::int AS completed,
           COUNT(CASE WHEN status = 'BEKLEMEDE' THEN 1 END)::int AS pending
         FROM orders
         WHERE created_at >= $1 AND created_at < $2 AND tenant_id = $3`,
        [startDate, endDate, user.tenantId]
      ),
      // Ödeme tipi serbest metin olduğu için (Nakit/POS/Cari/Fatura Edildi./Excel'den
      // gelen Mail Order hesapları vb.) sabit kategoriler yerine dinamik kırılım.
      // "Ödeme Al & Kapat" ile kapatılan siparişlerde asıl kaynak order_payments'tır
      // (parçalı ödeme — bkz. PATCH /api/orders/:id); order_payments kaydı olmayan
      // (Excel'den içe aktarılmış, eski) siparişlerde satır bazlı
      // order_services.payment_type'a geri düşülür — bir sipariş iki kaynaktan
      // birden sayılmaz (NOT EXISTS ile ayrıştırılır). Statüye bakılmaz.
      pool.query(
        `SELECT payment_type, COALESCE(SUM(total), 0)::float AS total
         FROM (
           SELECT op.payment_type AS payment_type, op.amount AS total
           FROM order_payments op
           JOIN orders o ON o.id = op.order_id
           WHERE o.created_at >= $1 AND o.created_at < $2 AND o.tenant_id = $3

           UNION ALL

           SELECT COALESCE(os.payment_type, 'Belirtilmemiş') AS payment_type, os.unit_price AS total
           FROM order_services os
           JOIN orders o ON os.order_id = o.id
           WHERE NOT EXISTS (SELECT 1 FROM order_payments op2 WHERE op2.order_id = o.id AND op2.tenant_id = o.tenant_id)
             AND o.created_at >= $1 AND o.created_at < $2 AND o.tenant_id = $3
         ) combined
         GROUP BY payment_type
         ORDER BY total DESC`,
        [startDate, endDate, user.tenantId]
      ),
      // Seçili ay için henüz masraf satırına dönüştürülmemiş aktif sabit gider
      // şablonları (bkz. Masraflar — "Sabit Giderleri Ekle") — unutulmuş bir
      // kira gibi kalemin o ayın Kâr'ını olduğundan yüksek göstermesine karşı
      // Raporlar'da bir uyarı olarak gösterilir.
      pool.query(
        `SELECT re.id, re.category
         FROM recurring_expenses re
         WHERE re.is_active = true AND re.tenant_id = $3
           AND NOT EXISTS (
             SELECT 1 FROM expenses e
             WHERE e.recurring_expense_id = re.id
               AND e.expense_date >= $1 AND e.expense_date < $2 AND e.tenant_id = $3
           )
         ORDER BY re.category`,
        [expenseStart, expenseEnd, user.tenantId]
      ),
      // Dönemsel Ciro/Maliyet/Masraf — üstteki Ay/Yıl'dan bağımsız, kullanıcının
      // "Dönemsel" widget'ında seçtiği kendi tarih aralığı (Tarih/Günlük/Haftalık/
      // Aylık). Aralık verilmemişse (hasPeriodRange=false, olmaması beklenmez ama
      // savunmacı) sorgu hiç çalıştırılmaz, periodSummary null döner.
      hasPeriodRange
        ? pool.query<{ ciro: number; maliyet: number; masraf: number }>(
            `SELECT
               (SELECT COALESCE(SUM(COALESCE(paid_amount, total_amount)), 0) FROM orders
                WHERE created_at >= $1 AND created_at < $2 AND tenant_id = $3)::float AS ciro,
               (SELECT COALESCE(SUM(os.cost_price), 0) FROM order_services os
                JOIN orders o ON os.order_id = o.id
                WHERE o.created_at >= $1 AND o.created_at < $2 AND o.tenant_id = $3)::float AS maliyet,
               (SELECT COALESCE(SUM(amount), 0) FROM expenses
                WHERE expense_date >= $4::date AND expense_date < $5::date AND tenant_id = $3)::float AS masraf`,
            [periodStart, periodEnd, user.tenantId, periodFromRaw, periodExpenseEnd]
          )
        : Promise.resolve(null),
    ]);

    // Her siparişin en az bir order_services satırı olduğundan, maliyet
    // sonuçlarındaki her tarih zaten ciro sonuçlarında da vardır. Masraflar
    // ise siparişten bağımsız günlerde de olabileceğinden (ör. hiç sipariş
    // olmayan bir günde kira ödenmesi) ayrı bir tarih seti oluşturabilir —
    // bu yüzden tüm tarih anahtarları (ciro ∪ masraf) birleştirilir.
    const maliyetByDate = new Map(
      dailyMaliyetResult.rows.map((r: { date: string; maliyet: number }) => [r.date, r.maliyet])
    );
    const masrafByDate = new Map(
      dailyExpenseResult.rows.map((r: { date: string; masraf: number }) => [r.date, r.masraf])
    );
    const allDates = new Set([
      ...dailyCiroResult.rows.map((r: { date: string }) => r.date),
      ...Array.from(masrafByDate.keys()),
    ]);
    const dailyData = Array.from(allDates)
      .map((date) => {
        const ciroRow = dailyCiroResult.rows.find((r: { date: string }) => r.date === date);
        return {
          date,
          ciro: ciroRow?.ciro ?? 0,
          maliyet: maliyetByDate.get(date) ?? 0,
          masraf: masrafByDate.get(date) ?? 0,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    const totalRevenue = dailyData.reduce((sum, r) => sum + r.ciro, 0);
    const totalExpenses = dailyData.reduce((sum, r) => sum + r.masraf, 0);

    const periodSummaryRow = periodSummaryResult?.rows[0] ?? null;

    return NextResponse.json({
      dailyData,
      serviceStats: serviceStatsResult.rows,
      summary: { ...summaryResult.rows[0], total_revenue: totalRevenue, total_expenses: totalExpenses },
      paymentBreakdown: paymentBreakdownResult.rows,
      unaddedRecurring: unaddedRecurringResult.rows,
      periodSummary: periodSummaryRow
        ? { ciro: periodSummaryRow.ciro, maliyet: periodSummaryRow.maliyet, masraf: periodSummaryRow.masraf }
        : null,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
