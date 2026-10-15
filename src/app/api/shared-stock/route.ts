import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getAppSettings } from "@/lib/settings";
import { escapeLike } from "@/lib/sqlSafety";

interface SharedStockRow {
  code: string;
  brand: string;
  size_desc: string;
  season: string | null;
  stock_qty: number;
  production_year: number | null;
  production_week: number | null;
  tenant_id: number;
  tenant_name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
}

interface ShopEntry {
  tenant_id: number;
  tenant_name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  code: string;
  qty: number;
  production_year: number | null;
  production_week: number | null;
}

// Firmalar arası opt-in stok görünürlüğü — bkz. plan (Paylaşılan Stok).
// Karşılıklı: çağıran kendi shared_stock_enabled'ı açık DEĞİLSE, başkalarının
// stoğu hiç sorgulanmaz (aşağıdaki erken dönüş). Görünürlük ayrıca çağrılan
// tarafın hem app_settings.shared_stock_enabled=true HEM tenants.is_active=true
// olmasını gerektirir — biri bile eksikse o firmanın stoğu hiç dönmez.
//
// GÜVENLİK: bu sorgu asla purchase_price/sale_price/supplier seçmemeli —
// bu route'un gizlilik sınırı SQL seviyesinde uygulanır, client-side
// filtreleme değil. Eşleştirme (brand, size_desc, season) üzerinden yapılır.
// `code` (müşteri isteğiyle) artık gösteriliyor — her firmanın kendi iç
// SKU'su olduğundan gruplama ANAHTARI değil, sadece her mağaza satırının
// YANINDA bilgi amaçlı gösterilir (bkz. aşağıdaki shopsByTenant anahtarı:
// tenant_id+code, aynı firmanın farklı kodlu partileri AYRI satır olur).
export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "shared_stock.view")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  const ownSettings = await getAppSettings(user.tenantId!);
  if (!ownSettings.shared_stock_enabled) {
    return NextResponse.json({ sharingEnabled: false });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search");
  const season = searchParams.get("season");
  const minQty = Math.max(0, parseInt(searchParams.get("minQty") ?? "0") || 0);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(500, Math.max(1, parseInt(searchParams.get("limit") ?? "20")));

  const conditions: string[] = [
    "t.is_active = true",
    "t.id != $1",
    "a.shared_stock_enabled = true",
    "p.stock_qty > 0",
    "p.brand IS NOT NULL",
    "p.size_desc IS NOT NULL",
  ];
  const values: (string | number)[] = [user.tenantId!];

  if (search) {
    values.push(`%${escapeLike(search)}%`, `%${escapeLike(search.replace(/\//g, ""))}%`);
    conditions.push(
      `(p.brand ILIKE $${values.length - 1} OR p.size_desc ILIKE $${values.length - 1} OR REPLACE(p.size_desc, '/', '') ILIKE $${values.length})`
    );
  }
  if (season) {
    values.push(season);
    conditions.push(`p.season = $${values.length}`);
  }

  try {
    // Tenant sayısı/ürün hacmi bu aşamada küçük olduğundan (ağdaki opt-in
    // firma sayısı sınırlı), tüm eşleşen satırlar tek sorguda çekilip
    // gruplama/sayfalama JS tarafında yapılır — SQL'de (brand, size_desc,
    // season) üçlüsüyle NULL-güvenli eşleştirme/IN sorgusu kurmaktan daha
    // basit ve hataya daha az açık.
    const result = await pool.query<SharedStockRow>(
      `SELECT p.code, p.brand, p.size_desc, p.season, p.stock_qty, p.production_year, p.production_week,
              t.id AS tenant_id, t.name AS tenant_name, t.contact_name, t.contact_email, t.contact_phone
       FROM products p
       JOIN tenants t ON t.id = p.tenant_id
       JOIN app_settings a ON a.tenant_id = t.id
       WHERE ${conditions.join(" AND ")}`,
      values
    );

    interface GroupAcc {
      brand: string;
      size_desc: string;
      season: string | null;
      total_stock: number;
      // Anahtar tenant_id+code: aynı firmanın aynı (marka,ebat,sezon) için
      // FARKLI kodlu partileri tek satırda birleşmez, her kod ayrı satırda
      // görünür.
      shopsByTenant: Map<string, ShopEntry>;
    }
    const groups = new Map<string, GroupAcc>();

    for (const row of result.rows) {
      // Ayraç NUL (\u0000) — marka/ebat/sezon metinlerinde asla geçmez.
      // Boşluk ayraç OLAMAZ: ebatların çoğu boşluk içeriyor ("205/55 R16"),
      // ebadı "X Yaz"+sezonu boş ile ebadı "X"+sezonu "Yaz" aynı anahtara
      // düşerdi. Kaynakta ham NUL değil escape dizisi olarak yazılı ki git
      // dosyayı "binary" saymasın (4ab105f'in boşluğa geçme sebebi buydu).
      const key = `${row.brand}\u0000${row.size_desc}\u0000${row.season ?? ""}`;
      let group = groups.get(key);
      if (!group) {
        group = { brand: row.brand, size_desc: row.size_desc, season: row.season, total_stock: 0, shopsByTenant: new Map() };
        groups.set(key, group);
      }
      group.total_stock += row.stock_qty;

      const shopKey = `${row.tenant_id}|${row.code}`;
      const existingShop = group.shopsByTenant.get(shopKey);
      if (!existingShop) {
        group.shopsByTenant.set(shopKey, {
          tenant_id: row.tenant_id,
          tenant_name: row.tenant_name,
          contact_name: row.contact_name,
          contact_email: row.contact_email,
          contact_phone: row.contact_phone,
          code: row.code,
          qty: row.stock_qty,
          production_year: row.production_year,
          production_week: row.production_week,
        });
      } else {
        existingShop.qty += row.stock_qty;
        // Birden fazla parti varsa en yeni üretim tarihini göster.
        if (
          (row.production_year ?? 0) > (existingShop.production_year ?? 0) ||
          ((row.production_year ?? 0) === (existingShop.production_year ?? 0) && (row.production_week ?? 0) > (existingShop.production_week ?? 0))
        ) {
          existingShop.production_year = row.production_year;
          existingShop.production_week = row.production_week;
        }
      }
    }

    let items = Array.from(groups.values())
      .filter((g) => g.total_stock >= minQty)
      .map((g) => ({
        brand: g.brand,
        size_desc: g.size_desc,
        season: g.season,
        total_stock: g.total_stock,
        shops: Array.from(g.shopsByTenant.values())
          .sort((a, b) => b.qty - a.qty || a.tenant_id - b.tenant_id || a.code.localeCompare(b.code, "tr")),
      }))
      // Sezon da sıralamada olmalı: aynı marka+ebadın Yaz/Kış grupları
      // eşit sayılınca sıraları SQL'deki (ORDER BY'sız) satır sırasına
      // kalıyordu, sayfa sınırına denk gelince bir grup iki sayfada birden
      // görünüp diğeri hiç görünmeyebiliyordu. Sezonsuz grup sona.
      .sort((a, b) =>
        a.brand.localeCompare(b.brand, "tr")
        || a.size_desc.localeCompare(b.size_desc, "tr")
        || (a.season == null ? 1 : 0) - (b.season == null ? 1 : 0)
        || (a.season ?? "").localeCompare(b.season ?? "", "tr")
      );

    const total = items.length;
    const offset = (page - 1) * limit;
    items = items.slice(offset, offset + limit);

    return NextResponse.json({ sharingEnabled: true, items, total, page, limit });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
