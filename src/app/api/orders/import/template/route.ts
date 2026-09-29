import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { buildTemplateBuffer } from "@/lib/excelTemplate";
import { hasPermission } from "@/lib/permissions";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "orders.edit")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  // Başlıklar orders/import'un tanıdığı sütun adlarıdır (sıra önemli değil,
  // eşleşme başlık metnine göre yapılır) — bkz. src/lib/ordersExcel.ts.
  // Aynı Tarih+Müşteri+Plaka'ya sahip satırlar tek siparişte gruplanır (her
  // satır bir işlem/ürün kalemidir); Tarih, Plaka ve Yapılan İşlem zorunludur.
  // "Sipariş No" tamamen opsiyoneldir — yalnızca Genel Ayarlar'dan "Sipariş
  // Numarasını Elle Gir"i açmış firmalar için anlamlıdır (bkz.
  // database/schema.sql custom_order_no notu); boş bırakılırsa (çoğu firma)
  // içe aktarılan sipariş her zamanki gibi otomatik #id ile görünür.
  const buffer = buildTemplateBuffer(
    "Sipariş Şablonu",
    ["Tarih", "Müşteri", "Plaka", "Yapılan İşlem", "Tedarikçi", "Stok Kodu", "Ebat", "Adet", "Tutar", "Maliyet", "Ödeme Şekli", "Açıklama", "Sipariş No"],
    [new Date(), "Örnek Müşteri", "00ORNEK00", "Lastik Değişimi", "ABC Lastik", "ORNEK0001", "205/55R16", 4, 3648, 3040, "Nakit", "", ""],
    [12, 18, 12, 18, 16, 12, 12, 6, 10, 10, 14, 20, 14]
  );

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="siparis-sablon.xlsx"`,
    },
  });
}
