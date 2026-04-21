import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import * as XLSX from "xlsx";

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "Dosya bulunamadı." }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });

    const sheetName = workbook.SheetNames.find((n) =>
      n.toLowerCase().includes("liste")
    ) ?? workbook.SheetNames[0];

    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });

    // İlk satır başlık
    const dataRows = rows.slice(1).filter((row) => {
      const r = row as unknown[];
      return r.some((c) => c !== null && c !== undefined && c !== "");
    });

    let imported = 0;
    let skipped = 0;
    for (const row of dataRows) {
      const r = row as unknown[];
      const depo_no = r[0] != null ? Number(r[0]) : null;
      const plate = r[1] != null ? String(r[1]).trim() : null;

      if (!plate) { skipped++; continue; }
      const customer_name = r[2] != null ? String(r[2]).trim() : null;
      const phone = r[3] != null ? String(r[3]).trim() : null;
      const ebat = r[4] != null ? String(r[4]).trim() : null;
      const marka = r[5] != null ? String(r[5]).trim() : null;
      // Diş derinliği bazı satırlarda date object olabilir
      const rawDis = r[6];
      let dis_derinligi: string | null = null;
      if (rawDis != null) {
        if (typeof rawDis === "object" && rawDis instanceof Date) {
          dis_derinligi = rawDis.toISOString().split("T")[0];
        } else {
          dis_derinligi = String(rawDis).trim();
        }
      }
      const adet = r[7] != null ? Number(r[7]) : 4;
      const mevsim = r[8] != null ? String(r[8]).trim() : null;
      const aciklama = r[9] != null ? String(r[9]).trim() : null;

      await pool.query(
        `INSERT INTO storage (depo_no, plate, customer_name, phone, ebat, marka, dis_derinligi, adet, mevsim, aciklama)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (plate, mevsim) DO UPDATE SET
           depo_no=EXCLUDED.depo_no, customer_name=EXCLUDED.customer_name, phone=EXCLUDED.phone,
           ebat=EXCLUDED.ebat, marka=EXCLUDED.marka, dis_derinligi=EXCLUDED.dis_derinligi,
           adet=EXCLUDED.adet, aciklama=EXCLUDED.aciklama`,
        [depo_no, plate, customer_name, phone, ebat, marka, dis_derinligi, adet, mevsim, aciklama]
      );
      imported++;
    }

    return NextResponse.json({ imported, skipped });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
