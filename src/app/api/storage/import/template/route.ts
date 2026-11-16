import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { buildTemplateBuffer } from "@/lib/excelTemplate";
import { STORAGE_EXCEL_COLUMNS, STORAGE_MEVSIM_OPTIONS, formatIslemTarihi } from "@/lib/storageExcel";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "storage.edit")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  // Sütunlar Dışa Aktar ile aynı (bkz. src/lib/storageExcel.ts); içe aktarma
  // başlık adına göre okur. Mevsim/RFT/Jantlı'nın kabul edilen değerleri ayrı
  // sayfada (ücretsiz xlsx hücre içi açılır liste yazamıyor).
  const example: Record<string, string | number | null> = {
    depo_no: null, plate: "34ABC123", customer_name: "Örnek Müşteri", phone: "05551234567",
    ebat: "205/55R16", marka: "Michelin", dis_derinligi: "5-5-5-5", adet: 4, mevsim: "Kışlık",
    aciklama: "Örnek açıklama", model_name: "PremiumContact 6", production_week_year: "10/26",
    load_speed_index: "91H", islem_tarihi: formatIslemTarihi(new Date()), rft: "Hayır", jantli: "Evet",
  };
  const buffer = buildTemplateBuffer(
    "Depolama Şablonu",
    STORAGE_EXCEL_COLUMNS.map((c) => c.header),
    STORAGE_EXCEL_COLUMNS.map((c) => example[c.key] ?? null),
    STORAGE_EXCEL_COLUMNS.map((c) => c.width),
    [{
      name: "Açıklamalar",
      rows: [
        ["Sütun", "Açıklama"],
        ["Plaka", "Zorunlu. Aynı plaka + mevsimle aktif bir kayıt varsa o kayıt güncellenir, yoksa yeni kayıt açılır."],
        ["Depo No", "Boş bırakılırsa boştaki en küçük numara otomatik verilir."],
        ["Mevsim", STORAGE_MEVSIM_OPTIONS.join(" / ") + " (birden fazlaysa virgülle)"],
        ["İşlem Tarihi", "Depoya alındığı gün, ör. 16.11.2026. Boşsa bugün."],
        ["RFT / Jantlı", "Evet ya da Hayır. Boşsa yeni kayıtta Hayır."],
        ["Güncelleme", "Var olan kayıtta boş bırakılan hücre mevcut değeri değiştirmez."],
      ],
    }]
  );

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="depolama-sablon.xlsx"`,
    },
  });
}
