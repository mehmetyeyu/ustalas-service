import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import * as XLSX from "xlsx";
import { CustomerImportError, matchCustomers, parseCustomerRows, type ParsedCustomerRow } from "@/lib/customersExcel";

const MAX_BATCH_SIZE = 2000;
const MAX_REPORTED_ERRORS = 5;
const FIELDS = ["name", "phone", "is_corporate", "tax_no", "tax_office", "contact_name", "email", "address", "city", "district"] as const;

// Müşteri listesini Excel'den aktarır. Cari bakiye AKTARILMAZ (aynı dosya iki
// kez yüklenirse borç iki kez yazılırdı). POST /api/customers ile aynı kural:
// var olan müşteride yalnızca BOŞ alanlar dolar, kurumsal işaret kaldırılmaz.
export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "customers.create")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const formData = await request.formData().catch(() => null);
    const file = formData?.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Dosya bulunamadı." }, { status: 400 });

    let rows: unknown[][];
    try {
      const workbook = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: "buffer" });
      const sheetName = workbook.SheetNames.find((n) => n.toLocaleLowerCase("tr-TR").includes("liste")) ?? workbook.SheetNames[0];
      rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: null });
    } catch {
      return NextResponse.json({ error: "Dosya okunamadı — Excel (.xlsx) dosyası seçin." }, { status: 400 });
    }

    let parsed;
    try {
      parsed = parseCustomerRows(rows);
    } catch (e) {
      if (e instanceof CustomerImportError) return NextResponse.json({ error: e.message }, { status: 400 });
      throw e;
    }
    const { rows: parsedRows, skipped, errors } = parsed;
    if (parsedRows.length + errors.length > MAX_BATCH_SIZE) {
      return NextResponse.json({ error: `Bir seferde en fazla ${MAX_BATCH_SIZE} müşteri aktarılabilir. Dosyayı bölüp tekrar deneyin.` }, { status: 400 });
    }
    // Hatalı satır varsa hiçbiri yazılmaz — kullanıcı düzeltip tekrar yükler.
    if (errors.length > 0) {
      const more = errors.length > MAX_REPORTED_ERRORS ? ` (+${errors.length - MAX_REPORTED_ERRORS} satır daha)` : "";
      return NextResponse.json(
        { error: `Hiçbir müşteri aktarılmadı, düzeltilmesi gereken satırlar var: ${errors.slice(0, MAX_REPORTED_ERRORS).join(" ")}${more}` },
        { status: 400 }
      );
    }
    if (parsedRows.length === 0) return NextResponse.json({ created: 0, updated: 0, unchanged: 0, skipped, ambiguous: 0 });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query<{ id: number; name: string }>("SELECT id, name FROM customers WHERE tenant_id = $1", [user.tenantId]);
      const { toInsert, toUpdate, ambiguous } = matchCustomers(parsedRows, existing.rows);
      const col = (list: ParsedCustomerRow[], k: (typeof FIELDS)[number]) => list.map((r) => r[k]);

      let updated = 0;
      if (toUpdate.length > 0) {
        const result = await client.query(
          `UPDATE customers AS c SET
             phone = COALESCE(NULLIF(c.phone, ''), v.phone), is_corporate = c.is_corporate OR v.is_corporate,
             tax_no = COALESCE(NULLIF(c.tax_no, ''), v.tax_no), tax_office = COALESCE(NULLIF(c.tax_office, ''), v.tax_office),
             contact_name = COALESCE(NULLIF(c.contact_name, ''), v.contact_name), email = COALESCE(NULLIF(c.email, ''), v.email),
             address = COALESCE(NULLIF(c.address, ''), v.address), city = COALESCE(NULLIF(c.city, ''), v.city),
             district = COALESCE(NULLIF(c.district, ''), v.district)
           FROM unnest($2::int[], $3::varchar[], $4::boolean[], $5::varchar[], $6::varchar[], $7::varchar[], $8::varchar[], $9::text[], $10::varchar[], $11::varchar[])
             AS v(id, phone, is_corporate, tax_no, tax_office, contact_name, email, address, city, district)
           WHERE c.id = v.id AND c.tenant_id = $1
             AND ((COALESCE(c.phone, '') = '' AND v.phone IS NOT NULL) OR (NOT c.is_corporate AND v.is_corporate)
               OR (COALESCE(c.tax_no, '') = '' AND v.tax_no IS NOT NULL) OR (COALESCE(c.tax_office, '') = '' AND v.tax_office IS NOT NULL)
               OR (COALESCE(c.contact_name, '') = '' AND v.contact_name IS NOT NULL) OR (COALESCE(c.email, '') = '' AND v.email IS NOT NULL)
               OR (COALESCE(c.address, '') = '' AND v.address IS NOT NULL) OR (COALESCE(c.city, '') = '' AND v.city IS NOT NULL)
               OR (COALESCE(c.district, '') = '' AND v.district IS NOT NULL))`,
          [user.tenantId, toUpdate.map((r) => r.id), ...FIELDS.filter((f) => f !== "name").map((f) => col(toUpdate, f))]
        );
        updated = result.rowCount ?? 0;
      }

      let created = 0;
      if (toInsert.length > 0) {
        // ON CONFLICT: aynı anda sipariş formundan aynı adla müşteri açıldıysa.
        const result = await client.query(
          `INSERT INTO customers (tenant_id, ${FIELDS.join(", ")})
           SELECT $1, v.* FROM unnest($2::varchar[], $3::varchar[], $4::boolean[], $5::varchar[], $6::varchar[], $7::varchar[], $8::varchar[], $9::text[], $10::varchar[], $11::varchar[])
             AS v(${FIELDS.join(", ")})
           ON CONFLICT (tenant_id, name) DO NOTHING`,
          [user.tenantId, ...FIELDS.map((f) => col(toInsert, f))]
        );
        created = result.rowCount ?? 0;
      }

      await client.query("COMMIT");
      return NextResponse.json({ created, updated, unchanged: parsedRows.length - ambiguous - created - updated, skipped, ambiguous });
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
