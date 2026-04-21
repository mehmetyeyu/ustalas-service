import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });

  try {
    const { id } = await params;
    const { depo_no, plate, customer_name, phone, ebat, marka, dis_derinligi, adet, mevsim, aciklama, islem_tarihi } = await request.json();

    const result = await pool.query(
      `UPDATE storage SET
        depo_no=$1, plate=$2, customer_name=$3, phone=$4, ebat=$5,
        marka=$6, dis_derinligi=$7, adet=$8, mevsim=$9, aciklama=$10, islem_tarihi=$11
       WHERE id=$12 RETURNING *`,
      [depo_no || null, plate || null, customer_name || null, phone || null, ebat || null,
       marka || null, dis_derinligi || null, adet || 4, mevsim || null, aciklama || null,
       islem_tarihi || null, id]
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Kayıt bulunamadı." }, { status: 404 });
    }
    return NextResponse.json(result.rows[0]);
  } catch (error) {
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

  try {
    const { id } = await params;
    const result = await pool.query("DELETE FROM storage WHERE id = $1 RETURNING id", [id]);
    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Kayıt bulunamadı." }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
