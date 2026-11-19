import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

// Barkod okutulduğunda "Yeni Ürün/Parti" formunu otomatik doldurmak için —
// bkz. Ürün Kataloğu Taslağı ("Barkod okut → bilineni doldur, bilinmeyeni
// sor" akışı). Dışarıdan (GTIN/EPREL vb.) gerçek bir barkod veritabanı
// bulunamadı (araştırıldı) — bu yüzden şimdilik sadece bu FİRMANIN daha
// önce kaydettiği kendi ürünleri içinde arar: aynı barkodla ikinci bir
// parti (farklı üretim haftası/tedarikçi) eklenirken Marka/Ebat/Mevsim
// tekrar elle yazılmasın diye. Fiyat/stok/konum kasıtlı olarak DÖNMEZ —
// bunlar partiye özgüdür, her yeni partide yeniden girilmesi gerekir.
// ?code= ile aynı arama ürün koduna göre de yapılır ("+ Yeni Ürün"de var
// olan bir kod elle yazılınca) — en son güncellenen partiden doldurulur.
export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  // Yalnızca ürün ekleme/düzenleme formları kullanır — ürün izni olmayan
  // personel katalog bilgisini buradan okuyamasın.
  if (!hasPermission(user, "products.create") && !hasPermission(user, "products.edit")) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const barcode = params.get("barcode")?.trim();
  const code = params.get("code")?.trim();
  if (!barcode && !code) return NextResponse.json({ found: false });

  try {
    const result = await pool.query<{
      code: string; brand: string | null; size_desc: string | null; season: string | null; supplier: string | null;
      product_type: string | null; width_mm: number | null; profile_pct: number | null; rim_diameter: string | null;
      model_name: string | null; load_speed_index: string | null; eu_fuel_class: string | null; eu_wet_grip_class: string | null;
      eu_noise_db: number | null; eu_noise_class: number | null; rim_size: string | null; pcd: string | null;
      offset_et: string | null; min_stock_threshold: number | null;
    }>(
      `SELECT code, brand, size_desc, season, supplier, product_type, width_mm, profile_pct, rim_diameter,
              model_name, load_speed_index, eu_fuel_class, eu_wet_grip_class, eu_noise_db, eu_noise_class,
              rim_size, pcd, offset_et, min_stock_threshold
       FROM products WHERE tenant_id = $1 AND ${barcode ? "barcode" : "code"} = $2
       ORDER BY updated_at DESC LIMIT 1`,
      [user.tenantId, barcode ?? code]
    );
    const row = result.rows[0];
    if (!row) return NextResponse.json({ found: false });
    return NextResponse.json({ found: true, ...row });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
