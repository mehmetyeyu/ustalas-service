import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getAppSettings } from "@/lib/settings";
import { isValidPaymentType, flatPaymentOptions } from "@/lib/paymentTypes";
import { applyKasaLinkChange } from "@/lib/kasalar";

// Kasa sayfasındaki "Kasaları Yönet" ile oluşturulan fiziksel kasa dizini
// (ör. "Nazım Kasa", "Sait Kasa") — suppliers'ın aksine serbest metin upsert
// değil, gerçek FK'li bir seçim listesi. Ayrı bir "kasalar" izin kaynağı YOK,
// mevcut kasa.manage izni kullanılır (bkz. src/lib/permissions.ts).
export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "kasa.view")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const result = await pool.query(
      "SELECT id, name, linked_payment_type FROM kasalar WHERE tenant_id = $1 ORDER BY name",
      [user.tenantId]
    );
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}

// Bir ödeme tipinin bir kasaya bağlanabilmesi için: tenant'ın Genel
// Ayarlar'daki gerçek listesinde bulunmalı, "Nakit" (kendi çoklu-kasa/manuel
// seçim mekanizması var) ve "Cari" (nakit hareketi temsil etmiyor, bkz.
// src/lib/customerLedger.ts'teki aynı hariç tutma) OLAMAZ.
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

class InvalidLinkedPaymentTypeError extends Error {}

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "kasa.manage")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
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
      // Aynı isimli kasa zaten varsa (ON CONFLICT upsert), backfill'in doğru
      // çalışması için ÖNCEKİ bağlı ödeme tipini almamız gerekiyor.
      const existing = await client.query<{ linked_payment_type: string | null }>(
        "SELECT linked_payment_type FROM kasalar WHERE tenant_id = $1 AND name = $2",
        [user.tenantId, String(name).trim()]
      );
      const oldLinkedType = existing.rows[0]?.linked_payment_type ?? null;

      const result = await client.query<{ id: number; name: string; linked_payment_type: string | null }>(
        `INSERT INTO kasalar (tenant_id, name, linked_payment_type) VALUES ($1, $2, $3)
         ON CONFLICT (tenant_id, name) DO UPDATE SET name = EXCLUDED.name, linked_payment_type = EXCLUDED.linked_payment_type
         RETURNING id, name, linked_payment_type`,
        [user.tenantId, String(name).trim(), linkedPaymentType]
      );
      const kasa = result.rows[0];
      await applyKasaLinkChange(client, user.tenantId!, kasa.id, oldLinkedType, linkedPaymentType);
      await client.query("COMMIT");
      return NextResponse.json(kasa, { status: 201 });
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
