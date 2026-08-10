import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { resolveServiceIds } from "@/lib/serviceCatalog";
import { upsertDirectoryNames } from "@/lib/directories";
import { deductStock, restoreStock, InsufficientStockError } from "@/lib/productStock";

interface EditLineInput {
  id?: number;
  service_name: string;
  supplier?: string | null;
  stock_code?: string | null;
  size_desc?: string | null;
  quantity?: number | null;
  unit_price: number;
  cost_price?: number | null;
  payment_type?: string | null;
  product_id?: number | null;
}

// "Mail Order" tek başına geçersizdir — bir tedarikçiyle birleşip
// "<Tedarikçi> Mail Order" olmalıdır (bkz. admin/orders/[id]/page.tsx).
// Hem PATCH (ödeme kapatma) hem PUT (düzenleme) bu kontrolü kullanır —
// PUT'ta boş/null bir değer de geçerlidir (henüz kapanmamış sipariş satırı).
const PAYMENT_FLAT_OPTIONS = ["Nakit", "POS", "Cari", "Fatura Edildi.", "Garanti Hesap", "Nazım Hesap", "Sait Hesap"];
const MAIL_ORDER_SUFFIX = " Mail Order";
function isValidPaymentType(v: string): boolean {
  if (PAYMENT_FLAT_OPTIONS.includes(v)) return true;
  return v.endsWith(MAIL_ORDER_SUFFIX) && v.length > MAIL_ORDER_SUFFIX.length;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const { id } = await params;
    const orderResult = await pool.query(
      "SELECT * FROM orders WHERE id = $1",
      [id]
    );
    if (!orderResult.rows[0]) {
      return NextResponse.json({ error: "Sipariş bulunamadı." }, { status: 404 });
    }

    const servicesResult = await pool.query(
      `SELECT s.id, os.id AS line_id, s.name, os.unit_price, os.quantity, os.cost_price,
              os.supplier, os.stock_code, os.size_desc, os.payment_type, os.product_id
       FROM order_services os
       JOIN services s ON os.service_id = s.id
       WHERE os.order_id = $1
       ORDER BY os.id`,
      [id]
    );

    // Parçalı ödeme girişleri (bkz. PATCH) — Excel'den içe aktarılmış eski
    // siparişlerde boş olabilir, o durumda ödeme kırılımı satır bazlı
    // payment_type üzerinden (yukarıdaki services[].payment_type) okunur.
    const paymentsResult = await pool.query(
      "SELECT id, payment_type, amount FROM order_payments WHERE order_id = $1 ORDER BY id",
      [id]
    );

    return NextResponse.json({ ...orderResult.rows[0], services: servicesResult.rows, payments: paymentsResult.rows });
  } catch (error) {
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
  if (user.role !== "admin") return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const { id } = await params;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Sipariş tamamen silinmeden önce, stoktan düşülmüş partili satırlar
      // varsa stok geri eklenir.
      const linked = await client.query<{ product_id: number; quantity: number }>(
        "SELECT product_id, quantity FROM order_services WHERE order_id = $1 AND product_id IS NOT NULL",
        [id]
      );
      for (const row of linked.rows) {
        await restoreStock(client, row.product_id, row.quantity);
      }

      const result = await client.query("DELETE FROM orders WHERE id = $1 RETURNING id", [id]);
      if (result.rowCount === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Sipariş bulunamadı." }, { status: 404 });
      }

      await client.query("COMMIT");
      return NextResponse.json({ success: true });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
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
  if (user.role !== "admin") return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const { id } = await params;
    const { payments } = await request.json();

    // Parçalı ödeme: birden fazla (ödeme tipi, tutar) girişi kabul edilir
    // (ör. 7.000 POS + 15.000 Garanti Hesap) — tek satırlık payment_type
    // yerine order_payments tablosuna kaydedilir, orders.paid_amount bu
    // girişlerin toplamıdır.
    if (!Array.isArray(payments) || payments.length === 0) {
      return NextResponse.json({ error: "En az bir ödeme girişi gereklidir." }, { status: 400 });
    }
    for (const p of payments as { payment_type: string; amount: number }[]) {
      if (!p.payment_type || !isValidPaymentType(p.payment_type)) {
        return NextResponse.json({ error: "Geçersiz ödeme tipi." }, { status: 400 });
      }
      const amt = Number(p.amount);
      if (!Number.isFinite(amt) || amt <= 0) {
        return NextResponse.json({ error: "Geçersiz tutar." }, { status: 400 });
      }
    }

    const totalPaid = (payments as { amount: number }[]).reduce((sum, p) => sum + Number(p.amount), 0);
    const distinctTypes = Array.from(new Set((payments as { payment_type: string }[]).map((p) => p.payment_type)));
    const summaryType = distinctTypes.length === 1 ? distinctTypes[0] : "Karışık";

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Sipariş satır bazlı FOR UPDATE ile kilitlenip mevcut statüsü kontrol
      // edilir — zaten TAMAMLANDI bir sipariş tekrar kapatılamaz (aksi hâlde
      // API'ye doğrudan istek atılarak mevcut ödeme kaydı sessizce ezilebilirdi;
      // arayüzdeki "Ödeme Al & Kapat" butonu da zaten yalnızca BEKLEMEDE'de görünür).
      const orderCheck = await client.query<{ status: string; total_amount: string }>(
        "SELECT status, total_amount FROM orders WHERE id = $1 FOR UPDATE",
        [id]
      );
      if (orderCheck.rows.length === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Sipariş bulunamadı." }, { status: 404 });
      }
      if (orderCheck.rows[0].status !== "BEKLEMEDE") {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Bu sipariş zaten kapatılmış." }, { status: 409 });
      }
      // Girilen ödemelerin toplamı sipariş tutarını aşamaz (yanlışlıkla fazla
      // girilen bir ödeme tutarı sessizce kabul edilip paid_amount'u şişirmesin).
      if (totalPaid > Number(orderCheck.rows[0].total_amount) + 0.01) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "Girilen ödeme toplamı sipariş tutarını aşamaz." },
          { status: 400 }
        );
      }

      for (const p of payments as { payment_type: string; amount: number }[]) {
        await client.query(
          "INSERT INTO order_payments (order_id, payment_type, amount) VALUES ($1, $2, $3)",
          [id, p.payment_type, Number(p.amount)]
        );
      }

      await client.query(
        `UPDATE orders
         SET status = 'TAMAMLANDI', payment_type = $1, payment_date = NOW(), paid_amount = $3
         WHERE id = $2`,
        [summaryType, id, totalPaid]
      );

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}

// Sipariş bilgilerini ve işlem satırlarını düzenler — ödeme kapatma (PATCH) ile
// karıştırılmasın diye ayrı bir uç. Mevcut satırlar id ile eşleştirilip güncellenir
// (payment_type'ları korunur), gönderilmeyen id'ler silinir, id'siz satırlar eklenir.
// `payments` gönderilirse (sipariş daha önce kapatılıp parçalı ödeme girilmişse),
// order_payments da baştan yazılır — yanlış girilen ödeme tipi/tutarını düzeltmenin
// tek yolu budur (PATCH yalnızca ilk kapatmada, BEKLEMEDE iken çalışır).
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const { id } = await params;
    const { plate, customer_name, customer_phone, notes, lines, payments } = await request.json();

    if (!plate || !Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json({ error: "Plaka ve en az bir satır zorunludur." }, { status: 400 });
    }
    for (const l of lines as EditLineInput[]) {
      if (!l.service_name || !String(l.service_name).trim()) {
        return NextResponse.json({ error: "Her satır için işlem adı zorunludur." }, { status: 400 });
      }
      // Boş/null geçerlidir (henüz ödeme tipi girilmemiş satır) — ama doluysa
      // PATCH ile aynı kurala uymalı (ör. tek başına "Mail Order" geçersiz).
      if (l.payment_type && !isValidPaymentType(l.payment_type)) {
        return NextResponse.json({ error: "Geçersiz ödeme tipi." }, { status: 400 });
      }
    }

    const totalAmount = (lines as EditLineInput[]).reduce((sum, l) => sum + Number(l.unit_price || 0), 0);

    // Parçalı ödeme (order_payments) düzeltmesi: yalnızca sipariş daha önce
    // "Ödeme Al & Kapat" ile kapatılmışsa (Düzelt ekranı bu bölümü o zaman
    // gösterir) gönderilir — undefined ise hiç dokunulmaz (PATCH akışı korunur).
    // Boş dizi ([]) ise, kullanıcı bir satıra tek bir ödeme tipi seçerek parçalı
    // ödemeyi bilinçli olarak sıfırlamış demektir — mevcut order_payments kayıtları
    // silinir, özet satır bazlı payment_type'lardan yeniden hesaplanır.
    let editedPayments: { payment_type: string; amount: number }[] | null = null;
    let clearPayments = false;
    if (payments !== undefined) {
      if (!Array.isArray(payments)) {
        return NextResponse.json({ error: "Geçersiz ödeme verisi." }, { status: 400 });
      }
      if (payments.length === 0) {
        clearPayments = true;
      } else {
        for (const p of payments as { payment_type: string; amount: number }[]) {
          if (!p.payment_type || !isValidPaymentType(p.payment_type)) {
            return NextResponse.json({ error: "Geçersiz ödeme tipi." }, { status: 400 });
          }
          const amt = Number(p.amount);
          if (!Number.isFinite(amt) || amt <= 0) {
            return NextResponse.json({ error: "Geçersiz tutar." }, { status: 400 });
          }
        }
        editedPayments = (payments as { payment_type: string; amount: number }[]).map((p) => ({
          payment_type: p.payment_type,
          amount: Number(p.amount),
        }));
        const totalPaid = editedPayments.reduce((sum, p) => sum + p.amount, 0);
        if (totalPaid > totalAmount + 0.01) {
          return NextResponse.json(
            { error: "Girilen ödeme toplamı sipariş tutarını aşamaz." },
            { status: 400 }
          );
        }
      }
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const serviceIdByName = await resolveServiceIds(client, lines as EditLineInput[]);
      await upsertDirectoryNames(client, "suppliers", (lines as EditLineInput[]).map((l) => l.supplier));
      if (customer_name && String(customer_name).trim()) {
        await client.query(
          `INSERT INTO customers (name, phone) VALUES ($1, $2)
           ON CONFLICT (name) DO UPDATE SET phone = COALESCE(customers.phone, EXCLUDED.phone)`,
          [String(customer_name).trim(), customer_phone || null]
        );
      }

      // paid_amount, kapatma sırasında total_amount'tan ayrı sabitlenir (indirim
      // olabilir diye). Satırlar düzenlenip toplam değiştiğinde, gerçek bir indirim
      // yoksa (paid_amount eski total_amount'a eşitse) paid_amount da yeni toplamla
      // senkron tutulur — aksi hâlde raporlar silinen/değişen satırlardan önceki
      // eski tutarı göstermeye devam ederdi. Gerçek bir indirim varsa dokunulmaz.
      const oldResult = await client.query<{ total_amount: string | null; paid_amount: string | null }>(
        "SELECT total_amount, paid_amount FROM orders WHERE id = $1",
        [id]
      );
      const oldTotal = oldResult.rows[0]?.total_amount != null ? Number(oldResult.rows[0].total_amount) : null;
      const oldPaid = oldResult.rows[0]?.paid_amount != null ? Number(oldResult.rows[0].paid_amount) : null;
      // Sipariş hiç kapatılmadıysa (paid_amount hâlâ NULL) elle dokunulmaz —
      // ödeme "Ödeme Al & Kapat" akışında set edilir, düzenlemeyle erken atanmaz.
      // Parçalı ödeme girişleri de bu ekrandan düzeltildiyse (editedPayments),
      // yeni toplamları paid_amount'u belirler — eski indirim mantığı devre dışı kalır.
      const editedPaymentsTotal = editedPayments?.reduce((sum, p) => sum + p.amount, 0) ?? null;
      const newPaidAmount = editedPaymentsTotal != null
        ? editedPaymentsTotal
        : (oldPaid == null ? null : (oldPaid === oldTotal ? totalAmount : oldPaid));

      await client.query(
        `UPDATE orders SET plate = $1, customer_name = $2, customer_phone = $3, notes = $4,
                            total_amount = $5, paid_amount = $6
         WHERE id = $7`,
        [plate, customer_name || null, customer_phone || null, notes || null, totalAmount, newPaidAmount, id]
      );

      const existingResult = await client.query<{ id: number; product_id: number | null; quantity: number }>(
        "SELECT id, product_id, quantity FROM order_services WHERE order_id = $1",
        [id]
      );
      const existingIds = new Set(existingResult.rows.map((r) => r.id));
      const existingById = new Map(existingResult.rows.map((r) => [r.id, r]));
      const keptIds = new Set((lines as EditLineInput[]).filter((l) => l.id != null).map((l) => l.id));
      const toDelete = Array.from(existingIds).filter((eid) => !keptIds.has(eid));

      // Kaldırılan satırlar bir partiye bağlıysa, düştükleri stok geri eklenir.
      for (const eid of toDelete) {
        const old = existingById.get(eid);
        if (old?.product_id) await restoreStock(client, old.product_id, old.quantity);
      }
      if (toDelete.length > 0) {
        await client.query("DELETE FROM order_services WHERE id = ANY($1)", [toDelete]);
      }

      for (const l of lines as EditLineInput[]) {
        const serviceId = serviceIdByName.get(String(l.service_name).trim());
        if (!serviceId) continue;
        const quantity = Math.max(1, Math.round(Number(l.quantity) || 1));
        const unitPrice = Number(l.unit_price) || 0;
        const costPrice = l.cost_price != null ? Number(l.cost_price) : null;
        const productId = l.product_id || null;

        if (l.id != null && existingIds.has(l.id)) {
          // Stok mutabakatı: eski ve yeni parti farklıysa eski parti geri
          // eklenir, yeni partiden düşülür; aynı partiyse sadece miktar farkı
          // (delta) uygulanır — böylece aynı parti gereksiz yere geri/ileri oynatılmaz.
          const old = existingById.get(l.id);
          const oldProductId = old?.product_id ?? null;
          const oldQuantity = old?.quantity ?? 0;
          if (oldProductId !== productId) {
            if (oldProductId) await restoreStock(client, oldProductId, oldQuantity);
            if (productId) await deductStock(client, productId, quantity);
          } else if (productId) {
            const delta = quantity - oldQuantity;
            if (delta > 0) await deductStock(client, productId, delta);
            else if (delta < 0) await restoreStock(client, productId, -delta);
          }

          await client.query(
            `UPDATE order_services
             SET service_id = $1, unit_price = $2, quantity = $3, cost_price = $4,
                 supplier = $5, stock_code = $6, size_desc = $7, payment_type = $8, product_id = $9
             WHERE id = $10 AND order_id = $11`,
            [serviceId, unitPrice, quantity, costPrice, l.supplier || null, l.stock_code || null, l.size_desc || null, l.payment_type || null, productId, l.id, id]
          );
        } else {
          if (productId) await deductStock(client, productId, quantity);
          await client.query(
            `INSERT INTO order_services
               (order_id, service_id, unit_price, quantity, cost_price, supplier, stock_code, size_desc, payment_type, product_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [id, serviceId, unitPrice, quantity, costPrice, l.supplier || null, l.stock_code || null, l.size_desc || null, l.payment_type || null, productId]
          );
        }
      }

      if (editedPayments) {
        // Parçalı ödeme girişleri baştan yazılır — mevcut kayıtlar silinip
        // düzenlenmiş liste eklenir (PATCH'teki ilk girişle aynı mantık).
        await client.query("DELETE FROM order_payments WHERE order_id = $1", [id]);
        for (const p of editedPayments) {
          await client.query(
            "INSERT INTO order_payments (order_id, payment_type, amount) VALUES ($1, $2, $3)",
            [id, p.payment_type, p.amount]
          );
        }
        const distinct = Array.from(new Set(editedPayments.map((p) => p.payment_type)));
        const summaryType = distinct.length === 1 ? distinct[0] : "Karışık";
        await client.query("UPDATE orders SET payment_type = $1 WHERE id = $2", [summaryType, id]);
      } else {
        // clearPayments: kullanıcı bir satıra tek bir ödeme tipi seçip parçalı
        // ödemeyi bilinçli sıfırladı — eski order_payments kayıtları artık satır
        // bazlı özetle çelişir, bu yüzden silinir (aksi hâlde raporlar hâlâ eski
        // parçalı dağılımı gösterirdi).
        if (clearPayments) {
          await client.query("DELETE FROM order_payments WHERE order_id = $1", [id]);
        }
        // Sipariş seviyesindeki payment_type özet değeridir (bkz. PATCH) — satır
        // ödeme tipleri düzenlemede değişmiş olabileceğinden burada da güncellenir.
        const finalTypes = (lines as EditLineInput[]).map((l) => l.payment_type).filter((p): p is string => !!p);
        const distinct = Array.from(new Set(finalTypes));
        const summaryType = distinct.length === 0 ? null : distinct.length === 1 ? distinct[0] : "Karışık";
        if (finalTypes.length > 0 || clearPayments) {
          await client.query("UPDATE orders SET payment_type = $1 WHERE id = $2", [summaryType, id]);
        }
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      if (err instanceof InsufficientStockError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    } finally {
      client.release();
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
