import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import * as XLSX from "xlsx";
import { sanitizeExcelRow } from "@/lib/excelSafety";
import { buildOrderQuery } from "@/lib/orderQuery";
import { hasPermission } from "@/lib/permissions";

// Sipariş Listesi'ndeki aktif filtrelerle (bkz. GET /api/orders) aynı satır
// bazlı görünümü Excel'e döker — sayfalama uygulanmaz, filtrelere uyan TÜM
// satırlar tek dosyada döner.
export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "orders.view")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const { where, values, orderBy } = buildOrderQuery(user.tenantId!, searchParams);

  try {
    const result = await pool.query(
      `SELECT
         o.id, o.plate, o.customer_name, o.notes, o.status, o.created_at,
         s.name AS service_name,
         os.supplier, os.stock_code, os.size_desc, os.quantity, os.unit_price, os.cost_price,
         COALESCE(os.payment_type, o.payment_type) AS payment_type
       FROM orders o
       LEFT JOIN order_services os ON o.id = os.order_id
       LEFT JOIN services s ON os.service_id = s.id
       ${where}
       ORDER BY ${orderBy}`,
      values
    );

    const rows = result.rows.map((r) => sanitizeExcelRow({
      "Sipariş No":     r.id,
      "Tarih":          r.created_at ? new Date(r.created_at).toLocaleDateString("tr-TR") : "",
      "Müşteri":        r.customer_name ?? "",
      "Plaka":          r.plate ?? "",
      "Yapılan İşlem":  r.service_name ?? "",
      "Tedarikçi":      r.supplier ?? "",
      "Stok Kodu":      r.stock_code ?? "",
      "Ebat":           r.size_desc ?? "",
      "Adet":           r.quantity ?? "",
      "Tutar":          r.unit_price ?? "",
      "Maliyet":        r.cost_price ?? "",
      "Kar":            (r.unit_price ?? 0) - (r.cost_price ?? 0),
      "Ödeme Şekli":    r.payment_type ?? "",
      "Açıklama":       r.notes ?? "",
      "Statü":          r.status === "TAMAMLANDI" ? "Tamamlandı" : "Beklemede",
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);

    ws["!cols"] = [
      { wch: 10 }, { wch: 12 }, { wch: 20 }, { wch: 12 }, { wch: 20 },
      { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 6 }, { wch: 12 },
      { wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 24 }, { wch: 12 },
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Sipariş Listesi");

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const date = new Date().toISOString().split("T")[0];

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="siparisler-${date}.xlsx"`,
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
