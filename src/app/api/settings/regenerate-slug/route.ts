import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

// tenants.slug ("ustalas" gibi) firma adından türetildiği için tahmin
// edilebilir — kullanıcı bunun yerine rastgele, tahmin edilemeyen bir
// tanımlayıcı istedi. NOT: bu gerçek bir erişim kontrolü DEĞİL (slug zaten
// embed kodunun/URL'in içinde herkese açık şekilde duruyor, gizlenemez) —
// sadece rastgele bir ziyaretçinin şans eseri/deneme-yanılmayla başka bir
// firmanın (herkese açık, hassas veri içermeyen) randevu sayfasını bulmasını
// pratikte imkansız hale getiren bir kozmetik/karmaşıklaştırma önlemi.
function generateRandomSlug(): string {
  return randomBytes(8).toString("hex"); // 16 hex karakter, ~64 bit
}

export async function POST() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    let slug = generateRandomSlug();
    // Çakışma pratikte ihmal edilebilir ölçüde düşük ihtimalli (64 bit) ama
    // yine de garanti altına alınıyor.
    for (let attempts = 0; attempts < 5; attempts++) {
      const existing = await pool.query("SELECT 1 FROM tenants WHERE slug = $1", [slug]);
      if (existing.rowCount === 0) break;
      slug = generateRandomSlug();
    }

    await pool.query("UPDATE tenants SET slug = $1 WHERE id = $2", [slug, user.tenantId]);
    return NextResponse.json({ slug });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
