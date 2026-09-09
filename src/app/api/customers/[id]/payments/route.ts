import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getAppSettings } from "@/lib/settings";
import { isValidPaymentType, flatPaymentOptions } from "@/lib/paymentTypes";

// Müşteriler ekranındaki "Tahsilat Al / Borç Ekle" — bağımsız bir cari
// hareketi (herhangi bir siparişe bağlı DEĞİL, bkz. src/lib/customerLedger.ts
// dosya başı yorumu: KOBİ muhasebe pratiğinde tahsilat belirli bir faturaya
// değil genel bakiyeye karşı düşer). direction=-1 (Tahsilat Al) gerçek
// nakit/POS/havale girişidir — Kasa raporuna yansıması için ödeme şekli
// zorunludur; "Cari" burada seçilemez (bir Cari borcunu yine Cari ile "tahsil
// etmek" döngüsel olurdu). direction=1 (Borç Ekle) salt bir bakiye
// düzeltmesi/açılış bakiyesidir, gerçek bir nakit hareketi değildir.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "customers.manage_balance")) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const direction = Number(body.direction);
    const amount = Number(body.amount);
    const paymentType = body.payment_type ? String(body.payment_type).trim() : null;
    const entryDate = body.entry_date ? String(body.entry_date).trim() : null;
    const note = body.note ? String(body.note).trim() : null;

    if (direction !== 1 && direction !== -1) {
      return NextResponse.json({ error: "Geçersiz yön." }, { status: 400 });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Geçersiz tutar." }, { status: 400 });
    }

    if (direction === -1) {
      // Tahsilat Al: gerçek bir ödeme şekli zorunlu, Kasa raporuna yansır.
      const { payment_types } = await getAppSettings(user.tenantId!);
      const options = flatPaymentOptions(payment_types).filter((t) => t !== "Cari");
      if (!paymentType || !isValidPaymentType(paymentType, options)) {
        return NextResponse.json({ error: "Geçersiz ödeme şekli." }, { status: 400 });
      }
    }

    const customerResult = await pool.query<{ id: number }>(
      "SELECT id FROM customers WHERE id = $1 AND tenant_id = $2",
      [id, user.tenantId]
    );
    if (customerResult.rows.length === 0) {
      return NextResponse.json({ error: "Müşteri bulunamadı." }, { status: 404 });
    }

    const result = await pool.query<{ id: number }>(
      `INSERT INTO customer_ledger_entries
         (tenant_id, customer_id, entry_type, direction, amount, payment_type, entry_date, note, created_by)
       VALUES ($1, $2, 'MANUEL', $3, $4, $5, COALESCE($6::date, CURRENT_DATE), $7, $8)
       RETURNING id`,
      [
        user.tenantId, id, direction, amount,
        direction === -1 ? paymentType : null,
        entryDate, note, user.userId,
      ]
    );

    return NextResponse.json({ id: result.rows[0].id }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
