import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { isInvoiceInfoComplete, type InvoiceInfo } from "@/lib/billing";

// Fatura bilgileri — /admin/billing'de plan kartlarının üstünde gösterilen
// form (bkz. src/lib/billing.ts isInvoiceInfoComplete). Sadece admin
// (faturalandırma yönetimi diğer billing uçlarıyla aynı __admin_only__
// deseni).
export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  const result = await pool.query<InvoiceInfo>(
    `SELECT billing_entity_type, billing_tax_id, billing_tax_office, billing_invoice_title,
            billing_city, billing_district, billing_address
     FROM tenants WHERE id = $1`,
    [user.tenantId]
  );
  const info = result.rows[0];
  return NextResponse.json({ ...info, complete: info ? isInvoiceInfoComplete(info) : false });
}

export async function PUT(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const body = await request.json();
    const entityType = body.billing_entity_type === "company" ? "company" : body.billing_entity_type === "individual" ? "individual" : null;
    const info: InvoiceInfo = {
      billing_entity_type: entityType,
      billing_tax_id: body.billing_tax_id ? String(body.billing_tax_id).trim().replace(/\D/g, "") : null,
      billing_tax_office: entityType === "company" && body.billing_tax_office ? String(body.billing_tax_office).trim() : null,
      billing_invoice_title: body.billing_invoice_title ? String(body.billing_invoice_title).trim() : null,
      billing_city: body.billing_city ? String(body.billing_city).trim() : null,
      billing_district: body.billing_district ? String(body.billing_district).trim() : null,
      billing_address: body.billing_address ? String(body.billing_address).trim() : null,
    };

    if (!isInvoiceInfoComplete(info)) {
      const idLabel = entityType === "company" ? "10 haneli VKN" : "11 haneli TCKN";
      return NextResponse.json(
        { error: `Fatura bilgileri eksik veya geçersiz. Fatura tipi, ${idLabel}${entityType === "company" ? " ve vergi dairesi" : ""}, fatura unvanı/ad soyad, il, ilçe ve açık adres zorunludur.` },
        { status: 400 }
      );
    }

    await pool.query(
      `UPDATE tenants SET
         billing_entity_type = $1, billing_tax_id = $2, billing_tax_office = $3,
         billing_invoice_title = $4, billing_city = $5, billing_district = $6, billing_address = $7
       WHERE id = $8`,
      [
        info.billing_entity_type, info.billing_tax_id, info.billing_tax_office,
        info.billing_invoice_title, info.billing_city, info.billing_district, info.billing_address,
        user.tenantId,
      ]
    );

    return NextResponse.json({ ...info, complete: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
