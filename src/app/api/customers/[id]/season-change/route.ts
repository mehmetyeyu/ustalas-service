import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { logAudit } from "@/lib/auditLog";
import { linkVehicle } from "@/lib/vehicles";
import { resolveServiceIds } from "@/lib/serviceCatalog";
import { getCustomOrderNoEnabled } from "@/lib/settings";
import { todayIstanbul } from "@/lib/quotes";
import { parseSeasonChangeInput, SeasonChangeValidationError } from "@/lib/seasonChange";

class SeasonChangeError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

// Toplu mevsim değişimi (Filo Faz 2) — kurumsal müşterinin depodaki
// lastikleri tek işlemde: her seçilen kayıtta tekli "Değişim Yap" (POST
// /api/storage/[id]/degisim) ile aynı model — eski kayıt teslim edilir, aynı
// depo no/plaka/müşteriyle araçtan çıkan lastiğin kaydı açılır. İsteğe bağlı
// olarak her araç için seçilen hizmetle bir sipariş (BEKLEMEDE) açılır
// (kullanıcı kararı: seçenek olarak). Hepsi tek transaction: biri hata
// verirse hiçbiri yapılmaz.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "storage.edit")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Müşteri bulunamadı." }, { status: 404 });

  let input;
  try {
    input = parseSeasonChangeInput(await request.json().catch(() => null), todayIstanbul());
  } catch (e) {
    if (e instanceof SeasonChangeValidationError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const customerResult = await client.query<{ id: number; name: string; phone: string | null; is_corporate: boolean }>(
      "SELECT id, name, phone, is_corporate FROM customers WHERE id = $1 AND tenant_id = $2",
      [id, user.tenantId]
    );
    const customer = customerResult.rows[0];
    if (!customer) throw new SeasonChangeError("Müşteri bulunamadı.", 404);
    if (!customer.is_corporate) throw new SeasonChangeError("Toplu değişim yalnızca kurumsal müşteride yapılabilir.");

    const ids = input.items.map((i) => i.storage_id);
    // Kayıt bu firmanın olmalı: firmanın aracına bağlı ya da firma adıyla girilmiş.
    const storageResult = await client.query<{
      id: number; depo_no: number | null; plate: string | null; customer_name: string | null; phone: string | null; teslim_edildi: boolean;
    }>(
      `SELECT s.id, s.depo_no, s.plate, s.customer_name, s.phone, s.teslim_edildi
       FROM storage s
       WHERE s.tenant_id = $1 AND s.id = ANY($2::int[])
         AND (s.customer_name = $3
              OR s.vehicle_id IN (SELECT v.id FROM vehicles v WHERE v.tenant_id = $1 AND v.customer_id = $4))
       FOR UPDATE OF s`,
      [user.tenantId, ids, customer.name, customer.id]
    );
    const byId = new Map(storageResult.rows.map((r) => [r.id, r]));
    const missing = ids.filter((sid) => !byId.has(sid));
    if (missing.length > 0) throw new SeasonChangeError("Seçilen depo kayıtlarından bazıları bu firmaya ait değil ya da silinmiş.", 404);
    const delivered = storageResult.rows.filter((r) => r.teslim_edildi);
    if (delivered.length > 0) {
      throw new SeasonChangeError(`Depo No ${delivered.map((r) => r.depo_no ?? r.id).join(", ")} zaten teslim edilmiş — listeyi yenileyin.`, 409);
    }

    let serviceId: number | null = null;
    let customOrderNoEnabled = false;
    if (input.order) {
      serviceId = (await resolveServiceIds(client, user.tenantId!, [{ service_name: input.order.service_name }])).get(input.order.service_name)!;
      customOrderNoEnabled = await getCustomOrderNoEnabled(user.tenantId!);
      if (customOrderNoEnabled && input.items.some((i) => !i.custom_order_no)) {
        throw new SeasonChangeError("Elle Sipariş No açık — her araç için Sipariş No girin.");
      }
    }

    // Geçmiş bir işlem tarihi seçildiyse siparişler de o güne yazılır (POST
    // /api/orders order_date ile aynı: gün geçmişe alınır, saat "şimdi").
    let orderCreatedAt: Date | null = null;
    if (input.order && input.islem_tarihi !== todayIstanbul()) {
      const now = new Date();
      orderCreatedAt = new Date(input.islem_tarihi);
      orderCreatedAt.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
    }

    const newStorageIds: number[] = [];
    const orderIds: number[] = [];
    for (const item of input.items) {
      const old = byId.get(item.storage_id)!;
      await client.query(
        "UPDATE storage SET teslim_edildi = true, teslim_tarihi = $1 WHERE id = $2 AND tenant_id = $3",
        [input.islem_tarihi, old.id, user.tenantId]
      );
      const vehicleId = await linkVehicle(client, user.tenantId!, old.plate);
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO storage (tenant_id, depo_no, plate, customer_name, phone, ebat, marka, dis_derinligi, adet, mevsim, islem_tarihi, model_name, vehicle_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
        [user.tenantId, old.depo_no, old.plate, old.customer_name, old.phone, item.ebat, item.marka, item.dis_derinligi,
         item.adet, item.mevsim, input.islem_tarihi, item.model_name, vehicleId]
      );
      newStorageIds.push(inserted.rows[0].id);

      if (input.order && serviceId != null) {
        const order = await client.query<{ id: number }>(
          `INSERT INTO orders (tenant_id, plate, customer_name, customer_phone, notes, total_amount, status, custom_order_no, vehicle_id, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, 'BEKLEMEDE', $7, $8, COALESCE($9, CURRENT_TIMESTAMP)) RETURNING id`,
          [user.tenantId, old.plate, customer.name, customer.phone,
           `Toplu mevsim değişimi${old.depo_no != null ? ` — Depo No ${old.depo_no}` : ""}`,
           input.order.unit_price, customOrderNoEnabled ? item.custom_order_no : null, vehicleId, orderCreatedAt]
        );
        await client.query(
          "INSERT INTO order_services (tenant_id, order_id, service_id, unit_price, quantity) VALUES ($1, $2, $3, $4, 1)",
          [user.tenantId, order.rows[0].id, serviceId, input.order.unit_price]
        );
        orderIds.push(order.rows[0].id);
      }
    }
    await client.query("COMMIT");

    await logAudit({
      tenantId: user.tenantId!, userId: user.userId, username: user.username,
      action: "customer.season_change", tableName: "storage", recordId: customer.id,
      detail: `Müşteri: ${customer.name}, ${input.items.length} araç`
        + (orderIds.length ? `, siparişler: ${orderIds.map((o) => `#${o}`).join(", ")}` : ""),
    });
    return NextResponse.json({ changed: input.items.length, storage_ids: newStorageIds, order_ids: orderIds }, { status: 201 });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (error instanceof SeasonChangeError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error && typeof error === "object" && "code" in error && error.code === "23505") {
      // storage_active_depo_no_unique ya da orders_tenant_custom_order_no_unique
      return NextResponse.json({ error: "Bir depo no ya da sipariş no az önce kullanıldı — kontrol edip tekrar deneyin." }, { status: 409 });
    }
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  } finally {
    client.release();
  }
}
