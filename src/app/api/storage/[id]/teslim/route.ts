import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { normalizeTeslimAciklama } from "@/lib/storageDelivery";
import { parseStorageId } from "@/lib/storageInput";
import { nextFreeDepoNo } from "@/lib/storageDepoNo";
import { todayIstanbul } from "@/lib/quotes";

// Teslim Et — yalnızca teslim alanlarını yazar. Önceden ekran kaydın tamamını
// PATCH'e geri gönderiyordu; liste eskiyse başkasının düzeltmesi eziliyordu.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "storage.edit")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const id = parseStorageId((await params).id);
    if (id === null) return NextResponse.json({ error: "Kayıt bulunamadı." }, { status: 404 });
    const body = await request.json().catch(() => ({}));

    const result = await pool.query(
      `UPDATE storage SET teslim_edildi = true, teslim_tarihi = $1, teslim_aciklama = $2
       WHERE id = $3 AND tenant_id = $4 AND teslim_edildi = false RETURNING *`,
      [todayIstanbul(), normalizeTeslimAciklama(body?.teslim_aciklama), id, user.tenantId]
    );
    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Kayıt bulunamadı ya da zaten teslim edilmiş." }, { status: 409 });
    }
    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}

// Teslimi Geri Al — yanlışlıkla teslim edilen kayıt yeniden aktif olur, teslim
// tarihi ve açıklaması silinir. Depo no bu arada başka lastiğe verildiyse
// boştaki en küçük numara atanır (yanıtta previous_depo_no döner).
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "storage.edit")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  const id = parseStorageId((await params).id);
  if (id === null) return NextResponse.json({ error: "Kayıt bulunamadı." }, { status: 404 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query(
      "SELECT * FROM storage WHERE id = $1 AND tenant_id = $2 FOR UPDATE",
      [id, user.tenantId]
    );
    const item = found.rows[0];
    if (!item || !item.teslim_edildi) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Kayıt bulunamadı ya da zaten depoda." }, { status: 409 });
    }

    // Yeni kayıttaki kural: aynı plaka + mevsimde ikinci aktif kayıt olmaz
    // (ör. teslimden sonra lastik yeniden depoya yazıldıysa).
    if (item.plate && item.mevsim) {
      const active = await client.query(
        `SELECT depo_no FROM storage
         WHERE tenant_id = $1 AND teslim_edildi = false AND mevsim = $2 AND (plate = $3 OR vehicle_id = $4) LIMIT 1`,
        [user.tenantId, item.mevsim, item.plate, item.vehicle_id]
      );
      if (active.rows.length > 0) {
        await client.query("ROLLBACK");
        const no = active.rows[0].depo_no;
        return NextResponse.json(
          { error: `Geri alınamadı: bu plaka için zaten aktif bir ${item.mevsim} kaydı var${no != null ? ` (Depo No ${no})` : ""}.` },
          { status: 409 }
        );
      }
    }

    let depoNo: number | null = item.depo_no;
    if (depoNo != null) {
      const taken = await client.query(
        "SELECT 1 FROM storage WHERE tenant_id = $1 AND teslim_edildi = false AND depo_no = $2",
        [user.tenantId, depoNo]
      );
      if (taken.rows.length > 0) depoNo = await nextFreeDepoNo(client, user.tenantId!);
    }

    const result = await client.query(
      `UPDATE storage SET teslim_edildi = false, teslim_tarihi = NULL, teslim_aciklama = NULL, depo_no = $1
       WHERE id = $2 AND tenant_id = $3 RETURNING *`,
      [depoNo, id, user.tenantId]
    );
    await client.query("COMMIT");
    return NextResponse.json({ ...result.rows[0], previous_depo_no: item.depo_no });
  } catch (error: unknown) {
    await client.query("ROLLBACK").catch(() => {});
    if (error && typeof error === "object" && "code" in error && error.code === "23505") {
      return NextResponse.json({ error: "Depo no az önce kullanıldı, tekrar deneyin." }, { status: 409 });
    }
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  } finally {
    client.release();
  }
}
