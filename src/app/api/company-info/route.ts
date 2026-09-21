import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

// İş Emri gibi yazdırılan belgelerin başlığında gösterilecek firma
// bilgileri — bkz. src/app/admin/orders/[id]/page.tsx "İş Emri Yazdır".
// Fatura Bilgileri'nin aksine (bkz. /api/billing/invoice-info, role==='admin'
// zorunlu) burada özel bir rol kısıtı YOK: aynı tenant içindeki herkes
// (staff dahil) zaten sipariş görüntüleyebiliyorsa (useViewGuard("orders"))
// kendi firmasının adres/telefon/vergi bilgisini de görebilir — bunlar
// müşteriye zaten basılı belgede gösterilecek bilgiler, gizli değil.
export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });

  const result = await pool.query<{
    name: string;
    contact_phone: string | null;
    landline_phone: string | null;
    billing_invoice_title: string | null;
    billing_entity_type: string | null;
    billing_tax_id: string | null;
    billing_tax_office: string | null;
    billing_address: string | null;
    billing_city: string | null;
    billing_district: string | null;
  }>(
    `SELECT name, contact_phone, landline_phone, billing_invoice_title, billing_entity_type,
            billing_tax_id, billing_tax_office, billing_address, billing_city, billing_district
     FROM tenants WHERE id = $1`,
    [user.tenantId]
  );
  const t = result.rows[0];
  if (!t) return NextResponse.json({ error: "Firma bulunamadı." }, { status: 404 });

  return NextResponse.json({
    name: t.billing_invoice_title || t.name,
    phone: t.contact_phone || t.landline_phone,
    landlinePhone: t.landline_phone,
    taxIdLabel: t.billing_entity_type === "company" ? "VKN" : "TCKN",
    taxId: t.billing_tax_id,
    taxOffice: t.billing_tax_office,
    address: [t.billing_address, t.billing_district, t.billing_city].filter(Boolean).join(", ") || null,
  });
}
