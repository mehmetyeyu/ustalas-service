import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { resolveServiceIds } from "@/lib/serviceCatalog";
import { upsertDirectoryNames } from "@/lib/directories";
import { deductStock, InsufficientStockError } from "@/lib/productStock";
import { buildOrderQuery, needsCariStatuses } from "@/lib/orderQuery";
import { hasPermission } from "@/lib/permissions";
import { getOrderCreationSettings } from "@/lib/settings";
import { isCariPartial, isCariSettled, loadOrderLedgerStatuses } from "@/lib/customerLedger";
import { countWorkingDays, hasAnyWorkingDay, type WorkingHours } from "@/lib/appointmentSlots";
import { logAudit } from "@/lib/auditLog";
import { linkVehicle } from "@/lib/vehicles";

interface OrderLineInput {
  service_name: string;
  supplier?: string | null;
  stock_code?: string | null;
  size_desc?: string | null;
  brand?: string | null;
  model_name?: string | null;
  quantity?: number | null;
  unit_price: number;
  cost_price?: number | null;
  product_id?: number | null;
}

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  // Sipariş listesi (müşteri/finansal veriler dahil) yalnızca yönetici panelinde
  // gösterilir — Karşılama Görevlisi yalnızca sipariş oluşturabilir (aşağıdaki
  // POST), listeyi görememeli (ayrı bir orders.view izni olmadıkça).
  if (!hasPermission(user, "orders.view")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(500, Math.max(1, parseInt(searchParams.get("limit") ?? "20")));
  const offset = (page - 1) * limit;

  try {
    // Ödeme Şekli filtresi/sıralaması kapanmış cari siparişleri kapatan
    // yöntemle değerlendirir — firmanın tüm cari durumu önceden gerekir
    // (bkz. buildOrderQuery). Yalnızca bu durumda; sayfa satırları da aynı
    // haritayı kullanır, aşağıdaki ikinci cari sorgusu atlanır.
    const tenantCariStatuses = needsCariStatuses(searchParams)
      ? await loadOrderLedgerStatuses(pool, user.tenantId!, null)
      : undefined;
    const { joins, where, values, orderBy, pageSort } = buildOrderQuery(user.tenantId!, searchParams, tenantCariStatuses);

    const fromClause = `
      FROM orders o
      LEFT JOIN order_services os ON o.id = os.order_id
      LEFT JOIN services s ON os.service_id = s.id
      ${joins}
      ${where}
    `;

    // Önce sayfanın satırları (sıralama + LIMIT), ödeme bayrakları SONRA ve
    // yalnızca o satırlar için. Bayraklar sıralanan sorgunun içindeyken
    // Postgres sıralamadan önce her satır için hesaplamak üzere bütün
    // order_payments'ı hash'liyordu: 50 bin siparişlik sentetik yükte
    // 10,6 ms → 0,24 ms (2026-11, bkz. lastik-servis-projesi.md §27).
    // Dış SELECT sütunları tek tek yazar — sort_* yanıta girmez; sıra
    // onlarla korunur (bkz. buildOrderQuery pageSort). $1 her zaman tenant_id.
    const result = await pool.query(
      `SELECT
         x.id, x.custom_order_no, x.payment_note, x.plate, x.customer_name, x.notes, x.status, x.created_at,
         x.line_id, x.service_name, x.supplier, x.stock_code, x.size_desc, x.brand, x.model_name, x.quantity,
         x.unit_price, x.cost_price, x.payment_type, x.order_payment_type,
         -- "Ödeme Al & Kapat" ile kapatılan HER sipariş order_payments'a en az
         -- bir satır yazar (bkz. PATCH /api/orders/[id]) — tek tipli kapatma
         -- bunu "parçalı ödeme" yapmaz. Bu bayrak yalnızca gerçekten BİRDEN
         -- FAZLA FARKLI ödeme tipine bölünmüş siparişleri işaretler; tanım
         -- bulk-payment-type route'undaki mixed_orders ile birebir aynı olmalı.
         EXISTS (
           SELECT 1 FROM order_payments op WHERE op.order_id = x.id AND op.tenant_id = $1
           GROUP BY op.order_id HAVING COUNT(DISTINCT op.payment_type) > 1
         ) AS has_split_payment,
         -- "Ödeme Al & Kapat" ile hiç kapatılmamış (order_payments'ta hiç satırı
         -- olmayan) bir siparişin ödeme şekli toplu araçla değiştirilebilirse,
         -- sipariş "Fatura Edildi." vb. görünüp status hâlâ BEKLEMEDE kalabilir
         -- (kafa karıştırıcı, gerçek bir tahsilat kaydı yok) — bu bayrak toplu
         -- araçtaki seçilebilirlik filtresiyle birebir aynı olmalı (bkz.
         -- bulk-payment-type route).
         EXISTS (
           SELECT 1 FROM order_payments op2 WHERE op2.order_id = x.id AND op2.tenant_id = $1
         ) AS has_payment_record
       FROM (
         SELECT
           o.id, o.custom_order_no, o.payment_note, o.plate, o.customer_name, o.notes, o.status, o.created_at,
           os.id AS line_id, s.name AS service_name,
           os.supplier, os.stock_code, os.size_desc, os.brand, os.model_name, os.quantity, os.unit_price, os.cost_price,
           COALESCE(os.payment_type, o.payment_type) AS payment_type, o.payment_type AS order_payment_type,
           ${pageSort.select}
         ${fromClause}
         ORDER BY ${orderBy}
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}
       ) x
       ORDER BY ${pageSort.outer}`,
      [...values, limit, offset]
    );
    // Aynı WHERE ile tek sorguda hem toplam satır sayısı hem toplam tutar/kâr —
    // ekstra bir tam tarama gerektirmez, mevcut COUNT sorgusuna eklenir.
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total,
              COALESCE(SUM(os.unit_price), 0)::float AS total_amount,
              COALESCE(SUM(os.unit_price - os.cost_price), 0)::float AS total_kar,
              -- Yeni görünümün özet kartları için (sipariş sayısı ve bekleyen
              -- sipariş) — liste satır (line) bazlı olduğundan DISTINCT; aynı
              -- sorguya eklendiği için ek bir sorgu maliyeti yok.
              COUNT(DISTINCT o.id)::int AS order_count,
              COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'BEKLEMEDE')::int AS pending_count,
              -- Ortalama GÜNLÜK tutar/kâr için (bkz. admin/orders/page.tsx özet
              -- kutusu) — aktif filtrelerle eşleşen siparişlerin GERÇEKTE hangi
              -- gün aralığına yayıldığı. "Tümü" (tarih filtresi yokken) dahil
              -- her durumda çalışır, ayrı bir filtre-özel hesaplamaya gerek
              -- kalmaz — Europe/Istanbul yerel günü kullanılır (reports.ts'teki
              -- AT TIME ZONE deseniyle aynı, sargable olmasa da bu sorgu zaten
              -- WHERE'e göre az sayıda satır tarıyor).
              MIN((o.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul')::date)::text AS first_order_date,
              MAX((o.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul')::date)::text AS last_order_date,
              -- Çalışma saatleri (aşağıda) ayrı bir sorgu yerine buraya
              -- gömülü — her sorgu, döndürdüğü satırdan bağımsız ~1,5-2ms
              -- sabit Active CPU maliyeti taşıyor (sürücü/protokol), bu
              -- endpoint en sık çağrılanlardan. $1 her zaman tenant_id
              -- (bkz. buildOrderQuery).
              (SELECT booking_working_hours FROM app_settings WHERE tenant_id = $1) AS booking_working_hours
       ${fromClause}`,
      values
    );
    const total: number = countResult.rows[0].total;
    const totalAmount: number = countResult.rows[0].total_amount;
    const totalKar: number = countResult.rows[0].total_kar;
    const orderCount: number = countResult.rows[0].order_count;
    const pendingCount: number = countResult.rows[0].pending_count;
    const firstOrderDate: string | null = countResult.rows[0].first_order_date;
    const lastOrderDate: string | null = countResult.rows[0].last_order_date;

    // Ustalas'ın isteği: Ort. Günlük Tutar/Kâr, ham takvim gününe değil
    // Randevu Ayarları'ndaki GERÇEK çalışma günlerine (ör. Pazar kapalıysa
    // sayılmaz) bölünsün — bkz. src/lib/appointmentSlots.ts countWorkingDays.
    // Bu ayar hiç doldurulmamışsa (çoğu tenant randevu özelliğini hiç
    // kullanmıyor olabilir) ortalama YANLIŞ bir varsayımla (ör. hep 7 gün
    // açık) hesaplanmasın diye workingHoursConfigured=false dönülür, istemci
    // bunun yerine "Çalışma Saatlerinizi girin" ipucu gösterir.
    const workingHours: WorkingHours | null = countResult.rows[0].booking_working_hours ?? null;
    const workingHoursConfigured = hasAnyWorkingDay(workingHours);
    const workingDaySpan = workingHoursConfigured && firstOrderDate && lastOrderDate
      ? countWorkingDays(workingHours, firstOrderDate, lastOrderDate)
      : 0;

    // FIFO Cari uzlaşma — bkz. src/lib/customerLedger.ts computeOrderLedgerStatus.
    // Bu sayfadaki siparişlerin bağlı olduğu müşterilerin TAM geçmişi
    // gerekiyor (sadece sayfadaki siparişler değil — bir eski sipariş, bu
    // sayfada görünmeyen daha da eski bir borcu bekliyor olabilir).
    // Sipariş özeti (orders.payment_type) "Cari" ya da "Karışık" olanlar
    // yeter: cari tutarı olan her sipariş bunlardan biridir (satırları Cari
    // + Nakit ise özet "Karışık"). Satır tipine bakılsaydı, Cari satırı başka
    // sayfada kalan bir siparişin Nakit satırı cari durumunu bilmez, toplu
    // seçim sunucudaki korumadan sapardı (bkz. cariPaidIn). Sayfada böyle
    // sipariş yoksa (çoğu sayfa) sorgu atlanır; Ödeme Şekli filtresi/
    // sıralaması varken firma çapında yüklenmiş harita kullanılır.
    const orderIds = Array.from(new Set(
      result.rows
        .filter((r) => r.order_payment_type === "Cari" || r.order_payment_type === "Karışık" || r.payment_type === "Cari")
        .map((r) => r.id as number)
    ));
    const statusByOrderId = tenantCariStatuses ?? await loadOrderLedgerStatuses(pool, user.tenantId!, orderIds);
    const items = result.rows.map(({ order_payment_type: _orderPaymentType, ...r }) => {
      const status = statusByOrderId.get(r.id as number);
      return {
        ...r,
        cari_settled: isCariSettled(status),
        cari_remaining_amount: isCariPartial(status) ? status!.remainingAmount : null,
        cari_paid_via: isCariSettled(status) ? status!.paidVia : null,
        // Parçalı ("Karışık") siparişin hâlâ açık cari tutarı — hücrede
        // "Karışık (₺X cari kaldı)" için; diğer satırlarda null.
        cari_open_amount: r.payment_type === "Karışık" && status && !isCariSettled(status) ? status.remainingAmount : null,
      };
    });

    return NextResponse.json({
      items, total, totalAmount, totalKar, orderCount, pendingCount, firstOrderDate, lastOrderDate,
      workingHoursConfigured, workingDaySpan, page, limit,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });

  try {
    const { plate, customer_name, customer_phone, notes, lines, order_date, custom_order_no, no_plate, driver_name, driver_phone } = await request.json();
    // Kurumsal siparişte aracı getiren kişi (bkz. database/schema.sql).
    const driverName = String(driver_name ?? "").trim().slice(0, 100) || null;
    const driverPhone = String(driver_phone ?? "").trim().slice(0, 20) || null;

    if (!Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json(
        { error: "En az bir satır zorunludur." },
        { status: 400 }
      );
    }
    // Plaka, Genel Ayarlar'dan kapatılmadıkça (plate_required, varsayılan
    // true — bkz. database/schema.sql notu) zorunlu kalır. Kapatılmışsa düz
    // ürün satışında (araca bağlı olmayan) boş bırakılabilir — ama ikisi
    // BİRDEN boşsa sipariş hiçbir şeyle tanımlanamaz bir "hayalet" kayıt olur
    // (gerçek bir kullanıcı raporuyla bulundu — #955), en az biri zorunlu.
    const plateValue: string | null = String(plate ?? "").replace(/\s+/g, "").toUpperCase().slice(0, 20) || null;
    const customerNameTrimmed = String(customer_name ?? "").trim();
    // Bu handler'ın ihtiyaç duyduğu 3 ayar (plate_required,
    // custom_order_no_enabled, auto_register_customers) aynı app_settings
    // satırından TEK sorguda — 3 ayrı round-trip yerine (bkz. settings.ts
    // getOrderCreationSettings notu).
    const { plateRequired, customOrderNoEnabled, autoRegisterCustomers } = await getOrderCreationSettings(user.tenantId!);
    // "Plakasız satış" (no_plate) formda AÇIKÇA seçilmiş bir istisnadır — plaka
    // zorunlu olsa bile kabul edilir (amaç personelin plaka uydurmaması, bkz.
    // src/lib/plate.ts), ama sipariş bir şeyle tanımlanabilsin diye müşteri
    // adı zorunlu olur.
    const noPlate = no_plate === true && !plateValue;
    if (noPlate && !customerNameTrimmed) {
      return NextResponse.json({ error: "Plakasız satışta müşteri adı zorunludur." }, { status: 400 });
    }
    if (!noPlate && plateRequired && !plateValue) {
      return NextResponse.json({ error: "Plaka zorunludur." }, { status: 400 });
    }
    if (!plateRequired && !plateValue && !customerNameTrimmed) {
      return NextResponse.json({ error: "Plaka veya müşteri adından en az biri girilmelidir." }, { status: 400 });
    }
    // Manuel Sipariş No (bkz. database/schema.sql notu) — sadece firma bunu
    // Genel Ayarlar'dan açtıysa zorunlu; kapalıyken istemciden gelen herhangi
    // bir değer YOK sayılır (istemciye güvenilmez, ayar her zaman sunucudan
    // taze okunur). orders.id'ye hiç dokunulmaz, bu tamamen ayrı bir alan.
    const customOrderNo = customOrderNoEnabled
      ? String(custom_order_no ?? "").trim().slice(0, 50)
      : null;
    if (customOrderNoEnabled && !customOrderNo) {
      return NextResponse.json({ error: "Sipariş numarası zorunludur." }, { status: 400 });
    }
    // Geçmişe dönük giriş (ör. "2 gün önce girmeyi unuttuğum sipariş") —
    // gönderilmezse mevcut davranış (CURRENT_TIMESTAMP) aynen sürer. Gelecek
    // bir tarih kabul edilmez, siparişin henüz gerçekleşmediği bir tarih
    // mantıksız olurdu.
    let createdAt: Date | null = null;
    if (order_date) {
      const parsed = new Date(order_date);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: "Geçersiz tarih." }, { status: 400 });
      }
      // Sadece tarih (gün) kısmı geçmişe alınır, saat kısmı "şimdi" kalır —
      // aynı geçmiş günde birden fazla sipariş girilirse aralarındaki sıra
      // (created_at DESC varsayılan sıralaması) hâlâ giriş sırasını yansıtır.
      const now = new Date();
      parsed.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
      if (parsed.getTime() > now.getTime()) {
        return NextResponse.json({ error: "Gelecek bir tarih girilemez." }, { status: 400 });
      }
      createdAt = parsed;
    }
    for (const l of lines as OrderLineInput[]) {
      if (!l.service_name || !String(l.service_name).trim()) {
        return NextResponse.json({ error: "Her satır için işlem adı zorunludur." }, { status: 400 });
      }
    }

    const totalAmount = (lines as OrderLineInput[]).reduce(
      (sum, l) => sum + Number(l.unit_price || 0),
      0
    );
    if (totalAmount <= 0) {
      return NextResponse.json({ error: "Sipariş tutarı 0'dan büyük olmalıdır." }, { status: 400 });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const serviceIdByName = await resolveServiceIds(client, user.tenantId!, lines as OrderLineInput[]);
      await upsertDirectoryNames(client, "suppliers", user.tenantId!, (lines as OrderLineInput[]).map((l) => l.supplier));
      if (autoRegisterCustomers && customer_name && String(customer_name).trim()) {
        await client.query(
          `INSERT INTO customers (tenant_id, name, phone) VALUES ($1, $2, $3)
           ON CONFLICT (tenant_id, name) DO UPDATE SET phone = COALESCE(customers.phone, EXCLUDED.phone)`,
          [user.tenantId, String(customer_name).trim(), customer_phone || null]
        );
      }

      const vehicleId = await linkVehicle(client, user.tenantId!, plateValue);
      const orderResult = await client.query(
        `INSERT INTO orders (tenant_id, plate, customer_name, customer_phone, notes, total_amount, status, created_at, custom_order_no, vehicle_id, driver_name, driver_phone)
         VALUES ($1, $2, $3, $4, $5, $6, 'BEKLEMEDE', COALESCE($7, CURRENT_TIMESTAMP), $8, $9, $10, $11) RETURNING id`,
        [user.tenantId, plateValue, customer_name || null, customer_phone || null, notes || null, totalAmount, createdAt, customOrderNo, vehicleId, driverName, driverPhone]
      );

      const orderId = orderResult.rows[0].id;

      for (const l of lines as OrderLineInput[]) {
        const serviceId = serviceIdByName.get(String(l.service_name).trim());
        if (!serviceId) continue;
        const quantity = Math.max(1, Math.round(Number(l.quantity) || 1));
        if (l.product_id) await deductStock(client, user.tenantId!, l.product_id, quantity);
        await client.query(
          `INSERT INTO order_services
             (tenant_id, order_id, service_id, unit_price, quantity, cost_price, supplier, stock_code, size_desc, brand, model_name, product_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            user.tenantId,
            orderId,
            serviceId,
            Number(l.unit_price) || 0,
            quantity,
            l.cost_price != null ? Number(l.cost_price) : null,
            l.supplier || null,
            l.stock_code || null,
            l.size_desc || null,
            l.brand || null,
            l.model_name || null,
            l.product_id || null,
          ]
        );
      }

      await client.query("COMMIT");
      await logAudit({
        tenantId: user.tenantId!, userId: user.userId, username: user.username,
        action: "order.create", tableName: "orders", recordId: orderId,
        detail: `Plaka: ${plateValue || "—"}, Tutar: ${totalAmount}`,
      });
      return NextResponse.json({ id: orderId, total_amount: totalAmount }, { status: 201 });
    } catch (err) {
      await client.query("ROLLBACK");
      if (err instanceof InsufficientStockError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      // orders_tenant_custom_order_no_unique — aynı firmada aynı Sipariş No
      // ikinci kez kullanılmaya çalışıldı (bkz. database/schema.sql).
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
