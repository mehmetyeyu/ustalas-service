import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { logAudit } from "@/lib/auditLog";
import { computeQuoteTotals, isQuoteLocked, QUOTE_STATUS_LABELS, type QuoteStatus, type VatMode, type VatRate } from "@/lib/quotes";
import { parseQuoteInput, writeQuoteLines, QuoteValidationError, isFkViolation } from "@/lib/quoteStore";

const TODAY_SQL = "(NOW() AT TIME ZONE 'Europe/Istanbul')::date";

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "quotes.view")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });
  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ error: "Teklif bulunamadı." }, { status: 404 });

  try {
    const [quoteResult, linesResult] = await Promise.all([
      pool.query(
        `SELECT q.id, q.quote_no, q.customer_name, q.customer_phone, q.plate, q.status, q.vat_mode, q.vat_rate,
                to_char(q.valid_until, 'YYYY-MM-DD') AS valid_until, q.notes, q.total_amount::float AS total_amount,
                q.order_id, q.converted_at, q.created_at, q.updated_at, u.username AS created_by_name,
                (q.status IN ('TASLAK', 'GONDERILDI') AND q.valid_until < ${TODAY_SQL}) AS expired,
                o.custom_order_no
         FROM quotes q
         LEFT JOIN users u ON u.id = q.created_by
         LEFT JOIN orders o ON o.id = q.order_id AND o.tenant_id = q.tenant_id
         WHERE q.id = $1 AND q.tenant_id = $2`,
        [id, user.tenantId]
      ),
      pool.query(
        `SELECT ql.id, s.name AS service_name, s.tracks_size, ql.product_id, ql.supplier, ql.stock_code, ql.size_desc,
                ql.brand, ql.model_name, ql.quantity, ql.unit_price::float AS unit_price,
                ql.line_total::float AS line_total, ql.cost_total::float AS cost_total
         FROM quote_lines ql
         JOIN services s ON s.id = ql.service_id
         WHERE ql.quote_id = $1 AND ql.tenant_id = $2
         ORDER BY ql.position, ql.id`,
        [id, user.tenantId]
      ),
    ]);
    const quote = quoteResult.rows[0];
    if (!quote) return NextResponse.json({ error: "Teklif bulunamadı." }, { status: 404 });
    // Maliyet/kâr yalnızca izinli kullanıcıya — istemcide gizlemek yetmez,
    // yanıtta hiç olmamalı.
    const canViewCost = hasPermission(user, "quotes.view_cost");
    const lines = linesResult.rows.map((l) => (canViewCost ? l : { ...l, cost_total: undefined }));
    const totals = computeQuoteTotals(lines, quote.vat_mode as VatMode, quote.vat_rate as VatRate);
    return NextResponse.json({ ...quote, lines, totals, can_view_cost: canViewCost });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}

// Teklifin tamamını (başlık + satırlar) günceller. Siparişe dönüşmüş teklif
// kilitlidir (bkz. isQuoteLocked) — FOR UPDATE ile eşzamanlı bir
// dönüştürmeyle yarışmaz.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "quotes.edit")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });
  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ error: "Teklif bulunamadı." }, { status: 404 });

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
      const current = await client.query<{ status: QuoteStatus; quote_no: string }>(
        "SELECT status, quote_no FROM quotes WHERE id = $1 AND tenant_id = $2 FOR UPDATE",
        [id, user.tenantId]
      );
      if (!current.rows[0]) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Teklif bulunamadı." }, { status: 404 });
      }
      if (isQuoteLocked(current.rows[0].status)) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Siparişe dönüştürülmüş teklif değiştirilemez." }, { status: 409 });
      }
      await client.query(
        `UPDATE quotes SET customer_name=$1, customer_phone=$2, plate=$3, notes=$4, vat_mode=$5, vat_rate=$6,
                valid_until=$7, total_amount=$8, updated_at=NOW()
         WHERE id=$9 AND tenant_id=$10`,
        [input.customer_name, input.customer_phone, input.plate, input.notes, input.vat_mode, input.vat_rate,
          input.valid_until, input.total, id, user.tenantId]
      );
      await writeQuoteLines(client, user.tenantId!, id, input.lines, hasPermission(user, "quotes.view_cost"));
      await client.query("COMMIT");
      await logAudit({
        tenantId: user.tenantId!, userId: user.userId, username: user.username,
        action: "quote.update", tableName: "quotes", recordId: id,
        detail: `${current.rows[0].quote_no}, Tutar: ${input.total}`,
      });
      return NextResponse.json({ id });
    } catch (err) {
      await client.query("ROLLBACK");
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

// Durum değişikliği (Gönderildi / Kabul / Red / Taslağa geri al). SIPARIS
// buradan verilemez — sadece "Siparişe Dönüştür" ile olur (sipariş açılmadan
// teklif "dönüştü" görünmesin).
const SETTABLE_STATUSES: QuoteStatus[] = ["TASLAK", "GONDERILDI", "KABUL", "RED"];

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "quotes.edit")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });
  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ error: "Teklif bulunamadı." }, { status: 404 });

  try {
    const { status } = await request.json().catch(() => ({}));
    if (!SETTABLE_STATUSES.includes(status)) return NextResponse.json({ error: "Geçersiz durum." }, { status: 400 });
    // Kilit kontrolü UPDATE'in kendi koşulunda — ayrı bir SELECT'le yarışmaz.
    const result = await pool.query<{ quote_no: string }>(
      "UPDATE quotes SET status=$1, updated_at=NOW() WHERE id=$2 AND tenant_id=$3 AND status <> 'SIPARIS' RETURNING quote_no",
      [status, id, user.tenantId]
    );
    if (!result.rows[0]) {
      const exists = await pool.query("SELECT 1 FROM quotes WHERE id=$1 AND tenant_id=$2", [id, user.tenantId]);
      return exists.rows[0]
        ? NextResponse.json({ error: "Siparişe dönüştürülmüş teklifin durumu değiştirilemez." }, { status: 409 })
        : NextResponse.json({ error: "Teklif bulunamadı." }, { status: 404 });
    }
    await logAudit({
      tenantId: user.tenantId!, userId: user.userId, username: user.username,
      action: "quote.status", tableName: "quotes", recordId: id,
      detail: `${result.rows[0].quote_no} → ${QUOTE_STATUS_LABELS[status as QuoteStatus]}`,
    });
    return NextResponse.json({ id, status });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}

// Siparişe dönüşmüş teklif silinemez — siparişin hangi tekliften geldiği
// izi kaybolmasın. Diğerleri satırlarıyla birlikte silinir (CASCADE).
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "quotes.delete")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });
  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ error: "Teklif bulunamadı." }, { status: 404 });

  try {
    const result = await pool.query<{ quote_no: string }>(
      "DELETE FROM quotes WHERE id=$1 AND tenant_id=$2 AND status <> 'SIPARIS' RETURNING quote_no",
      [id, user.tenantId]
    );
    if (!result.rows[0]) {
      const exists = await pool.query("SELECT 1 FROM quotes WHERE id=$1 AND tenant_id=$2", [id, user.tenantId]);
      return exists.rows[0]
        ? NextResponse.json({ error: "Siparişe dönüştürülmüş teklif silinemez." }, { status: 409 })
        : NextResponse.json({ error: "Teklif bulunamadı." }, { status: 404 });
    }
    await logAudit({
      tenantId: user.tenantId!, userId: user.userId, username: user.username,
      action: "quote.delete", tableName: "quotes", recordId: id, detail: result.rows[0].quote_no,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
