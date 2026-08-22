import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { buildTemplateBuffer } from "@/lib/excelTemplate";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "storage.edit")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  // Sütun sırası storage/import'un okuduğu sıradır (başlık metni değil, sütun
  // konumu esas alınır) — bkz. src/app/api/storage/import/route.ts.
  const buffer = buildTemplateBuffer(
    "Depolama Şablonu",
    ["Depo No", "Plaka", "Müşteri", "Telefon", "Ebat", "Marka", "Diş Derinliği", "Adet", "Mevsim", "Açıklama"],
    [null, "00ORNEK00", "Örnek Müşteri", "05551234567", "205/55R16", "Michelin", "5-5-5-5", 4, "Kışlık", "Örnek açıklama"],
    [8, 12, 20, 14, 12, 14, 12, 6, 12, 30]
  );

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="depolama-sablon.xlsx"`,
    },
  });
}
