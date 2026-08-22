import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

// Yeni Masraf formundaki Kategori alanı için, o ayla sınırlı olmadan bugüne
// kadar fiilen kullanılmış tüm kategorilerin dinamik listesi — DEFAULT_EXPENSE_CATEGORIES
// (bkz. src/lib/expenseCategories.ts) ile birleştirilip datalist önerisi olarak sunulur.
export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "expenses.view")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const result = await pool.query(
      `SELECT DISTINCT category FROM expenses ORDER BY category`
    );
    return NextResponse.json(result.rows.map((r) => r.category));
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
