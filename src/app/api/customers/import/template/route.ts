import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { buildTemplateBuffer } from "@/lib/excelTemplate";
import { CUSTOMER_EXAMPLE_NAME, CUSTOMER_EXCEL_COLUMNS } from "@/lib/customersExcel";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "customers.create")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  const example: Record<string, string> = {
    name: CUSTOMER_EXAMPLE_NAME, phone: "0555 123 45 67", is_corporate: "Hayır", contact_name: "Ahmet Yılmaz",
    email: "ornek@firma.com", address: "Örnek Mah. Örnek Cad. No:1", city: "İstanbul", district: "Şişli",
  };
  const buffer = buildTemplateBuffer(
    "Müşteri Listesi",
    CUSTOMER_EXCEL_COLUMNS.map((c) => c.header),
    CUSTOMER_EXCEL_COLUMNS.map((c) => example[c.key] ?? null),
    CUSTOMER_EXCEL_COLUMNS.map((c) => c.width),
    [{
      name: "Açıklamalar",
      rows: [
        ["Sütun", "Açıklama"],
        ["Müşteri Adı", "Zorunlu. Aynı adla (büyük/küçük harf ve boşluk farkı önemsiz) müşteri varsa yeni kayıt açılmaz, yalnızca boş alanları dolar."],
        ["Kurumsal", "Evet ya da Hayır. Boşsa Hayır. Var olan kurumsal müşteriyi bireysele çevirmez."],
        ["Vergi No", "Vergi no (10 hane) ya da TC kimlik no (11 hane)."],
        ["Vergi Dairesi, E-posta, Adres, İl, İlçe", "Fatura bilgisi olarak saklanır."],
        ["Bakiye", "Cari borç/alacak aktarılmaz."],
      ],
    }]
  );

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="musteri-sablon.xlsx"`,
    },
  });
}
