import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import * as XLSX from "xlsx";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });

  try {
    const result = await pool.query("SELECT * FROM storage ORDER BY created_at DESC");

    const rows = result.rows.map((r) => ({
      "Depo No":        r.depo_no ?? "",
      "Plaka":          r.plate ?? "",
      "Müşteri":        r.customer_name ?? "",
      "Telefon":        r.phone ?? "",
      "Ebat":           r.ebat ?? "",
      "Marka":          r.marka ?? "",
      "Diş Derinliği":  r.dis_derinligi ?? "",
      "Adet":           r.adet ?? "",
      "Mevsim":         r.mevsim ?? "",
      "Açıklama":       r.aciklama ?? "",
      "İşlem Tarihi":   r.islem_tarihi ? new Date(r.islem_tarihi).toLocaleDateString("tr-TR") : "",
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);

    ws["!cols"] = [
      { wch: 8 }, { wch: 12 }, { wch: 20 }, { wch: 14 }, { wch: 12 },
      { wch: 14 }, { wch: 12 }, { wch: 6 }, { wch: 12 }, { wch: 30 }, { wch: 14 },
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Depolama Listesi");

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const date = new Date().toISOString().split("T")[0];

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="depolama-${date}.xlsx"`,
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
