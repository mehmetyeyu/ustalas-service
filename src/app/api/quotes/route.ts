import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { logAudit } from "@/lib/auditLog";
import { nextQuoteNo, type QuoteNoFormat } from "@/lib/quotes";
import { parseQuoteInput, writeQuoteLines, QuoteValidationError, isFkViolation } from "@/lib/quoteStore";

// Liste sekmeleri: "" (tümü), KABUL/RED/SIPARIS, "acik" (henüz sonuçlanmamış: Taslak +
// Gönderildi, süresi dolmamış) veya "suresi_doldu" (açık ama geçerlilik günü
// geçmiş — saklanan bir durum değil, bkz. src/lib/quotes.ts isQuoteExpired).
// Bugün Türkiye saatine göre.
const TODAY_SQL = "(NOW() AT TIME ZONE 'Europe/Istanbul')::date";

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "quotes.view")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "25") || 25));
  const status = searchParams.get("status") ?? "";
  const q = (searchParams.get("q") ?? "").trim().slice(0, 100);

  const conditions = ["q.tenant_id = $1"];
  const values: unknown[] = [user.tenantId];
  if (q) {
    values.push(`%${q}%`);
    const p = `$${values.length}`;
    conditions.push(`(q.quote_no ILIKE ${p} OR q.customer_name ILIKE ${p} OR q.plate ILIKE ${p} OR q.customer_phone ILIKE ${p})`);
  }
  // Sekme sayıları arama koşuluyla, ama sekme (durum) koşulu olmadan sayılır.
  const countWhere = conditions.join(" AND ");
  const countValues = [...values];
  if (status === "acik") {
    conditions.push(`q.status IN ('TASLAK', 'GONDERILDI') AND q.valid_until >= ${TODAY_SQL}`);
  } else if (status === "suresi_doldu") {
    conditions.push(`q.status IN ('TASLAK', 'GONDERILDI') AND q.valid_until < ${TODAY_SQL}`);
  } else if (["KABUL", "RED", "SIPARIS"].includes(status)) {
    values.push(status);
    conditions.push(`q.status = $${values.length}`);
  }
  const where = conditions.join(" AND ");

  try {
    const [itemsResult, countResult] = await Promise.all([
      pool.query(
        // Sayfa önce (iç sorguda, quotes_tenant_created_idx üzerinden) kesilir,
        // orders birleşimi sadece o 25 satıra yapılır — birleşim dışarıdayken
        // derin sayfalarda planlayıcı orders'ı baştan sona tarıyordu
        // (20.000 teklifte son sayfa ~93 ms; ölçüm 2026-10-29).
        `SELECT q.id, q.quote_no, q.customer_name, q.customer_phone, q.plate, q.status,
                q.vat_mode, q.vat_rate, to_char(q.valid_until, 'YYYY-MM-DD') AS valid_until,
                q.total_amount::float AS total_amount, q.order_id, q.created_at,
                (q.status IN ('TASLAK', 'GONDERILDI') AND q.valid_until < ${TODAY_SQL}) AS expired,
                o.custom_order_no
         FROM (
           SELECT * FROM quotes q
           WHERE ${where}
           ORDER BY q.created_at DESC, q.id DESC
           LIMIT $${values.length + 1} OFFSET $${values.length + 2}
         ) q
         LEFT JOIN orders o ON o.id = q.order_id AND o.tenant_id = q.tenant_id
         ORDER BY q.created_at DESC, q.id DESC`,
        [...values, limit, (page - 1) * limit]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS all,
                COUNT(*) FILTER (WHERE q.status IN ('TASLAK', 'GONDERILDI') AND q.valid_until >= ${TODAY_SQL})::int AS acik,
                COUNT(*) FILTER (WHERE q.status IN ('TASLAK', 'GONDERILDI') AND q.valid_until < ${TODAY_SQL})::int AS suresi_doldu,
                COUNT(*) FILTER (WHERE q.status = 'KABUL')::int AS "KABUL",
                COUNT(*) FILTER (WHERE q.status = 'RED')::int AS "RED",
                COUNT(*) FILTER (WHERE q.status = 'SIPARIS')::int AS "SIPARIS"
         FROM quotes q WHERE ${countWhere}`,
        countValues
      ),
    ]);
    const counts = countResult.rows[0] as Record<string, number>;
    const total = counts[status] ?? counts.all;
    return NextResponse.json({ items: itemsResult.rows, counts, total, page, limit });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "quotes.create")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    let input;
    try {
      input = parseQuoteInput(await request.json());
    } catch (err) {
      if (err instanceof QuoteValidationError) return NextResponse.json({ error: err.message }, { status: 400 });
      // request.json() bozuk gövdede SyntaxError atar — sunucu hatası değil.
      if (err instanceof SyntaxError) return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
      throw err;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const fmt = await client.query<{ quote_no_format: QuoteNoFormat }>(
        "SELECT quote_no_format FROM app_settings WHERE tenant_id = $1",
        [user.tenantId]
      );
      const quoteNo = await nextQuoteNo(client, user.tenantId!, fmt.rows[0]?.quote_no_format ?? "simple");
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO quotes (tenant_id, quote_no, customer_name, customer_phone, plate, notes, vat_mode, vat_rate, valid_until, total_amount, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
        [user.tenantId, quoteNo, input.customer_name, input.customer_phone, input.plate, input.notes,
          input.vat_mode, input.vat_rate, input.valid_until, input.total, user.userId]
      );
      const quoteId = inserted.rows[0].id;
      await writeQuoteLines(client, user.tenantId!, quoteId, input.lines, hasPermission(user, "quotes.view_cost"));
      await client.query("COMMIT");
      await logAudit({
        tenantId: user.tenantId!, userId: user.userId, username: user.username,
        action: "quote.create", tableName: "quotes", recordId: quoteId,
        detail: `${quoteNo}, Müşteri: ${input.customer_name || input.plate}, Tutar: ${input.total}`,
      });
      return NextResponse.json({ id: quoteId, quote_no: quoteNo }, { status: 201 });
    } catch (err) {
      await client.query("ROLLBACK");
      // Seçili parti bu arada silinmiş (quote_lines_product_tenant_fk).
      if (isFkViolation(err)) return NextResponse.json({ error: "Seçili ürün partisi bulunamadı, satırı yeniden seçin." }, { status: 400 });
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
