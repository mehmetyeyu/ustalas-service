import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

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

  // expenses.expense_date bir DATE kolonu (saat/saat dilimi yok) — timestamp
  // aralık dönüşümüne gerek yok, ayın ilk günü ile bir sonraki ayın ilk günü
  // arasındaki düz tarih string aralığı yeterli.
  const expenseStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const expenseNextYear = month === 12 ? year + 1 : year;
  const expenseNextMonth = month === 12 ? 1 : month + 1;
  const expenseEnd = `${expenseNextYear}-${String(expenseNextMonth).padStart(2, "0")}-01`;

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
    const [
      dailyCiroResult,
      dailyMaliyetResult,
      dailyExpenseResult,
      serviceStatsResult,
      summaryResult,
      paymentBreakdownResult,
      unaddedRecurringResult,
    ] = await Promise.all([
      pool.query(
        `SELECT
           ((created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul')::date)::text AS date,
           SUM(COALESCE(paid_amount, total_amount))::float AS ciro
         FROM orders
         WHERE created_at >= $1 AND created_at < $2
         GROUP BY date`,
        [startDate, endDate]
      ),
      pool.query(
        `SELECT
           ((o.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul')::date)::text AS date,
           SUM(COALESCE(os.cost_price, 0))::float AS maliyet
         FROM order_services os
         JOIN orders o ON os.order_id = o.id
         WHERE o.created_at >= $1 AND o.created_at < $2
         GROUP BY date`,
        [startDate, endDate]
      ),
      // Masraflar (kira, elektrik, personel vb.) — sipariş/hizmetlerden bağımsız,
      // Kâr hesabından günlük bazda düşülür (bkz. dailyData birleştirmesi altta).
      pool.query(
        `SELECT expense_date::text AS date, SUM(amount)::float AS masraf
         FROM expenses
         WHERE expense_date >= $1 AND expense_date < $2
         GROUP BY date`,
        [expenseStart, expenseEnd]
      ),
      // Hizmet Dağılımı: sadece adet değil, o hizmetten gelen Ciro/Maliyet/Kâr da
      // gösterilir — "Bijon'dan ne kadar kazandım" gibi sorulara pasta grafik tek
      // başına cevap vermiyordu.
      pool.query(
        `SELECT
           s.name,
           COUNT(os.service_id)::int AS count,
           COALESCE(SUM(os.unit_price), 0)::float AS ciro,
           COALESCE(SUM(os.cost_price), 0)::float AS maliyet
         FROM order_services os
         JOIN services s ON os.service_id = s.id
         JOIN orders o ON os.order_id = o.id
         WHERE o.created_at >= $1 AND o.created_at < $2
         GROUP BY s.name
         ORDER BY count DESC`,
        [startDate, endDate]
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
         WHERE created_at >= $1 AND created_at < $2`,
        [startDate, endDate]
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
           WHERE o.created_at >= $1 AND o.created_at < $2

           UNION ALL

           SELECT COALESCE(os.payment_type, 'Belirtilmemiş') AS payment_type, os.unit_price AS total
           FROM order_services os
           JOIN orders o ON os.order_id = o.id
           WHERE NOT EXISTS (SELECT 1 FROM order_payments op2 WHERE op2.order_id = o.id)
             AND o.created_at >= $1 AND o.created_at < $2
         ) combined
         GROUP BY payment_type
         ORDER BY total DESC`,
        [startDate, endDate]
      ),
      // Seçili ay için henüz masraf satırına dönüştürülmemiş aktif sabit gider
      // şablonları (bkz. Masraflar — "Sabit Giderleri Ekle") — unutulmuş bir
      // kira gibi kalemin o ayın Kâr'ını olduğundan yüksek göstermesine karşı
      // Raporlar'da bir uyarı olarak gösterilir.
      pool.query(
        `SELECT re.id, re.category
         FROM recurring_expenses re
         WHERE re.is_active = true
           AND NOT EXISTS (
             SELECT 1 FROM expenses e
             WHERE e.recurring_expense_id = re.id
               AND e.expense_date >= $1 AND e.expense_date < $2
           )
         ORDER BY re.category`,
        [expenseStart, expenseEnd]
      ),
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

    return NextResponse.json({
      dailyData,
      serviceStats: serviceStatsResult.rows,
      summary: { ...summaryResult.rows[0], total_revenue: totalRevenue, total_expenses: totalExpenses },
      paymentBreakdown: paymentBreakdownResult.rows,
      unaddedRecurring: unaddedRecurringResult.rows,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
