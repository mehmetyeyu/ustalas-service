import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

// Sipariş sayfasındaki Filtrele modalında Ödeme Şekli çoklu seçimi için:
// sabit bir katalog yerine gerçekten kullanılmış değerler döner — "Mail
// Order" tipleri "<Tedarikçi> Mail Order" olarak dinamik oluştuğundan sabit
// bir liste yeterli olmaz.
export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const result = await pool.query(
      `SELECT DISTINCT payment_type FROM order_services WHERE payment_type IS NOT NULL AND payment_type <> '' ORDER BY payment_type`
    );
    return NextResponse.json(result.rows.map((r) => r.payment_type));
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
