import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { logAudit } from "@/lib/auditLog";
import { formatPlate, isValidTrPlate, normalizePlate } from "@/lib/plate";

const MAX_PLATES = 200;

async function loadCorporate(id: string, tenantId: number) {
  if (!/^\d+$/.test(id)) return null;
  const result = await pool.query<{ id: number; name: string; is_corporate: boolean }>(
    "SELECT id, name, is_corporate FROM customers WHERE id = $1 AND tenant_id = $2",
    [id, tenantId]
  );
  return result.rows[0] ?? null;
}

// "Araç Ekle" ekranının öneri listesi — bu müşterinin geçmiş siparişlerinde
// geçen, biçime uyan plakalar. Yalnızca okuma: neyin ekleneceğini kullanıcı
// seçer, eski siparişlere dokunulmaz. Başka bir firmaya bağlı plakalar
// sahibiyle birlikte döner (ekranda "X firmasında" diye gösterilir).
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "customers.edit")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  const { id } = await params;
  try {
    const customer = await loadCorporate(id, user.tenantId!);
    if (!customer) return NextResponse.json({ error: "Müşteri bulunamadı." }, { status: 404 });

    const rows = await pool.query<{ plate: string; n: number; last: string }>(
      `SELECT plate, COUNT(*)::int AS n, MAX(created_at) AS last
       FROM orders WHERE tenant_id = $1 AND customer_name = $2 AND plate IS NOT NULL AND plate <> ''
       GROUP BY plate`,
      [user.tenantId, customer.name]
    );
    const byPlate = new Map<string, { plate: string; order_count: number; last_order: string }>();
    for (const r of rows.rows) {
      const plate = normalizePlate(r.plate);
      if (!isValidTrPlate(plate)) continue;
      const cur = byPlate.get(plate);
      if (cur) {
        cur.order_count += r.n;
        if (r.last > cur.last_order) cur.last_order = r.last;
      } else {
        byPlate.set(plate, { plate, order_count: r.n, last_order: r.last });
      }
    }
    const plates = [...byPlate.keys()];
    const owners = plates.length
      ? await pool.query<{ plate: string; customer_id: number | null; owner: string | null }>(
          `SELECT v.plate, v.customer_id, c.name AS owner
           FROM vehicles v LEFT JOIN customers c ON c.id = v.customer_id AND c.tenant_id = v.tenant_id
           WHERE v.tenant_id = $1 AND v.plate = ANY($2::text[]) AND v.customer_id IS NOT NULL`,
          [user.tenantId, plates]
        )
      : { rows: [] };
    const ownerByPlate = new Map(owners.rows.map((o) => [o.plate, o]));

    const suggestions = [...byPlate.values()]
      .filter((s) => ownerByPlate.get(s.plate)?.customer_id !== customer.id)
      .map((s) => ({ ...s, other_owner: ownerByPlate.get(s.plate)?.owner ?? null }))
      .sort((a, b) => b.order_count - a.order_count || (b.last_order > a.last_order ? 1 : -1))
      .slice(0, MAX_PLATES);
    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}

// Plakaları firmaya bağlar (yoksa araç kaydı açılır). Başka bir firmaya
// bağlı plaka, move=true gönderilmedikçe TAŞINMAZ — conflicts'te döner,
// ekran kullanıcıya sorar.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "customers.edit")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const rawPlates: unknown[] = Array.isArray(body?.plates) ? body.plates : [];
  const move = body?.move === true;
  if (rawPlates.length === 0) return NextResponse.json({ error: "En az bir plaka girin." }, { status: 400 });
  if (rawPlates.length > MAX_PLATES) {
    return NextResponse.json({ error: `Tek seferde en fazla ${MAX_PLATES} plaka eklenebilir.` }, { status: 400 });
  }

  const invalid: string[] = [];
  const plates = new Set<string>();
  for (const raw of rawPlates) {
    const plate = normalizePlate(typeof raw === "string" ? raw : "");
    if (isValidTrPlate(plate)) plates.add(plate);
    else if (typeof raw === "string" && raw.trim()) invalid.push(raw.trim().slice(0, 20));
  }
  if (plates.size === 0) {
    return NextResponse.json({ error: "Geçerli bir plaka yok.", invalid }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const customerResult = await client.query<{ id: number; name: string; is_corporate: boolean }>(
      "SELECT id, name, is_corporate FROM customers WHERE id = $1 AND tenant_id = $2 FOR UPDATE",
      [id, user.tenantId]
    );
    const customer = customerResult.rows[0];
    if (!customer) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Müşteri bulunamadı." }, { status: 404 });
    }
    if (!customer.is_corporate) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Araç yalnızca kurumsal müşteriye bağlanabilir." }, { status: 400 });
    }

    const list = [...plates];
    // Var olmayan plakalar için araç kaydı açılır; mevcutlara dokunulmaz.
    await client.query(
      `INSERT INTO vehicles (tenant_id, plate) SELECT $1, unnest($2::text[])
       ON CONFLICT (tenant_id, plate) DO NOTHING`,
      [user.tenantId, list]
    );
    const current = await client.query<{ id: number; plate: string; customer_id: number | null; owner: string | null }>(
      `SELECT v.id, v.plate, v.customer_id, c.name AS owner
       FROM vehicles v LEFT JOIN customers c ON c.id = v.customer_id AND c.tenant_id = v.tenant_id
       WHERE v.tenant_id = $1 AND v.plate = ANY($2::text[])
       FOR UPDATE OF v`,
      [user.tenantId, list]
    );
    const conflicts = current.rows
      .filter((v) => v.customer_id != null && v.customer_id !== customer.id)
      .map((v) => ({ plate: v.plate, owner: v.owner }));
    const toLink = current.rows.filter((v) =>
      v.customer_id == null || (move && v.customer_id !== customer.id)
    );
    const already = current.rows.filter((v) => v.customer_id === customer.id).length;

    if (toLink.length > 0) {
      await client.query(
        "UPDATE vehicles SET customer_id = $1 WHERE tenant_id = $2 AND id = ANY($3::int[])",
        [customer.id, user.tenantId, toLink.map((v) => v.id)]
      );
    }
    await client.query("COMMIT");

    if (toLink.length > 0) {
      const moved = toLink.filter((v) => v.customer_id != null);
      await logAudit({
        tenantId: user.tenantId!, userId: user.userId, username: user.username,
        action: "customer.vehicle_add", tableName: "vehicles", recordId: customer.id,
        detail: `Müşteri: ${customer.name}, Araç: ${toLink.map((v) => formatPlate(v.plate)).join(", ")}`
          + (moved.length ? ` (taşındı: ${moved.map((v) => `${formatPlate(v.plate)} ← ${v.owner ?? "?"}`).join(", ")})` : ""),
      });
    }

    return NextResponse.json({
      added: toLink.length,
      already,
      conflicts: move ? [] : conflicts,
      invalid,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  } finally {
    client.release();
  }
}
