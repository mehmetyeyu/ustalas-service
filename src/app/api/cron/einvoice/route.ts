import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { runEInvoiceSweep } from "@/lib/einvoice/sweep";

// Günlük e-Fatura bakımı (bağlantı tazeleme + takılı fatura süpürme, bkz.
// src/lib/einvoice/sweep.ts). Vercel Cron CRON_SECRET'i Bearer olarak
// gönderir; o olmadan bu uç herkese açık olurdu.
export const maxDuration = 60;

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  // Sabit zamanlı karşılaştırma (özetler eşit uzunlukta).
  const digest = (v: string) => createHash("sha256").update(v).digest();
  return timingSafeEqual(digest(request.headers.get("authorization") ?? ""), digest(`Bearer ${secret}`));
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  try {
    // Süre sınırından önce bırak — kalanı ertesi gün süpürülür.
    const result = await runEInvoiceSweep(Date.now() + 45_000);
    console.log("e-Fatura günlük bakım", result);
    return NextResponse.json(result);
  } catch (error) {
    console.error("e-Fatura günlük bakım hatası", error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
