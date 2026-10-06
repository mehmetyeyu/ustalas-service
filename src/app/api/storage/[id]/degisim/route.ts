import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { normalizeYear } from "@/lib/productsExcel";

// Mevsim değişimi — bkz. sunum "Depoda Mevsim Değişimi Akışı": müşteri geldi,
// depodaki eski lastiği teslim aldı, yenisini bıraktı. Önceden bu TEK kayıt
// "Düzenle" ile üzerine yazılıyordu — teslim_tarihi hiç dolmuyor, geçmiş
// kayboluyordu. Burada iki ayrı iş TEK transaction'da yapılır: eski kayıt
// teslim_edildi=true ile kapatılır (storage_active_depo_no_unique kısıtı
// gereği depo_no bu anda boşalır), aynı depo_no/plaka/müşteri ile yeni bir
// kayıt açılır — storage tablosunun zaten desteklediği (ama arayüzde tek
// adımda sunulmayan) geçmiş modeli doğru kullanılmış olur.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "storage.edit")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  const client = await pool.connect();
  try {
    const { id } = await params;
    const body = await request.json();
    const { ebat, marka, dis_derinligi, adet, mevsim, aciklama, islem_tarihi, model_name, production_week, production_year, load_speed_index } = body;

    if (adet != null && adet !== "" && (!Number.isFinite(Number(adet)) || Number(adet) < 0)) {
      return NextResponse.json({ error: "Geçersiz adet." }, { status: 400 });
    }

    await client.query("BEGIN");

    const oldResult = await client.query(
      "SELECT * FROM storage WHERE id = $1 AND tenant_id = $2 FOR UPDATE",
      [id, user.tenantId]
    );
    if (oldResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Kayıt bulunamadı." }, { status: 404 });
    }
    const old = oldResult.rows[0];
    if (old.teslim_edildi) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Bu kayıt zaten teslim edilmiş." }, { status: 409 });
    }

    const today = new Date().toISOString().split("T")[0];
    await client.query(
      "UPDATE storage SET teslim_edildi = true, teslim_tarihi = $1 WHERE id = $2",
      [today, old.id]
    );

    const inserted = await client.query(
      `INSERT INTO storage (tenant_id, depo_no, plate, customer_name, phone, ebat, marka, dis_derinligi, adet, mevsim, aciklama, islem_tarihi, model_name, production_week, production_year, load_speed_index)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       RETURNING *`,
      [
        user.tenantId, old.depo_no, old.plate, old.customer_name, old.phone,
        ebat || null, marka || null, dis_derinligi || null, adet || 4,
        mevsim || null, aciklama || null, islem_tarihi || today,
        model_name || null, production_week || null, production_year ? normalizeYear(Number(production_year)) : null, load_speed_index || null,
      ]
    );

    await client.query("COMMIT");
    return NextResponse.json(inserted.rows[0], { status: 201 });
  } catch (error: unknown) {
    await client.query("ROLLBACK");
    if (error && typeof error === "object" && "code" in error && error.code === "23505") {
      return NextResponse.json({ error: "Bu depo no az önce kullanıldı, tekrar deneyin." }, { status: 409 });
    }
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  } finally {
    client.release();
  }
}
