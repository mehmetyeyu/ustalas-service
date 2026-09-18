import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getPaymentTransactions } from "@/lib/iyzico";

// Gerçek toplam platform geliri — Süper Admin'deki "tahmini" (vitrin
// fiyatı üzerinden) MRR'den farklı olarak, iyzico'nun Raporlama
// Servisi'nden GÜN GÜN çekilip toplanan gerçek işlemlere dayanır (bkz.
// src/lib/iyzico.ts getPaymentTransactions notu — bu uç nokta tarih
// bazlı sorgulanabiliyor, tek seferde bir ay istenemiyor).
//
// ÖNEMLİ: günleri hepsini AYNI ANDA (Promise.all) çekmek gerçek bir
// denemede "İstek atma limiti aşıldı!" ile başarısız oldu — sandbox
// hesabımızın bile eşzamanlı istek limiti düşük (mevcut ölçekte, ~18-20
// günlük paralel çağrıda tetiklendi). Bu yüzden sınırlı eşzamanlılıkla
// (CONCURRENCY) işleniyor; bir günün çağrısı rate limit'e takılırsa
// kısa bir bekleyişle bir kez tekrar deneniyor, yine başarısız olursa o
// gün 0 katkı sayılıp devam ediliyor (tek bir günün hatası tüm ayı
// başarısız kılmasın diye).
const MAX_PAGES_PER_DAY = 20;
const CONCURRENCY = 2;
const BATCH_DELAY_MS = 400;
const RETRY_DELAYS_MS = [2000, 4000, 8000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchTransactionsWithRetry(date: string, page: number) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await getPaymentTransactions(date, page);
    } catch (error) {
      if (attempt >= RETRY_DELAYS_MS.length) {
        console.error(`revenue — ${date} sayfa ${page} tüm denemelerde başarısız, bu gün eksik sayılabilir:`, error);
        return null;
      }
      console.warn(`revenue — ${date} sayfa ${page} için hata (deneme ${attempt + 1}), ${RETRY_DELAYS_MS[attempt]}ms bekleniyor:`, error);
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
}

async function fetchDayTotals(date: string): Promise<{ payout: number; gross: number; commission: number; count: number }> {
  let payout = 0;
  let gross = 0;
  let commission = 0;
  let count = 0;
  for (let page = 1; page <= MAX_PAGES_PER_DAY; page++) {
    const txs = await fetchTransactionsWithRetry(date, page);
    if (txs === null) break;
    if (txs.length === 0) break;
    for (const tx of txs) {
      if (tx.transactionType === "PAYMENT" && tx.merchantPayoutAmount) {
        payout += tx.merchantPayoutAmount;
        gross += tx.paidPrice ?? 0;
        // /details'teki iyziCommissionRateAmount/iyziCommissionFee ile
        // AYNI veri, sadece /transactions'ta farklı adlandırılmış
        // (bkz. src/lib/iyzico.ts PaymentTransaction notu).
        commission += (tx.iyzicoCommission ?? 0) + (tx.iyzicoFee ?? 0);
        count++;
      }
    }
  }
  return { payout, gross, commission, count };
}

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user || user.role !== "super_admin") return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  const monthParam = request.nextUrl.searchParams.get("month"); // "YYYY-MM"
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 1;
  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [y, m] = monthParam.split("-").map(Number);
    year = y;
    month = m;
  }
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;
  const daysInMonth = new Date(year, month, 0).getDate();
  const lastDay = isCurrentMonth ? now.getDate() : daysInMonth;

  const dates: string[] = [];
  for (let d = 1; d <= lastDay; d++) {
    dates.push(`${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }

  try {
    // CONCURRENCY büyüklüğünde küçük gruplar halinde, aralarında bir
    // miktar bekleyerek işleniyor (yukarıdaki rate limit notuna bkz.).
    const dayResults: Array<{ payout: number; gross: number; commission: number; count: number }> = [];
    for (let i = 0; i < dates.length; i += CONCURRENCY) {
      if (i > 0) await sleep(BATCH_DELAY_MS);
      const batch = dates.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(batch.map(fetchDayTotals));
      dayResults.push(...batchResults);
    }

    const totals = dayResults.reduce(
      (acc, r) => ({
        payout: acc.payout + r.payout,
        gross: acc.gross + r.gross,
        commission: acc.commission + r.commission,
        count: acc.count + r.count,
      }),
      { payout: 0, gross: 0, commission: 0, count: 0 }
    );

    return NextResponse.json({
      month: `${year}-${String(month).padStart(2, "0")}`,
      totalPayout: totals.payout,
      totalGross: totals.gross,
      totalCommission: totals.commission,
      paymentCount: totals.count,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Gelir hesaplanamadı." }, { status: 500 });
  }
}
