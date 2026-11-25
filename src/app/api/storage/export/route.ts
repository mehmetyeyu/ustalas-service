import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import * as XLSX from "xlsx";
import { sanitizeExcelRow } from "@/lib/excelSafety";
import { getAppSettings } from "@/lib/settings";
import { parseStorageFilters, buildStorageQuery } from "@/lib/storageFilters";
import { describeStorageTire, rftLabel, type StorageTire } from "@/lib/storageTires";
import { STORAGE_EXCEL_COLUMNS, formatIslemTarihi } from "@/lib/storageExcel";

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "storage.view")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    // Ekrandaki filtrelerle aynı koşullar (bkz. src/lib/storageFilters.ts);
    // parametresiz çağrı eskisi gibi tüm aktif kayıtları verir.
    const filters = parseStorageFilters(new URL(request.url).searchParams);
    const overdueMonths = filters.overdue ? (await getAppSettings(user.tenantId!)).storage_overdue_months : 0;
    const { where, values, orderBy } = buildStorageQuery(filters, user.tenantId!, overdueMonths);
    const result = await pool.query(`SELECT * FROM storage${where}${orderBy}`, values);

    // Sütunlar Şablon ile aynı (bkz. src/lib/storageExcel.ts) — dışa aktarılan
    // dosya düzenlenip aynen geri yüklenebilir. Lastik Detayı içe aktarmada
    // yok sayılır (konum ayrıntısı Excel'den değiştirilemez); Teslim Edilenler
    // dışa aktarımına eklenen teslim sütunları da öyle.
    const rows = result.rows.map((r) => {
      const values: Record<string, unknown> = {
        ...r,
        production_week_year: r.production_week != null && r.production_year != null
          ? `${String(r.production_week).padStart(2, "0")}/${String(r.production_year).slice(-2)}`
          : "",
        islem_tarihi: formatIslemTarihi(r.islem_tarihi),
        rft: rftLabel(r) === "RFT (kısmi)" ? "Kısmi" : r.rft ? "Evet" : "Hayır",
        jantli: r.jantli ? "Evet" : "Hayır",
      };
      return sanitizeExcelRow({
        ...Object.fromEntries(STORAGE_EXCEL_COLUMNS.map((c) => [c.header, values[c.key] ?? ""])),
        "Lastik Detayı": Array.isArray(r.lastikler)
          ? (r.lastikler as StorageTire[]).map((t) => `${t.konum}: ${describeStorageTire(t)}`).join(" | ")
          : "",
        ...(filters.delivered
          ? { "Teslim Tarihi": formatIslemTarihi(r.teslim_tarihi), "Teslim Açıklaması": r.teslim_aciklama ?? "" }
          : {}),
      });
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [...STORAGE_EXCEL_COLUMNS.map((c) => ({ wch: c.width })), { wch: 60 }, { wch: 14 }, { wch: 40 }];

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
