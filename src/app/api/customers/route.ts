import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { parseCorporateFields, parseCreditLimit, parseDiscountRate } from "@/lib/customers";

// Sipariş oluşturma ekranındaki Müşteri alanı için dizin listesi.
export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });

  try {
    // order_count hesabı tüm siparişler üzerinde JOIN+GROUP BY gerektirir; bu
    // sadece admin Müşteriler sayfasında ("Siparişler" linki hiç siparişi
    // olmayan müşteride gösterilmesin diye) kullanılıyor. Sipariş oluşturma
    // ekranındaki Müşteri otomatik tamamlaması (page.tsx, admin/orders/[id])
    // order_count'u hiç okumuyor ama bu endpoint'i çok sık çağırıyor — o yüzden
    // varsayılan olarak ucuz sorgu (sadece customers tablosu) dönüyor, sayım
    // yalnızca ?withCounts=1 istendiğinde hesaplanıyor.
    const withCounts = request.nextUrl.searchParams.get("withCounts") === "1";
    // Cari bakiye de aynı şekilde sadece Müşteriler sayfasında gerekiyor —
    // ayrı bir LATERAL alt sorgu, customer_ledger_entries'in canlı SUM()'ı.
    // order_count'un aksine bu finansal veridir (borç/alacak tutarı) — sadece
    // sipariş oluşturmak için customers.view'ı olmayan bir personelin bunu
    // görmesini engellemek için ayrıca izin kontrolü gerekir.
    const withBalance = request.nextUrl.searchParams.get("withBalance") === "1";
    if (withBalance && !hasPermission(user, "customers.view")) {
      return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });
    }
    const result = await pool.query(
      withCounts
        ? `SELECT c.id, c.name, c.phone, c.is_corporate, c.tax_no, c.contact_name, c.credit_limit::float AS credit_limit, c.discount_rate::float AS discount_rate, COUNT(DISTINCT o.id)::int AS order_count${
            // has_cari_activity: Cari/Perakende tab ayrımı için (bkz.
            // Müşteriler sayfası) — bakiyenin kendisi (0 olabilir, tam
            // ödenmiş bir Cari müşteride de 0'dır) bu ayrımı yapamaz, bu
            // yüzden ayrıca "hiç hareketi var mı" (entry_count) gerekir.
            withBalance ? ", COALESCE(bal.balance, 0)::float AS balance, COALESCE(bal.entry_count, 0) > 0 AS has_cari_activity" : ""
          }
           FROM customers c
           LEFT JOIN orders o ON o.customer_name = c.name AND o.tenant_id = c.tenant_id${
             withBalance
               ? `
           LEFT JOIN LATERAL (
             SELECT SUM(cle.amount * cle.direction) AS balance, COUNT(*)::int AS entry_count
             FROM customer_ledger_entries cle
             WHERE cle.customer_id = c.id AND cle.tenant_id = c.tenant_id
           ) bal ON true`
               : ""
           }
           WHERE c.tenant_id = $1
           GROUP BY c.id, c.name, c.phone, c.is_corporate, c.tax_no, c.contact_name, c.credit_limit, c.discount_rate${withBalance ? ", bal.balance, bal.entry_count" : ""}
           ORDER BY c.name`
        // is_corporate: sipariş formu kurumsal müşteride "Aracı Getiren"
        // alanlarını gösterir; discount_rate: Ödeme Al'da indirimli tutar;
        // has_credit_limit: limiti olmayan müşteride limit kontrolü isteği
        // hiç atılmaz (tutarın kendisi burada dönmez).
        : `SELECT id, name, phone, is_corporate, discount_rate::float AS discount_rate, credit_limit IS NOT NULL AS has_credit_limit
           FROM customers WHERE tenant_id = $1 ORDER BY name`,
      [user.tenantId]
    );
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "customers.create")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const body = await request.json();
    const { name, phone } = body;
    if (!name || !String(name).trim()) {
      return NextResponse.json({ error: "Müşteri adı zorunludur." }, { status: 400 });
    }
    const corporate = parseCorporateFields(body);
    const credit = parseCreditLimit(body);
    if (credit.provided && "error" in credit) return NextResponse.json({ error: credit.error }, { status: 400 });
    const discount = parseDiscountRate(body);
    if (discount.provided && "error" in discount) return NextResponse.json({ error: discount.error }, { status: 400 });
    // Cari limiti ve indirim yalnızca "Cari Bakiye Yönetimi" izniyle (bkz. PATCH).
    if (!hasPermission(user, "customers.manage_balance")
        && ((credit.provided && "value" in credit && credit.value != null)
            || (discount.provided && "value" in discount && discount.value != null))) {
      return NextResponse.json({ error: "Cari limiti ve indirim oranı için Cari Bakiye Yönetimi izni gerekir." }, { status: 403 });
    }

    // Aynı isimle (ör. sipariş oluştururken) tekrar eklenirse, boş bırakılan
    // telefon mevcut kaydı sessizce silmesin diye orders.ts'teki upsertle aynı
    // COALESCE deseni kullanılır. Aynı isimde kayıt zaten varsa bu uç yalnızca
    // BOŞ alanları doldurur: kurumsal işaret kaldırılamaz, limit/indirim
    // silinemez — o değişiklikler PATCH'in denetimlerinden (araçlı firma,
    // Cari Bakiye Yönetimi izni) geçmeli.
    const result = await pool.query(
      `INSERT INTO customers (tenant_id, name, phone, is_corporate, tax_no, contact_name, credit_limit, discount_rate)
       VALUES ($1, $2, $3, COALESCE($4, false), $5, $6, $8, CASE WHEN COALESCE($4, false) THEN $10::numeric END)
       ON CONFLICT (tenant_id, name) DO UPDATE SET
         phone = COALESCE(EXCLUDED.phone, customers.phone),
         is_corporate = customers.is_corporate OR EXCLUDED.is_corporate,
         tax_no = COALESCE(customers.tax_no, EXCLUDED.tax_no),
         contact_name = COALESCE(customers.contact_name, EXCLUDED.contact_name),
         credit_limit = CASE WHEN $7 THEN COALESCE(customers.credit_limit, EXCLUDED.credit_limit) ELSE customers.credit_limit END,
         discount_rate = CASE WHEN $9 AND (customers.is_corporate OR EXCLUDED.is_corporate)
                              THEN COALESCE(customers.discount_rate, EXCLUDED.discount_rate) ELSE customers.discount_rate END
       RETURNING id, name, phone, is_corporate, tax_no, contact_name, credit_limit::float AS credit_limit, discount_rate::float AS discount_rate`,
      [user.tenantId, String(name).trim(), phone ? String(phone).trim() : null,
       corporate.isCorporate, corporate.taxNo, corporate.contactName,
       credit.provided, credit.provided && "value" in credit ? credit.value : null,
       discount.provided, discount.provided && "value" in discount ? discount.value : null]
    );
    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
