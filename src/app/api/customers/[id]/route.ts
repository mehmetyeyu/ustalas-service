import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { parseCorporateFields, parseCreditLimit, parseDiscountRate } from "@/lib/customers";
import { plateNormalizeSql } from "@/lib/vehicles";

// Müşteri Detayı (kurumsal müşteri sayfası) — firma bilgisi, cari bakiye,
// bu ayın toplamı ve filo araçları. Araç istatistikleri bu müşterinin KENDİ
// siparişlerinden hesaplanır: vehicle_id ile bağlı olanlar + araç kaydından
// önceki siparişler (plaka metni eşleşmesi, yalnızca okuma — eski kayıtlara
// dokunulmaz). Tutarlar orders.view, depodaki lastik storage.view ister.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "customers.view")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Müşteri bulunamadı." }, { status: 404 });
  const canOrders = hasPermission(user, "orders.view");
  const canStorage = hasPermission(user, "storage.view");

  try {
    const customerResult = await pool.query(
      `SELECT c.id, c.name, c.phone, c.is_corporate, c.tax_no, c.contact_name, c.credit_limit::float AS credit_limit, c.discount_rate::float AS discount_rate,
              COALESCE((SELECT SUM(e.amount * e.direction) FROM customer_ledger_entries e
                         WHERE e.tenant_id = c.tenant_id AND e.customer_id = c.id), 0)::float AS balance
       FROM customers c WHERE c.id = $1 AND c.tenant_id = $2`,
      [id, user.tenantId]
    );
    const customer = customerResult.rows[0];
    if (!customer) return NextResponse.json({ error: "Müşteri bulunamadı." }, { status: 404 });

    const amount = "COALESCE(o.paid_amount, o.total_amount)";
    const [monthResult, vehiclesResult] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS order_count, COALESCE(SUM(${amount}), 0)::float AS total
         FROM orders o
         WHERE o.tenant_id = $1 AND o.customer_name = $2
           -- created_at UTC (zamansız) saklanır; ay başı İstanbul'a göre.
           AND o.created_at >= (date_trunc('month', NOW() AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'UTC'`,
        [user.tenantId, customer.name]
      ),
      pool.query(
        // Her sipariş/depo kaydı TEK seferde firmanın bir aracına eşlenir
        // (vehicle_id ya da normalize plaka), sonra araç başına gruplanır —
        // araç başına tüm siparişleri yeniden taramak 40 araç × 20k
        // siparişte ~640 ms sürüyordu (ölçek testi), bu yapı ile ~45 ms.
        `WITH fleet AS (
           SELECT id, plate FROM vehicles WHERE tenant_id = $1 AND customer_id = $3
         ), co AS (
           SELECT COALESCE(fv.id, fp.id) AS vid, o.created_at, ${amount} AS amount
           FROM orders o
           LEFT JOIN fleet fv ON fv.id = o.vehicle_id
           LEFT JOIN fleet fp ON fv.id IS NULL AND fp.plate = ${plateNormalizeSql("o.plate")}
           WHERE o.tenant_id = $1 AND o.customer_name = $2
         ), st AS (
           SELECT vid, COUNT(*)::int AS order_count, MAX(created_at) AS last_service, COALESCE(SUM(amount), 0)::float AS total_spend
           FROM co WHERE vid IS NOT NULL GROUP BY vid
         ), cs AS (
           SELECT DISTINCT ON (COALESCE(fv.id, fp.id)) COALESCE(fv.id, fp.id) AS vid,
                  json_build_object('id', s.id, 'depo_no', s.depo_no, 'mevsim', s.mevsim, 'adet', s.adet, 'ebat', s.ebat,
                                    'marka', s.marka, 'model_name', s.model_name) AS info
           FROM storage s
           LEFT JOIN fleet fv ON fv.id = s.vehicle_id
           LEFT JOIN fleet fp ON fv.id IS NULL AND s.customer_name = $2 AND fp.plate = ${plateNormalizeSql("s.plate")}
           WHERE s.tenant_id = $1 AND s.teslim_edildi = false AND COALESCE(fv.id, fp.id) IS NOT NULL
           ORDER BY COALESCE(fv.id, fp.id), s.created_at DESC
         )
         SELECT v.id, v.plate, COALESCE(st.order_count, 0) AS order_count, st.last_service,
                COALESCE(st.total_spend, 0)::float AS total_spend, cs.info AS active_storage
         FROM fleet v
         LEFT JOIN st ON st.vid = v.id
         LEFT JOIN cs ON cs.vid = v.id
         ORDER BY st.last_service DESC NULLS LAST, v.plate`,
        [user.tenantId, customer.name, customer.id]
      ),
    ]);

    return NextResponse.json({
      customer,
      month: canOrders ? monthResult.rows[0] : null,
      vehicles: vehiclesResult.rows.map((v) => ({
        ...v,
        total_spend: canOrders ? v.total_spend : null,
        active_storage: canStorage ? v.active_storage : null,
      })),
      can_view_orders: canOrders,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "customers.edit")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  const { name, phone } = body;
  if (!name || !String(name).trim()) {
    return NextResponse.json({ error: "Müşteri adı zorunludur." }, { status: 400 });
  }
  const newName = String(name).trim();
  const corporate = parseCorporateFields(body);
  const credit = parseCreditLimit(body);
  if (credit.provided && "error" in credit) return NextResponse.json({ error: credit.error }, { status: 400 });
  const discount = parseDiscountRate(body);
  if (discount.provided && "error" in discount) return NextResponse.json({ error: discount.error }, { status: 400 });

  // orders/appointments müşteriye FK ile değil, customer_name metniyle bağlı
  // (bkz. DELETE yorumu). Ad yalnızca customers'ta değişirse, eski bir
  // sipariş düzenlendiğinde customerLedger eski adla YENİ bir müşteri açıp
  // borcu oraya yazıyordu — cari ikiye bölünüyordu. Bu yüzden eski adı
  // taşıyan siparişler, randevular ve depo kayıtları aynı transaction'da
  // yeni ada taşınır.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query<{ name: string; is_corporate: boolean; credit_limit: number | null; discount_rate: number | null }>(
      "SELECT name, is_corporate, credit_limit::float AS credit_limit, discount_rate::float AS discount_rate FROM customers WHERE id = $1 AND tenant_id = $2 FOR UPDATE",
      [id, user.tenantId]
    );
    if (current.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Müşteri bulunamadı." }, { status: 404 });
    }
    const oldName = current.rows[0].name;

    // Cari limiti ve kurumsal indirim para politikasıdır — yalnızca "Cari
    // Bakiye Yönetimi" izniyle değişir. Form bu alanları her kayıtta mevcut
    // değerleriyle gönderdiğinden, değişmedikçe izin istenmez.
    const canManage = hasPermission(user, "customers.manage_balance");
    const limitChanged = credit.provided && "value" in credit && credit.value !== current.rows[0].credit_limit;
    const discountChanged = discount.provided && "value" in discount && discount.value !== current.rows[0].discount_rate
      && corporate.isCorporate !== false;
    if (!canManage && (limitChanged || discountChanged)) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Cari limiti ve indirim oranını değiştirmek için Cari Bakiye Yönetimi izni gerekir." }, { status: 403 });
    }

    // Kurumsal işareti kaldırılırken firmaya bağlı araçlar sessizce
    // kopmasın — önce Müşteri Detayı'ndan çıkarılmaları istenir.
    if (corporate.isCorporate === false && current.rows[0].is_corporate) {
      const linked = await client.query<{ n: number }>(
        "SELECT COUNT(*)::int AS n FROM vehicles WHERE tenant_id = $1 AND customer_id = $2",
        [user.tenantId, id]
      );
      if (linked.rows[0].n > 0) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: `Bu firmaya bağlı ${linked.rows[0].n} araç var. Kurumsal işaretini kaldırmadan önce araçları Müşteri Detayı'ndan çıkarın.` },
          { status: 409 }
        );
      }
    }

    // is_corporate gönderilmediyse (eski istemci) kurumsal alanlara dokunulmaz.
    await client.query(
      `UPDATE customers SET name = $1, phone = $2,
              is_corporate = COALESCE($5, is_corporate),
              tax_no = CASE WHEN $5::boolean IS NULL THEN tax_no ELSE $6 END,
              contact_name = CASE WHEN $5::boolean IS NULL THEN contact_name ELSE $7 END,
              credit_limit = CASE WHEN $8 THEN $9::numeric ELSE credit_limit END,
              -- Kurumsal indirim yalnızca kurumsal müşteride anlamlı; işaret
              -- kaldırılınca (ya da müşteri kurumsal değilse) oran da kalkar.
              discount_rate = CASE WHEN NOT COALESCE($5::boolean, is_corporate) THEN NULL
                                   WHEN $10 THEN $11::numeric ELSE discount_rate END
       WHERE id = $3 AND tenant_id = $4`,
      [newName, phone ? String(phone).trim() : null, id, user.tenantId,
       corporate.isCorporate, corporate.taxNo, corporate.contactName,
       credit.provided, credit.provided && "value" in credit ? credit.value : null,
       discount.provided, discount.provided && "value" in discount ? discount.value : null]
    );
    if (oldName !== newName) {
      await client.query(
        "UPDATE orders SET customer_name = $1 WHERE tenant_id = $2 AND customer_name = $3",
        [newName, user.tenantId, oldName]
      );
      await client.query(
        "UPDATE appointments SET customer_name = $1 WHERE tenant_id = $2 AND customer_name = $3",
        [newName, user.tenantId, oldName]
      );
      // Depo kayıtları da (firma sayfası, toplu mevsim değişimi ve araç
      // önerileri araca bağlanmamış eski kayıtları firma adıyla bulur).
      await client.query(
        "UPDATE storage SET customer_name = $1 WHERE tenant_id = $2 AND customer_name = $3",
        [newName, user.tenantId, oldName]
      );
    }
    await client.query("COMMIT");
    return NextResponse.json({ success: true });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (error && typeof error === "object" && "code" in error && error.code === "23505") {
      return NextResponse.json({ error: "Bu isimde başka bir müşteri zaten var." }, { status: 409 });
    }
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "customers.delete")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const { id } = await params;

    // orders.customer_name FK değil (serbest metin) — aktif (BEKLEMEDE) siparişi
    // olan bir müşteri silinirse o sipariş dizindeki bağlantısını (isimden ibaret)
    // kaybeder; bu yüzden aktif siparişi varken silme engellenir. Tamamlanmış
    // (geçmiş) siparişleri olan müşteriler yine de silinebilir.
    const customerResult = await pool.query<{ name: string }>(
      "SELECT name FROM customers WHERE id = $1 AND tenant_id = $2",
      [id, user.tenantId]
    );
    if (customerResult.rows.length === 0) {
      return NextResponse.json({ error: "Müşteri bulunamadı." }, { status: 404 });
    }

    const activeOrders = await pool.query(
      "SELECT id FROM orders WHERE customer_name = $1 AND tenant_id = $2 AND status = 'BEKLEMEDE' LIMIT 1",
      [customerResult.rows[0].name, user.tenantId]
    );
    if (activeOrders.rows.length > 0) {
      return NextResponse.json(
        { error: "Bu müşterinin aktif (beklemede) bir siparişi var, önce o siparişi tamamlayın veya silin." },
        { status: 409 }
      );
    }

    await pool.query("DELETE FROM customers WHERE id = $1 AND tenant_id = $2", [id, user.tenantId]);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
