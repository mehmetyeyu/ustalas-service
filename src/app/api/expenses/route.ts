import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "expenses.view")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()));
  const month = parseInt(searchParams.get("month") || String(new Date().getMonth() + 1));

  // expense_date bir DATE kolonu (saat/saat dilimi yok) — Raporlar'daki
  // timestamp aralık dönüşümüne gerek yok, ayın ilk günü ile bir sonraki ayın
  // ilk günü arasındaki düz tarih string aralığı yeterli.
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const endDate = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;

  try {
    const result = await pool.query(
      `SELECT id, expense_date::text AS expense_date, category, description, amount::float AS amount, payment_type, recurring_expense_id
       FROM expenses
       WHERE expense_date >= $1 AND expense_date < $2
       ORDER BY expense_date DESC, id DESC`,
      [startDate, endDate]
    );
    const total = result.rows.reduce((sum, r) => sum + Number(r.amount || 0), 0);
    return NextResponse.json({ items: result.rows, total });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}

interface ExpenseInput {
  expense_date: string;
  category: string;
  description?: string | null;
  amount: number | string;
  payment_type?: string | null;
  recurring_expense_id?: number | null;
}

function validateExpenseInput(e: ExpenseInput, index: number): string | null {
  if (!e.expense_date || !String(e.expense_date).trim()) {
    return `${index + 1}. satır: Tarih zorunludur.`;
  }
  if (!e.category || !String(e.category).trim()) {
    return `${index + 1}. satır: Kategori zorunludur.`;
  }
  const amountValue = Number(e.amount);
  if (!Number.isFinite(amountValue) || amountValue <= 0) {
    return `${index + 1}. satır: Geçersiz tutar.`;
  }
  return null;
}

// Sipariş Oluşturma ekranındaki İşlem Satırları'na benzer şekilde, "Yeni
// Masraf" formu tek seferde birden fazla satır girilmesine izin verir — bu
// yüzden POST tekil bir nesne değil, { items: [...] } dizisi kabul eder ve
// hepsini tek bir transaction'da ekler (biri geçersizse hiçbiri kaydedilmez).
export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "expenses.create")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const { items } = await request.json();
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "En az bir masraf satırı girilmelidir." }, { status: 400 });
    }
    for (let i = 0; i < items.length; i++) {
      const err = validateExpenseInput(items[i], i);
      if (err) return NextResponse.json({ error: err }, { status: 400 });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const ids: number[] = [];
      for (const e of items as ExpenseInput[]) {
        const result = await client.query(
          `INSERT INTO expenses (expense_date, category, description, amount, payment_type, recurring_expense_id)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [
            e.expense_date,
            String(e.category).trim(),
            e.description ? String(e.description).trim() : null,
            Number(e.amount),
            e.payment_type ? String(e.payment_type).trim() : null,
            e.recurring_expense_id || null,
          ]
        );
        ids.push(result.rows[0].id);
      }
      await client.query("COMMIT");
      return NextResponse.json({ ids }, { status: 201 });
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
