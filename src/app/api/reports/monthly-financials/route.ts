import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

// Aylık Gelir-Gider-Kar/Zarar Raporu — bkz. database/schema.sql'deki
// monthly_financials yorumu. Bir ay için kayıt varsa (admin daha önce
// "Kaydet"e basmış) o satır olduğu gibi döner; yoksa sistemdeki ham veriden
// bir ÖNERİ hesaplanıp isSaved:false ile döner, hiçbir şey yazılmaz.
//
// Formül (müşteri isteğiyle netleştirildi): Gelir = Ciro - Maliyet (COGS
// düşülmüş net gelir), Gider = Masraf. Kâr/Zarar = Gelir - Gider, yani
// açılımıyla Ciro - Maliyet - Masraf — Raporlar sayfasındaki "Dönemsel"
// widget'ındaki Kâr ile aynı sonucu verir, sadece Maliyet burada Gider'de
// değil Gelir'in içinde gösterilir.
export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "reports.view")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()));
  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: "Geçersiz yıl." }, { status: 400 });
  }

  // Türkiye sabit UTC+3 (bkz. /api/reports'taki aynı not) — yılın tamamı tek
  // sargable aralıkla filtrelenir, ay kırılımı sadece bu önceden filtrelenmiş
  // alt kümede hesaplanır (performans sorunu yaratmaz).
  const yearStart = new Date(Date.UTC(year, 0, 1, -3, 0, 0));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1, -3, 0, 0));

  try {
    const [savedResult, ciroResult, maliyetResult, masrafResult] = await Promise.all([
      pool.query<{ month: number; income: string; expense: string }>(
        "SELECT month, income, expense FROM monthly_financials WHERE tenant_id = $1 AND year = $2",
        [user.tenantId, year]
      ),
      pool.query<{ month: number; ciro: number }>(
        `SELECT EXTRACT(MONTH FROM (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul'))::int AS month,
                SUM(COALESCE(paid_amount, total_amount))::float AS ciro
         FROM orders WHERE tenant_id = $1 AND created_at >= $2 AND created_at < $3
         GROUP BY 1`,
        [user.tenantId, yearStart, yearEnd]
      ),
      pool.query<{ month: number; maliyet: number }>(
        `SELECT EXTRACT(MONTH FROM (o.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul'))::int AS month,
                SUM(COALESCE(os.cost_price, 0))::float AS maliyet
         FROM order_services os JOIN orders o ON os.order_id = o.id
         WHERE o.tenant_id = $1 AND o.created_at >= $2 AND o.created_at < $3
         GROUP BY 1`,
        [user.tenantId, yearStart, yearEnd]
      ),
      pool.query<{ month: number; masraf: number }>(
        `SELECT EXTRACT(MONTH FROM expense_date)::int AS month, SUM(amount)::float AS masraf
         FROM expenses WHERE tenant_id = $1 AND expense_date >= $2::date AND expense_date < $3::date
         GROUP BY 1`,
        [user.tenantId, `${year}-01-01`, `${year + 1}-01-01`]
      ),
    ]);

    const savedByMonth = new Map(savedResult.rows.map((r) => [r.month, r]));
    const ciroByMonth = new Map(ciroResult.rows.map((r) => [r.month, r.ciro]));
    const maliyetByMonth = new Map(maliyetResult.rows.map((r) => [r.month, r.maliyet]));
    const masrafByMonth = new Map(masrafResult.rows.map((r) => [r.month, r.masraf]));

    // Ciro/Maliyet her zaman canlı hesaplanıp döner (kaydedilmiş aylarda
    // bile) — müşteri isteği: Gelir'in nereden geldiğini (Ciro - Maliyet)
    // ekranda ayrı sütunlarla görmek istiyor. Bunlar monthly_financials'a
    // YAZILMAZ (sadece income/expense dondurulur, bkz. schema.sql) — bu
    // yüzden kaydedilmiş eski bir ayda sistemdeki veri sonradan değişirse
    // Ciro-Maliyet, dondurulmuş Gelir'e tam eşit çıkmayabilir; bu normaldir,
    // admin o ay için Gelir'i elle onaylamış/değiştirmiş olabilir.
    const months = Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const ciro = ciroByMonth.get(month) ?? 0;
      const maliyet = maliyetByMonth.get(month) ?? 0;
      const saved = savedByMonth.get(month);
      if (saved) {
        const income = Number(saved.income);
        const expense = Number(saved.expense);
        return { month, ciro, maliyet, income, expense, kar: income - expense, isSaved: true };
      }
      const income = ciro - maliyet;
      const expense = masrafByMonth.get(month) ?? 0;
      return { month, ciro, maliyet, income, expense, kar: income - expense, isSaved: false };
    });

    const totals = months.reduce(
      (acc, m) => ({ ciro: acc.ciro + m.ciro, maliyet: acc.maliyet + m.maliyet, income: acc.income + m.income, expense: acc.expense + m.expense, kar: acc.kar + m.kar }),
      { ciro: 0, maliyet: 0, income: 0, expense: 0, kar: 0 }
    );

    return NextResponse.json({ year, months, totals });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}

// Sadece admin — bkz. sunum/karar notları: bu rakamlar resmi kayıt olduğundan
// yetki genişletilmedi, mevcut admin rolüyle sınırlı (ayrı bir izin yok).
export async function PUT(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const { year, month, income, expense } = await request.json();
    const yearNum = Number(year);
    const monthNum = Number(month);
    const incomeNum = Number(income);
    const expenseNum = Number(expense);

    if (!Number.isFinite(yearNum) || yearNum < 2000 || yearNum > 2100) {
      return NextResponse.json({ error: "Geçersiz yıl." }, { status: 400 });
    }
    if (!Number.isInteger(monthNum) || monthNum < 1 || monthNum > 12) {
      return NextResponse.json({ error: "Geçersiz ay." }, { status: 400 });
    }
    if (!Number.isFinite(incomeNum) || incomeNum < 0 || !Number.isFinite(expenseNum) || expenseNum < 0) {
      return NextResponse.json({ error: "Gelir ve Gider 0 veya üzeri bir sayı olmalıdır." }, { status: 400 });
    }

    const result = await pool.query(
      `INSERT INTO monthly_financials (tenant_id, year, month, income, expense, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (tenant_id, year, month)
       DO UPDATE SET income = EXCLUDED.income, expense = EXCLUDED.expense, updated_by = EXCLUDED.updated_by, updated_at = NOW()
       RETURNING year, month, income, expense`,
      [user.tenantId, yearNum, monthNum, incomeNum, expenseNum, user.userId]
    );

    const row = result.rows[0];
    return NextResponse.json({
      month: row.month,
      income: Number(row.income),
      expense: Number(row.expense),
      kar: Number(row.income) - Number(row.expense),
      isSaved: true,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
