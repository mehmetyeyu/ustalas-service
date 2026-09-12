import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getAppSettings } from "@/lib/settings";
import { isValidPaymentType, flatPaymentOptions } from "@/lib/paymentTypes";
import { applyKasaLinkChange } from "@/lib/kasalar";

class InvalidLinkedPaymentTypeError extends Error {}

// Bkz. src/app/api/kasalar/route.ts (POST) — aynı doğrulama, iki dosyada
// ayrı tutulan küçük bir yardımcı (paylaşılan bir lib'e taşımayı gerektirecek
// kadar büyük değil).
async function validateLinkedPaymentType(tenantId: number, linkedPaymentType: unknown): Promise<string | null> {
  if (linkedPaymentType == null || linkedPaymentType === "") return null;
  const trimmed = String(linkedPaymentType).trim();
  if (trimmed === "Nakit" || trimmed === "Cari") {
    throw new InvalidLinkedPaymentTypeError("Bu ödeme tipi bir kasaya bağlanamaz.");
  }
  const { payment_types } = await getAppSettings(tenantId);
  if (!isValidPaymentType(trimmed, flatPaymentOptions(payment_types))) {
    throw new InvalidLinkedPaymentTypeError("Geçersiz ödeme tipi.");
  }
  return trimmed;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "kasa.manage")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const { id } = await params;
    const { name, linked_payment_type } = await request.json();
    if (!name || !String(name).trim()) {
      return NextResponse.json({ error: "Kasa adı zorunludur." }, { status: 400 });
    }

    let linkedPaymentType: string | null;
    try {
      linkedPaymentType = await validateLinkedPaymentType(user.tenantId!, linked_payment_type);
    } catch (err) {
      if (err instanceof InvalidLinkedPaymentTypeError) return NextResponse.json({ error: err.message }, { status: 400 });
      throw err;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query<{ linked_payment_type: string | null }>(
        "SELECT linked_payment_type FROM kasalar WHERE id = $1 AND tenant_id = $2",
        [id, user.tenantId]
      );
      if (existing.rows.length === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Kasa bulunamadı." }, { status: 404 });
      }
      const oldLinkedType = existing.rows[0].linked_payment_type;

      await client.query(
        "UPDATE kasalar SET name = $1, linked_payment_type = $2 WHERE id = $3 AND tenant_id = $4",
        [String(name).trim(), linkedPaymentType, id, user.tenantId]
      );
      await applyKasaLinkChange(client, user.tenantId!, Number(id), oldLinkedType, linkedPaymentType);
      await client.query("COMMIT");
      return NextResponse.json({ success: true });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && error.code === "23505") {
      const constraint = "constraint" in error ? String(error.constraint) : "";
      if (constraint === "kasalar_tenant_linked_payment_type_unique") {
        return NextResponse.json({ error: "Bu ödeme tipi zaten başka bir kasaya bağlı." }, { status: 400 });
      }
      return NextResponse.json({ error: "Bu isimde bir kasa zaten var." }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "kasa.manage")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const { id } = await params;
    const result = await pool.query("DELETE FROM kasalar WHERE id = $1 AND tenant_id = $2", [id, user.tenantId]);
    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Kasa bulunamadı." }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    // FK RESTRICT: bu kasaya bağlı geçmiş hareket (sipariş/masraf/Cari/manuel)
    // varsa Postgres 23503 döner — kasıtlı olarak sessizce "Atanmamış"a
    // düşürülmez (bkz. plan), kullanıcıya anlaşılır bir hata gösterilir.
    if (error && typeof error === "object" && "code" in error && error.code === "23503") {
      return NextResponse.json({ error: "Bu kasaya bağlı hareketler var, silinemez." }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
