import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import * as XLSX from "xlsx";

const MAX_BATCH_SIZE = 500;

interface StorageRow {
  depo_no: number | null;
  plate: string;
  customer_name: string | null;
  phone: string | null;
  ebat: string | null;
  marka: string | null;
  dis_derinligi: string | null;
  adet: number;
  mevsim: string | null;
  aciklama: string | null;
}

function parseRow(r: unknown[]): StorageRow | null {
  const depo_no = r[0] != null ? Number(r[0]) : null;
  const plate = r[1] != null ? String(r[1]).trim() : null;
  if (!plate) return null;

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

  return { depo_no, plate, customer_name, phone, ebat, marka, dis_derinligi, adet, mevsim, aciklama };
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "storage.edit")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

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

    if (dataRows.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        { error: `Bir seferde en fazla ${MAX_BATCH_SIZE} satır aktarılabilir. Dosyayı bölüp tekrar deneyin.` },
        { status: 400 }
      );
    }

    let skipped = 0;
    const parsedRows: StorageRow[] = [];
    for (const row of dataRows) {
      const parsed = parseRow(row as unknown[]);
      if (!parsed) { skipped++; continue; }
      parsedRows.push(parsed);
    }

    if (parsedRows.length === 0) {
      return NextResponse.json({ imported: 0, skipped });
    }

    // storage tablosunda UNIQUE(plate, mevsim) kısıtı bilinçli olarak yok
    // (bkz. database/schema.sql) — teslim edilmiş eski bir kayıtla aynı
    // plaka+mevsim çifti tekrar (yeni bir dönem olarak) açılabilsin diye.
    // Bu yüzden burada da route.ts POST'taki aynı uygulama-katmanı deseni
    // kullanılır: sadece AKTİF (teslim_edildi=false) aynı plaka+mevsim
    // kaydı güncellenir, yoksa yeni kayıt eklenir. Mevsimsiz satırlar hiç
    // eşleştirilmez, her biri her zaman yeni kayıt olarak eklenir.

    // Aynı istekte aynı plaka+mevsim iki kez gelirse (mevsimli satırlarda)
    // son kaydı tut — products/import'taki aynı desen.
    const dedupedByKey = new Map<string, StorageRow>();
    const withoutMevsim: StorageRow[] = [];
    for (const r of parsedRows) {
      if (r.mevsim) {
        dedupedByKey.set(`${r.plate}|${r.mevsim}`, r);
      } else {
        withoutMevsim.push(r);
      }
    }
    const dedupedRows = [...Array.from(dedupedByKey.values()), ...withoutMevsim];

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const withMevsim = dedupedRows.filter((r) => r.mevsim);
      const existingMap = new Map<string, number>();
      if (withMevsim.length > 0) {
        const values: string[] = [];
        const placeholders = withMevsim.map((r, i) => {
          values.push(r.plate, r.mevsim as string);
          return `($${i * 2 + 1}::varchar,$${i * 2 + 2}::varchar)`;
        });
        const existing = await client.query<{ id: number; plate: string; mevsim: string }>(
          `SELECT s.id, v.plate, v.mevsim
           FROM storage s
           JOIN (VALUES ${placeholders.join(",")}) AS v(plate, mevsim)
             ON s.plate = v.plate AND s.mevsim = v.mevsim
           WHERE s.teslim_edildi = false`,
          values
        );
        for (const row of existing.rows) {
          existingMap.set(`${row.plate}|${row.mevsim}`, row.id);
        }
      }

      const toUpdate: (StorageRow & { id: number })[] = [];
      const toInsert: StorageRow[] = [];
      for (const r of dedupedRows) {
        const id = r.mevsim ? existingMap.get(`${r.plate}|${r.mevsim}`) : undefined;
        if (id) toUpdate.push({ ...r, id });
        else toInsert.push(r);
      }

      if (toUpdate.length > 0) {
        const values: (string | number | null)[] = [];
        const placeholders = toUpdate.map((r, i) => {
          const base = i * 9;
          values.push(r.id, r.depo_no, r.customer_name, r.phone, r.ebat, r.marka, r.dis_derinligi, r.adet, r.aciklama);
          return `($${base + 1}::int,$${base + 2}::int,$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8}::int,$${base + 9})`;
        });
        await client.query(
          `UPDATE storage AS s SET
             depo_no=v.depo_no, customer_name=v.customer_name, phone=v.phone, ebat=v.ebat,
             marka=v.marka, dis_derinligi=v.dis_derinligi, adet=v.adet, aciklama=v.aciklama
           FROM (VALUES ${placeholders.join(",")}) AS v(id, depo_no, customer_name, phone, ebat, marka, dis_derinligi, adet, aciklama)
           WHERE s.id = v.id`,
          values
        );
      }

      if (toInsert.length > 0) {
        const values: (string | number | null)[] = [];
        const placeholders = toInsert.map((r, i) => {
          const base = i * 10;
          values.push(r.depo_no, r.plate, r.customer_name, r.phone, r.ebat, r.marka, r.dis_derinligi, r.adet, r.mevsim, r.aciklama);
          return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10})`;
        });
        await client.query(
          `INSERT INTO storage (depo_no, plate, customer_name, phone, ebat, marka, dis_derinligi, adet, mevsim, aciklama)
           VALUES ${placeholders.join(",")}`,
          values
        );
      }

      await client.query("COMMIT");
      return NextResponse.json({ imported: toUpdate.length + toInsert.length, skipped });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
