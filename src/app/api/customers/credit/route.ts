import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { exceedsCreditLimit } from "@/lib/customers";

// Cari limiti kontrolü — sipariş formu ve Ödeme Al & Kapat / Düzelt
// ekranları, cariye yazılacak tutar müşterinin limitini aşıyorsa UYARI
// gösterir (engellemez, bkz. database/schema.sql credit_limit notu).
// ?customer=<ad>&amount=<cariye eklenecek tutar>&exclude_order=<id>
// exclude_order: düzenlenen/kapatılan siparişin mevcut cari borcu bakiyeden
// düşülür (yeni tutar zaten amount'ta, iki kez sayılmasın).
// Bakiye/limit tutarları yalnızca customers.view izniyle döner; diğerleri
// sadece "aşıyor mu" bilgisini görür.
export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const name = String(sp.get("customer") ?? "").trim();
  const amount = Number(sp.get("amount") ?? 0);
  const excludeOrder = sp.get("exclude_order");
  if (!name || !Number.isFinite(amount) || amount < 0) return NextResponse.json({ has_limit: false, exceeds: false });
  if (excludeOrder && !/^\d+$/.test(excludeOrder)) return NextResponse.json({ error: "Geçersiz sipariş." }, { status: 400 });

  try {
    const result = await pool.query<{ credit_limit: number | null; balance: number; order_debt: number }>(
      `SELECT c.credit_limit::float AS credit_limit,
              COALESCE((SELECT SUM(e.amount * e.direction) FROM customer_ledger_entries e
                         WHERE e.tenant_id = c.tenant_id AND e.customer_id = c.id), 0)::float AS balance,
              COALESCE((SELECT SUM(e.amount) FROM customer_ledger_entries e
                         WHERE e.tenant_id = c.tenant_id AND e.customer_id = c.id
                           AND e.entry_type = 'SIPARIS' AND e.order_id = $3), 0)::float AS order_debt
       FROM customers c WHERE c.tenant_id = $1 AND c.name = $2`,
      [user.tenantId, name, excludeOrder ? Number(excludeOrder) : null]
    );
    const row = result.rows[0];
    if (!row || row.credit_limit == null) return NextResponse.json({ has_limit: false, exceeds: false });
    const balance = row.balance - row.order_debt;
    const exceeds = exceedsCreditLimit(row.credit_limit, balance, amount);
    const body: Record<string, unknown> = { has_limit: true, exceeds };
    if (hasPermission(user, "customers.view")) {
      body.limit = row.credit_limit;
      body.balance = balance;
      body.after = balance + amount;
    }
    return NextResponse.json(body);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
