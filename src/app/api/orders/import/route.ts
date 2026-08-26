import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { ParsedOrder } from "@/lib/ordersExcel";
import { resolveServiceIds } from "@/lib/serviceCatalog";
import { upsertDirectoryNames } from "@/lib/directories";
import { hasPermission } from "@/lib/permissions";
import { getAutoRegisterCustomers } from "@/lib/settings";

const MAX_BATCH_SIZE = 20;

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "orders.edit")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const body = await request.json();
    const orders = body.orders as ParsedOrder[] | undefined;

    if (!Array.isArray(orders) || orders.length === 0) {
      return NextResponse.json({ error: "Aktarılacak sipariş bulunamadı." }, { status: 400 });
    }
    if (orders.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        { error: `Bir seferde en fazla ${MAX_BATCH_SIZE} sipariş gönderilebilir.` },
        { status: 400 }
      );
    }

    const client = await pool.connect();
    let imported = 0;
    let duplicates = 0;
    let changedDuplicates = 0;
    let productsAdded = 0;
    try {
      const allLines = orders.flatMap((o) => o.lines);
      const serviceIdByName = await resolveServiceIds(client, user.tenantId!, allLines);
      // "Perakende Müşteri" gerçek bir müşteri değil, anonim satışları temsil
      // eden bir yer tutucudur — Müşteri dizinine eklenmez.
      if (await getAutoRegisterCustomers(user.tenantId!)) {
        const customerNames = orders
          .map((o) => o.customer_name)
          .filter((n) => (n ?? "").trim().toLocaleLowerCase("tr-TR") !== "perakende müşteri");
        await upsertDirectoryNames(client, "customers", user.tenantId!, customerNames);
      }
      await upsertDirectoryNames(client, "suppliers", user.tenantId!, allLines.map((l) => l.supplier));

      // Excel'deki Stok Kodu (Ürün Kodu) Ürün Kataloğu'nda henüz yoksa, en azından
      // kodu (ve o satırdaki Ebat/Tedarikçi bilgisi varsa onu) tarihsiz "temel" bir
      // parti olarak ekler — stok 0, fiyatlar boş bırakılır (bu geçmiş bir satışın
      // kaydıdır, gerçek stok girişi değil); kullanıcı sonradan Ürün sayfasından
      // fiyat/stok girebilir.
      const codeInfo = new Map<string, { size_desc: string | null; supplier: string | null }>();
      for (const line of allLines) {
        const code = line.stock_code?.trim();
        if (!code || codeInfo.has(code)) continue;
        codeInfo.set(code, { size_desc: line.size_desc, supplier: line.supplier });
      }
      if (codeInfo.size > 0) {
        const codes = Array.from(codeInfo.keys());
        const existing = await client.query<{ code: string }>(
          "SELECT DISTINCT code FROM products WHERE code = ANY($1) AND tenant_id = $2",
          [codes, user.tenantId]
        );
        const existingCodes = new Set(existing.rows.map((r) => r.code));
        const missingCodes = codes.filter((c) => !existingCodes.has(c));
        for (const code of missingCodes) {
          const info = codeInfo.get(code)!;
          const result = await client.query(
            `INSERT INTO products (tenant_id, code, size_desc, supplier, stock_qty)
             VALUES ($1, $2, $3, $4, 0)
             ON CONFLICT (tenant_id, code) WHERE production_year IS NULL DO NOTHING
             RETURNING id`,
            [user.tenantId, code, info.size_desc, info.supplier]
          );
          if (result.rowCount) productsAdded++;
        }
      }

      for (const order of orders) {
        await client.query("BEGIN");
        try {
          const totalAmount = order.lines.reduce((sum, l) => sum + l.unit_price, 0);

          // Hiçbir satırında Ödeme Şekli girilmemiş bir sipariş (ör. tutarı/ödemesi
          // henüz netleşmemiş, açık bir işlem) TAMAMLANDI değil BEKLEMEDE olarak
          // içe aktarılır — paid_amount/payment_date de boş kalır, ödeme normal
          // "Ödeme Al & Kapat" akışıyla sonradan girilir.
          const isPending = order.payment_type === null;
          const status = isPending ? "BEKLEMEDE" : "TAMAMLANDI";
          const paidAmount = isPending ? null : totalAmount;
          const paymentDate = isPending ? null : order.date;

          const orderResult = await client.query<{ id: number }>(
            `INSERT INTO orders
               (tenant_id, plate, customer_name, notes, total_amount, paid_amount, status, payment_type, payment_date, created_at, import_ref)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             ON CONFLICT (tenant_id, import_ref) DO NOTHING
             RETURNING id`,
            [user.tenantId, order.plate, order.customer_name, order.notes, totalAmount, paidAmount, status, order.payment_type, paymentDate, order.date, order.import_ref]
          );

          if (orderResult.rows.length === 0) {
            duplicates++;
            // import_ref bazlı tekilleştirme tüm-ya-da-hiç çalışır — satır
            // bazlı otomatik birleştirme yapılmaz (kaynak Excel'de hangi
            // satırın "aynı" sayılacağına dair güvenilir bir kimlik yok).
            // Bu yüzden, kaynak dosya sonradan düzeltilip mevcut gruba yeni
            // bir satır eklenmiş olabileceği ihtimaline karşı, şu anki
            // satır sayısı veritabanındakiyle uyuşmuyorsa kullanıcı ayrıca
            // uyarılır — sessizce atlanmaz.
            const existingLines = await client.query<{ line_count: string }>(
              `SELECT COUNT(*)::int AS line_count FROM order_services os
               JOIN orders o ON o.id = os.order_id WHERE o.import_ref = $1 AND o.tenant_id = $2`,
              [order.import_ref, user.tenantId]
            );
            if (Number(existingLines.rows[0]?.line_count ?? 0) !== order.lines.length) {
              changedDuplicates++;
            }
            await client.query("COMMIT");
            continue;
          }

          const orderId = orderResult.rows[0].id;
          for (const line of order.lines) {
            const serviceId = serviceIdByName.get(line.service_name.trim());
            if (!serviceId) continue;
            await client.query(
              `INSERT INTO order_services
                 (tenant_id, order_id, service_id, unit_price, quantity, cost_price, supplier, stock_code, size_desc, payment_type)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
              [user.tenantId, orderId, serviceId, line.unit_price, line.quantity, line.cost_price, line.supplier, line.stock_code, line.size_desc, line.payment_type]
            );
          }

          await client.query("COMMIT");
          imported++;
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        }
      }
    } finally {
      client.release();
    }

    return NextResponse.json({ imported, duplicates, changedDuplicates, productsAdded });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
