import { NextRequest, NextResponse } from "next/server";
import { linkVehicle } from "@/lib/vehicles";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { normalizeYear } from "@/lib/productsExcel";
import { resolveStorageTireColumns, StorageTiresValidationError } from "@/lib/storageTires";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "storage.edit")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const { id } = await params;
    const body = await request.json();
    const { depo_no, plate, customer_name, phone, adet, mevsim, aciklama, islem_tarihi, teslim_edildi, teslim_tarihi } = body;

    if (adet != null && adet !== "" && (!Number.isFinite(Number(adet)) || Number(adet) < 0)) {
      return NextResponse.json({ error: "Geçersiz adet." }, { status: 400 });
    }

    const t = resolveStorageTireColumns(body, normalizeYear);
    const vehicleId = await linkVehicle(pool, user.tenantId!, plate);
    const result = await pool.query(
      `UPDATE storage SET
        depo_no=$1, plate=$2, vehicle_id=$20, customer_name=$3, phone=$4, ebat=$5,
        marka=$6, dis_derinligi=$7, adet=$8, mevsim=$9, aciklama=$10, islem_tarihi=$11,
        teslim_edildi=$12, teslim_tarihi=$13, model_name=$16, production_week=$17,
        production_year=$18, load_speed_index=$19, lastikler=$21, rft=$22, jantli=$23
       WHERE id=$14 AND tenant_id=$15 RETURNING *`,
      [depo_no || null, plate || null, customer_name || null, phone || null, t.ebat,
       t.marka, t.dis_derinligi, t.adet, mevsim || null, aciklama || null,
       islem_tarihi || null, teslim_edildi ?? false, teslim_tarihi || null, id, user.tenantId,
       t.model_name, t.production_week, t.production_year, t.load_speed_index, vehicleId,
       t.lastikler, t.rft, t.jantli]
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Kayıt bulunamadı." }, { status: 404 });
    }
    return NextResponse.json(result.rows[0]);
  } catch (error) {
    if (error instanceof StorageTiresValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "storage.delete")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const { id } = await params;
    const result = await pool.query("DELETE FROM storage WHERE id = $1 AND tenant_id = $2 RETURNING id", [id, user.tenantId]);
    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Kayıt bulunamadı." }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
