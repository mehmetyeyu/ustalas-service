import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { buildTemplateBuffer } from "@/lib/excelTemplate";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  // Başlıklar orders/import'un tanıdığı sütun adlarıdır (sıra önemli değil,
  // eşleşme başlık metnine göre yapılır) — bkz. src/lib/ordersExcel.ts.
  // Aynı Tarih+Müşteri+Plaka'ya sahip satırlar tek siparişte gruplanır (her
  // satır bir işlem/ürün kalemidir); Tarih, Plaka ve Yapılan İşlem zorunludur.
  const buffer = buildTemplateBuffer(
    "Sipariş Şablonu",
    ["Tarih", "Müşteri", "Plaka", "Yapılan İşlem", "Tedarikçi", "Stok Kodu", "Ebat", "Adet", "Tutar", "Maliyet", "Ödeme Şekli", "Açıklama"],
    [new Date(), "Örnek Müşteri", "00ORNEK00", "Lastik Değişimi", "ABC Lastik", "ORNEK0001", "205/55R16", 4, 3648, 3040, "Nakit", ""],
    [12, 18, 12, 18, 16, 12, 12, 6, 10, 10, 14, 20]
  );

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="siparis-sablon.xlsx"`,
    },
  });
}
