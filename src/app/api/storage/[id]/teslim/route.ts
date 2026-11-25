import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { normalizeTeslimAciklama } from "@/lib/storageDelivery";
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
    const { id } = await params;
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
