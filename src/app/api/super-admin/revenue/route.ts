import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getPaymentTransactions } from "@/lib/iyzico";

// Gerçek toplam platform geliri — Süper Admin'deki "tahmini" (vitrin
// fiyatı üzerinden) MRR'den farklı olarak, iyzico'nun Raporlama
// Servisi'nden GÜN GÜN çekilip toplanan gerçek işlemlere dayanır (bkz.
// src/lib/iyzico.ts getPaymentTransactions notu — bu uç nokta tarih
// bazlı sorgulanabiliyor, tek seferde bir ay istenemiyor). Mevcut
// ölçekte (az sayıda tenant/işlem) günleri PARALEL çekmek güvenli;
// tenant/işlem sayısı ciddi büyürse iyzico'nun rate limitine karşı
// (bkz. plan, errorCode 50000) seri+backoff'a geçilmeli.
const MAX_PAGES_PER_DAY = 20;

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
    const dayResults = await Promise.all(
      dates.map(async (date) => {
        let payout = 0;
        let gross = 0;
        let count = 0;
        for (let page = 1; page <= MAX_PAGES_PER_DAY; page++) {
          const txs = await getPaymentTransactions(date, page);
          if (txs.length === 0) break;
          for (const tx of txs) {
            if (tx.transactionType === "PAYMENT" && tx.merchantPayoutAmount) {
              payout += tx.merchantPayoutAmount;
              gross += tx.paidPrice ?? 0;
              count++;
            }
          }
        }
        return { payout, gross, count };
      })
    );

    const totals = dayResults.reduce(
      (acc, r) => ({ payout: acc.payout + r.payout, gross: acc.gross + r.gross, count: acc.count + r.count }),
      { payout: 0, gross: 0, count: 0 }
    );

    return NextResponse.json({
      month: `${year}-${String(month).padStart(2, "0")}`,
      totalPayout: totals.payout,
      totalGross: totals.gross,
      paymentCount: totals.count,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Gelir hesaplanamadı." }, { status: 500 });
  }
}
