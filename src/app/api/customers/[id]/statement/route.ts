import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { sanitizeExcelRow, sanitizeExcelCell } from "@/lib/excelSafety";
import { formatPlate, isValidTrPlate } from "@/lib/plate";
import { plateNormalizeSql } from "@/lib/vehicles";
import { parseStatementMonth, statementExcelSheet, statementFileName, statementOpenItems, statementOpenItemsSheet, STATEMENT_EXCEL_WIDTHS, STATEMENT_OPEN_WIDTHS, type Statement, type StatementEntry, type StatementOpeningRow } from "@/lib/statement";
import { DEFAULT_ORDER_LINE_DISPLAY, sanitizeOrderLineDisplay } from "@/lib/orderLineDisplay";

// Tarihler gg.aa.yyyy, tutarlar 1.234,56 (Excel'in yerel ayarıyla) — metin
// değil gerçek tarih/sayı: sıralama ve toplama çalışır.
function formatCells(ws: XLSX.WorkSheet) {
  for (const ref of Object.keys(ws)) {
    if (ref.startsWith("!")) continue;
    const cell = ws[ref] as XLSX.CellObject;
    if (cell.t === "d") cell.z = "dd.mm.yyyy";
    else if (cell.t === "n") cell.z = "#,##0.00";
  }
}

// Aylık cari ekstre (bkz. src/lib/statement.ts). ?month=YYYY-MM, ?format=xlsx
// Excel indirir. Cari hareketleri ve sipariş tutarları içerdiği için
// /ledger ile aynı izinler: customers.view + orders.view.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "customers.view") || !hasPermission(user, "orders.view")) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });
  }

  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Müşteri bulunamadı." }, { status: 404 });
  const period = parseStatementMonth(request.nextUrl.searchParams.get("month"));
  if (!period) return NextResponse.json({ error: "Geçersiz dönem (YYYY-AA)." }, { status: 400 });

  try {
    // Risk (Cari) Limiti ve firmanın ürün satırı gösterimi aynı sorguda.
    const customerResult = await pool.query<Statement["customer"] & { order_line_display: string[] | null }>(
      `SELECT c.id, c.name, c.phone, c.tax_no, c.contact_name, c.credit_limit::float AS credit_limit, a.order_line_display
       FROM customers c LEFT JOIN app_settings a ON a.tenant_id = c.tenant_id
       WHERE c.id = $1 AND c.tenant_id = $2`,
      [id, user.tenantId]
    );
    const customerRow = customerResult.rows[0];
    if (!customerRow) return NextResponse.json({ error: "Müşteri bulunamadı." }, { status: 404 });
    const { order_line_display, ...customer } = customerRow;

    const [openingResult, entriesResult, vehiclesResult] = await Promise.all([
      // Ay başından önceki tüm hareketler: devreden bakiye ve onu oluşturan
      // ödenmemiş kalemler (FIFO) aynı satırlardan. Müşteri başına hareket
      // sayısı küçük (prod 2026-10: en çok 14); özet yalnızca borç satırına.
      pool.query<StatementOpeningRow>(
        `SELECT cle.id, cle.entry_date::text AS entry_date, cle.entry_type, cle.direction,
                cle.amount::float AS amount, cle.note, cle.order_id,
                o.custom_order_no AS order_no, o.plate,
                CASE WHEN cle.direction = 1 AND cle.order_id IS NOT NULL THEN
                  (SELECT string_agg(s.name || CASE WHEN os.quantity > 1 THEN ' ×' || os.quantity ELSE '' END
                                     || COALESCE(' ' || os.size_desc, ''), ', ' ORDER BY os.id)
                     FROM order_services os JOIN services s ON s.id = os.service_id
                    WHERE os.order_id = cle.order_id AND os.tenant_id = cle.tenant_id)
                END AS summary
         FROM customer_ledger_entries cle
         LEFT JOIN orders o ON o.id = cle.order_id AND o.tenant_id = cle.tenant_id
         WHERE cle.tenant_id = $1 AND cle.customer_id = $2 AND cle.entry_date < $3::date
         ORDER BY cle.entry_date, cle.id`,
        [user.tenantId, customer.id, period.start]
      ),
      // Cari hareketlerin tarihi entry_date (takvim günü, bkz. Bölüm 13).
      pool.query<Omit<StatementEntry, "running_balance"> & { delta: number }>(
        `SELECT cle.id, cle.entry_date::text AS entry_date, cle.entry_type, cle.direction,
                cle.amount::float AS amount, cle.payment_type, cle.note, cle.order_id,
                o.custom_order_no AS order_no, o.plate, o.driver_name,
                o.customer_name, o.notes AS order_notes,
                (SELECT string_agg(s.name || CASE WHEN os.quantity > 1 THEN ' ×' || os.quantity ELSE '' END
                                   || COALESCE(' ' || os.size_desc, ''), ', ' ORDER BY os.id)
                   FROM order_services os JOIN services s ON s.id = os.service_id
                  WHERE os.order_id = cle.order_id AND os.tenant_id = cle.tenant_id) AS summary,
                -- Excel "Ürün & Hizmet": satırların tüm alanları (gösterim firma tercihi).
                (SELECT json_agg(json_build_object(
                          'service', s.name, 'size_desc', os.size_desc, 'brand', os.brand, 'model_name', os.model_name,
                          'quantity', os.quantity, 'stock_code', os.stock_code, 'supplier', os.supplier) ORDER BY os.id)
                   FROM order_services os JOIN services s ON s.id = os.service_id
                  WHERE os.order_id = cle.order_id AND os.tenant_id = cle.tenant_id) AS lines
         FROM customer_ledger_entries cle
         LEFT JOIN orders o ON o.id = cle.order_id AND o.tenant_id = cle.tenant_id
         WHERE cle.tenant_id = $1 AND cle.customer_id = $2
           AND cle.entry_date >= $3::date AND cle.entry_date < $4::date
         ORDER BY cle.entry_date, cle.id`,
        [user.tenantId, customer.id, period.start, period.next]
      ),
      // Tamamlanmış siparişler (bekleyenler henüz ekstre konusu değil);
      // created_at UTC (zamansız) — ay sınırı İstanbul'a göre.
      pool.query<{ p: string; raw: string | null; order_count: number; total: number }>(
        `SELECT ${plateNormalizeSql("o.plate")} AS p, MIN(o.plate) AS raw, COUNT(*)::int AS order_count,
                COALESCE(SUM(COALESCE(o.paid_amount, o.total_amount)), 0)::float AS total
         FROM orders o
         WHERE o.tenant_id = $1 AND o.customer_name = $2 AND o.status = 'TAMAMLANDI'
           AND o.created_at >= ($3::timestamp AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'UTC'
           AND o.created_at < ($4::timestamp AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'UTC'
         GROUP BY 1
         ORDER BY total DESC`,
        [user.tenantId, customer.name, period.start, period.next]
      ),
    ]);

    const openingRows = openingResult.rows;
    const opening = Math.round(openingRows.reduce((t, r) => t + r.amount * r.direction, 0) * 100) / 100;
    let running = opening;
    let totalDebt = 0;
    let totalCredit = 0;
    const entries: StatementEntry[] = entriesResult.rows.map((e) => {
      running += e.amount * e.direction;
      if (e.direction === 1) totalDebt += e.amount; else totalCredit += e.amount;
      return { ...e, running_balance: Math.round(running * 100) / 100 };
    });
    const vehicles = vehiclesResult.rows.map((v) => ({
      plate: v.p ? (isValidTrPlate(v.p) ? formatPlate(v.p) : v.raw || v.p) : "Plakasız",
      order_count: v.order_count,
      total: v.total,
    }));
    const statement: Statement = {
      customer,
      month: period.month,
      opening_balance: opening,
      closing_balance: Math.round(running * 100) / 100,
      total_debt: Math.round(totalDebt * 100) / 100,
      total_credit: Math.round(totalCredit * 100) / 100,
      entries,
      opening_items: statementOpenItems(openingRows),
      vehicles,
      orders_total: Math.round(vehicles.reduce((s, v) => s + v.total, 0) * 100) / 100,
      order_count: vehicles.reduce((s, v) => s + v.order_count, 0),
      line_display: sanitizeOrderLineDisplay(order_line_display) ?? DEFAULT_ORDER_LINE_DISPLAY,
    };

    if (request.nextUrl.searchParams.get("format") === "xlsx") {
      const wb = XLSX.utils.book_new();
      const { rows, tableHeaderRow } = statementExcelSheet(statement);
      const ws = XLSX.utils.aoa_to_sheet(rows.map((r) => r.map(sanitizeExcelCell)), { cellDates: true });
      formatCells(ws);
      ws["!cols"] = STATEMENT_EXCEL_WIDTHS.map((wch) => ({ wch }));
      // Tablo başlığından son satıra süzgeç (bilgi bloğu hariç).
      ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: tableHeaderRow, c: 0 }, e: { r: rows.length - 1, c: STATEMENT_EXCEL_WIDTHS.length - 1 } }) };
      XLSX.utils.book_append_sheet(wb, ws, "Cari Hareketler");
      if (statement.opening_items.length > 0) {
        const os = XLSX.utils.aoa_to_sheet(statementOpenItemsSheet(statement).map((r) => r.map(sanitizeExcelCell)), { cellDates: true });
        formatCells(os);
        os["!cols"] = STATEMENT_OPEN_WIDTHS.map((wch) => ({ wch }));
        XLSX.utils.book_append_sheet(wb, os, "Devreden Detay");
      }
      if (vehicles.length > 0) {
        const vs = XLSX.utils.json_to_sheet(vehicles.map((v) => sanitizeExcelRow({ Plaka: v.plate, Sipariş: v.order_count, Tutar: v.total })));
        vs["!cols"] = [{ wch: 14 }, { wch: 10 }, { wch: 14 }];
        XLSX.utils.book_append_sheet(wb, vs, "Araçlar");
      }
      const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      const { ascii, utf8 } = statementFileName(customer.name, period.month);
      return new NextResponse(buffer, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          // filename: eski istemciler için ASCII; filename*: Türkçe adla (RFC 5987).
          "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(utf8)}`,
        },
      });
    }
    return NextResponse.json(statement);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
