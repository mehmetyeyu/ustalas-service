import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser, hasUserAddon } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { INVOICE_INFO_FIELDS, parseInvoiceInfo } from "@/lib/customers";

// Müşterinin fatura bilgileri (vergi no, vergi dairesi, adres, il/ilçe,
// e-posta). Müşteri formunun PATCH'inden ayrı: o uç kurumsal işaret, cari
// limiti ve ad taşıma kurallarını taşıyor; burası yalnızca fatura alanlarına
// dokunur ve fatura kesme penceresinden de (invoices.issue) çağrılır —
// girilen bilgi bir sonraki faturada tekrar sorulmasın (docs/e-fatura-tasarim.md §5.1).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasUserAddon(user, "einvoice")) return NextResponse.json({ error: "e-Fatura modülü bu firmada açık değil.", code: "addon_required" }, { status: 403 });
  if (!hasPermission(user, "customers.edit") && !hasPermission(user, "invoices.issue")) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });
  }

  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Müşteri bulunamadı." }, { status: 404 });
  const parsed = parseInvoiceInfo(await request.json().catch(() => ({})));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const fields = INVOICE_INFO_FIELDS.filter((f) => f in parsed.values);
  if (fields.length === 0) return NextResponse.json({ error: "Değiştirilecek alan yok." }, { status: 400 });

  try {
    // Alan adları sabit listeden gelir (INVOICE_INFO_FIELDS), kullanıcı girdisi değil.
    const sets = fields.map((f, i) => `${f} = $${i + 3}`).join(", ");
    const result = await pool.query(
      `UPDATE customers SET ${sets} WHERE id = $1 AND tenant_id = $2
       RETURNING id, tax_no, tax_office, address, city, district, email`,
      [id, user.tenantId, ...fields.map((f) => parsed.values[f])]
    );
    if (result.rowCount === 0) return NextResponse.json({ error: "Müşteri bulunamadı." }, { status: 404 });
    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
