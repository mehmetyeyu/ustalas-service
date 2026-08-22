import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { buildTemplateBuffer } from "@/lib/excelTemplate";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "products.edit")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  // Başlıklar products/import'un tanıdığı sütun adlarıdır (sıra önemli değil,
  // eşleşme başlık metnine göre yapılır) — bkz. src/lib/productsExcel.ts.
  // Üretim Haftası/Yılı "Hafta/Yıl" biçiminde girilir (DOT kodu), takvim
  // tarihi değildir.
  const buffer = buildTemplateBuffer(
    "Ürün Şablonu",
    ["Ürün Kodu", "Marka", "Ebat", "Mevsim", "Tedarikçi", "Üretim Haftası/Yılı", "Alış Maliyeti", "Satış Fiyatı", "Stok Miktarı"],
    ["ORNEK0001", "Hankook", "205/55R16 91H", "Yaz", "ABC Lastik", "10/26", 3040, 3648, 70],
    [14, 16, 16, 12, 16, 18, 14, 14, 12]
  );

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="urun-sablon.xlsx"`,
    },
  });
}
