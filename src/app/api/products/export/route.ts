import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import * as XLSX from "xlsx";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const result = await pool.query(
      "SELECT * FROM products ORDER BY code ASC, production_year NULLS FIRST, production_week NULLS FIRST"
    );

    const rows = result.rows.map((r) => ({
      "Ürün Kodu":            r.code ?? "",
      "Marka":                r.brand ?? "",
      "Ebat":                 r.size_desc ?? "",
      "Mevsim":               r.season ?? "",
      "Tedarikçi":            r.supplier ?? "",
      "Üretim Haftası/Yılı":  r.production_week != null && r.production_year != null
        ? `${String(r.production_week).padStart(2, "0")}/${String(r.production_year).slice(-2)}`
        : "",
      "Alış Maliyeti":        r.purchase_price ?? "",
      "Satış Fiyatı":         r.sale_price ?? "",
      "Stok Miktarı":         r.stock_qty ?? "",
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);

    ws["!cols"] = [
      { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 12 },
      { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 },
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Ürün Listesi");

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const date = new Date().toISOString().split("T")[0];

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="urunler-${date}.xlsx"`,
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
