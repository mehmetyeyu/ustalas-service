import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { logAudit } from "@/lib/auditLog";
import { InsufficientStockError } from "@/lib/productStock";
import { convertQuoteToOrder, QuoteConvertError } from "@/lib/quoteStore";

// Teklif → sipariş. Kurallar src/lib/quoteStore.ts convertQuoteToOrder'da.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "quotes.convert")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Teklif bulunamadı." }, { status: 404 });

  try {
    const body = await request.json().catch(() => ({}));
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await convertQuoteToOrder(client, user.tenantId!, id, { plate: body.plate, customOrderNo: body.custom_order_no });
      await client.query("COMMIT");
      await logAudit({
        tenantId: user.tenantId!, userId: user.userId, username: user.username,
        action: "quote.convert", tableName: "quotes", recordId: id,
        detail: `${result.quoteNo} → Sipariş #${result.orderId}, Tutar: ${result.total}`,
      });
      await logAudit({
        tenantId: user.tenantId!, userId: user.userId, username: user.username,
        action: "order.create", tableName: "orders", recordId: result.orderId,
        detail: `Teklif: ${result.quoteNo}, Tutar: ${result.total}`,
      });
      return NextResponse.json({ order_id: result.orderId }, { status: 201 });
    } catch (err) {
      await client.query("ROLLBACK");
      if (err instanceof QuoteConvertError) return NextResponse.json({ error: err.message }, { status: err.status });
      if (err instanceof InsufficientStockError) return NextResponse.json({ error: err.message }, { status: 400 });
      // orders_tenant_custom_order_no_unique — POST /api/orders ile aynı.
      if (err && typeof err === "object" && "code" in err && err.code === "23505") {
        return NextResponse.json({ error: "Bu sipariş numarası zaten kullanılıyor." }, { status: 409 });
      }
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
