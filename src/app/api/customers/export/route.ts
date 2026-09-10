import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import * as XLSX from "xlsx";
import { sanitizeExcelRow } from "@/lib/excelSafety";

// Müşteriler sayfasındaki "Toplam Borç/Alacak" kartlarının dayandığı aynı
// canlı SUM() — çalışana "git şu müşterilerden tahsil et" diye verilebilecek
// somut bir liste. Bakiyesi 0 olan müşteriler (tahsilat/borç hareketi hiç
// olmayanlar) listeye dahil edilmez, en yüksek borçtan en yüksek alacağa sıralanır.
export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "customers.view")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const result = await pool.query<{
      name: string; phone: string | null; balance: number;
      first_debt_date: string | null; last_activity_date: string | null; order_details: string | null;
    }>(
      `SELECT c.name, c.phone, COALESCE(bal.balance, 0)::float AS balance,
              bal.first_debt_date, bal.last_activity_date, bal.order_details
       FROM customers c
       LEFT JOIN LATERAL (
         SELECT
           SUM(cle.amount * cle.direction) AS balance,
           MIN(cle.entry_date) FILTER (WHERE cle.direction = 1) AS first_debt_date,
           MAX(cle.entry_date) AS last_activity_date,
           STRING_AGG(
             '#' || cle.order_id::text || ' (' || COALESCE((
               SELECT STRING_AGG(DISTINCT s.name, ', ')
               FROM order_services os JOIN services s ON s.id = os.service_id
               WHERE os.order_id = cle.order_id AND os.tenant_id = cle.tenant_id
             ), '-') || ')',
             '; ' ORDER BY cle.order_id
           ) FILTER (WHERE cle.entry_type = 'SIPARIS') AS order_details
         FROM customer_ledger_entries cle
         WHERE cle.customer_id = c.id AND cle.tenant_id = c.tenant_id
       ) bal ON true
       WHERE c.tenant_id = $1 AND COALESCE(bal.balance, 0) <> 0
       ORDER BY COALESCE(bal.balance, 0) DESC`,
      [user.tenantId]
    );

    const rows = result.rows.map((r) => sanitizeExcelRow({
      "Müşteri Adı": r.name ?? "",
      "Telefon": r.phone ?? "",
      "Durum": r.balance > 0 ? "Borçlu" : "Alacaklı",
      "Tutar (TL)": Math.abs(r.balance),
      "İlk Borç Tarihi": r.first_debt_date ? new Date(r.first_debt_date).toLocaleDateString("tr-TR") : "",
      "Son Hareket Tarihi": r.last_activity_date ? new Date(r.last_activity_date).toLocaleDateString("tr-TR") : "",
      "İlgili Siparişler": r.order_details ?? "",
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 26 }, { wch: 16 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 50 }];
    XLSX.utils.book_append_sheet(wb, ws, "Cari Borç-Alacak");

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const date = new Date().toISOString().split("T")[0];

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="cari-borc-alacak-${date}.xlsx"`,
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
