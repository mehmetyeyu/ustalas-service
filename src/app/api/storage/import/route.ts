import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import * as XLSX from "xlsx";
import { parseStorageRows, StorageImportError, type ParsedStorageRow } from "@/lib/storageExcel";
import { normalizePlate, isValidTrPlate } from "@/lib/plate";
import { todayIstanbul } from "@/lib/quotes";

const MAX_BATCH_SIZE = 500;
const MAX_REPORTED_ERRORS = 5;

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (!hasPermission(user, "storage.edit")) return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "Dosya bulunamadı." }, { status: 400 });

    let rows: unknown[][];
    try {
      const workbook = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: "buffer" });
      // Dışa Aktar'ın sayfası "Depolama Listesi", şablonunki tek sayfa.
      const sheetName = workbook.SheetNames.find((n) => n.toLowerCase().includes("liste")) ?? workbook.SheetNames[0];
      rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: null });
    } catch {
      return NextResponse.json({ error: "Dosya okunamadı — Excel (.xlsx) dosyası seçin." }, { status: 400 });
    }

    let parsed;
    try {
      parsed = parseStorageRows(rows, todayIstanbul());
    } catch (e) {
      if (e instanceof StorageImportError) return NextResponse.json({ error: e.message }, { status: 400 });
      throw e;
    }
    const { rows: parsedRows, skipped, errors } = parsed;
    if (parsedRows.length + errors.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        { error: `Bir seferde en fazla ${MAX_BATCH_SIZE} satır aktarılabilir. Dosyayı bölüp tekrar deneyin.` },
        { status: 400 }
      );
    }
    // Hatalı satır varsa hiçbiri yazılmaz — kullanıcı düzeltip tekrar yükler.
    if (errors.length > 0) {
      const more = errors.length > MAX_REPORTED_ERRORS ? ` (+${errors.length - MAX_REPORTED_ERRORS} satır daha)` : "";
      return NextResponse.json(
        { error: `Hiçbir kayıt aktarılmadı, düzeltilmesi gereken satırlar var: ${errors.slice(0, MAX_REPORTED_ERRORS).join(" ")}${more}` },
        { status: 400 }
      );
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
    const dedupedByKey = new Map<string, ParsedStorageRow>();
    const withoutMevsim: ParsedStorageRow[] = [];
    for (const r of parsedRows) {
      if (r.mevsim) dedupedByKey.set(`${r.plate}|${r.mevsim}`, r);
      else withoutMevsim.push(r);
    }
    const dedupedRows = [...Array.from(dedupedByKey.values()), ...withoutMevsim];

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const withMevsim = dedupedRows.filter((r) => r.mevsim);
      const existingMap = new Map<string, number>();
      if (withMevsim.length > 0) {
        const existing = await client.query<{ id: number; plate: string; mevsim: string }>(
          `SELECT s.id, s.plate, s.mevsim FROM storage s
           JOIN unnest($2::varchar[], $3::varchar[]) AS v(plate, mevsim) ON s.plate = v.plate AND s.mevsim = v.mevsim
           WHERE s.teslim_edildi = false AND s.tenant_id = $1`,
          [user.tenantId, withMevsim.map((r) => r.plate), withMevsim.map((r) => r.mevsim)]
        );
        for (const row of existing.rows) existingMap.set(`${row.plate}|${row.mevsim}`, row.id);
      }

      const toUpdate: (ParsedStorageRow & { id: number })[] = [];
      const toInsert: ParsedStorageRow[] = [];
      for (const r of dedupedRows) {
        const id = r.mevsim ? existingMap.get(`${r.plate}|${r.mevsim}`) : undefined;
        if (id) toUpdate.push({ ...r, id });
        else toInsert.push(r);
      }

      // Araç bağlantısı (bkz. src/lib/vehicles.ts linkVehicle) — satır satır
      // 500 sorgu yerine tek sorguda: geçerli plakaların araçları açılır/bulunur.
      const vehicleIds = new Map<string, number>();
      const validPlates = [...new Set(dedupedRows.map((r) => normalizePlate(r.plate)).filter(isValidTrPlate))];
      if (validPlates.length > 0) {
        const v = await client.query<{ id: number; plate: string }>(
          `INSERT INTO vehicles (tenant_id, plate) SELECT $1, unnest($2::varchar[])
           ON CONFLICT (tenant_id, plate) DO UPDATE SET last_seen_at = NOW()
           RETURNING id, plate`,
          [user.tenantId, validPlates]
        );
        for (const row of v.rows) vehicleIds.set(row.plate, row.id);
      }
      const vehicleOf = (plate: string) => vehicleIds.get(normalizePlate(plate)) ?? null;
      const col = <K extends keyof ParsedStorageRow>(list: ParsedStorageRow[], k: K) => list.map((r) => r[k]);

      if (toUpdate.length > 0) {
        // Boş hücre mevcut değeri korur (Excel'de olmayan bir sütun ya da
        // boş bırakılan Depo No kaydı silmesin). Konum ayrıntısı (lastikler)
        // yalnızca özet alanları değişmediyse korunur — Excel'de Ebat/Marka/
        // Model/Diş değiştirilmişse ayrıntı artık geçersiz.
        await client.query(
          `UPDATE storage AS s SET
             depo_no = COALESCE(v.depo_no, s.depo_no), customer_name = COALESCE(v.customer_name, s.customer_name),
             phone = COALESCE(v.phone, s.phone), ebat = COALESCE(v.ebat, s.ebat), marka = COALESCE(v.marka, s.marka),
             dis_derinligi = COALESCE(v.dis_derinligi, s.dis_derinligi), adet = COALESCE(v.adet, s.adet),
             aciklama = COALESCE(v.aciklama, s.aciklama), model_name = COALESCE(v.model_name, s.model_name),
             production_week = COALESCE(v.production_week, s.production_week),
             production_year = COALESCE(v.production_year, s.production_year),
             load_speed_index = COALESCE(v.load_speed_index, s.load_speed_index),
             islem_tarihi = COALESCE(v.islem_tarihi, s.islem_tarihi),
             rft = COALESCE(v.rft, s.rft), jantli = COALESCE(v.jantli, s.jantli),
             lastikler = CASE WHEN s.ebat IS NOT DISTINCT FROM COALESCE(v.ebat, s.ebat)
                               AND s.marka IS NOT DISTINCT FROM COALESCE(v.marka, s.marka)
                               AND s.model_name IS NOT DISTINCT FROM COALESCE(v.model_name, s.model_name)
                               AND s.dis_derinligi IS NOT DISTINCT FROM COALESCE(v.dis_derinligi, s.dis_derinligi)
                              THEN s.lastikler END,
             vehicle_id = COALESCE(v.vehicle_id, s.vehicle_id)
           FROM unnest($2::int[], $3::int[], $4::varchar[], $5::varchar[], $6::varchar[], $7::varchar[], $8::varchar[],
                       $9::int[], $10::text[], $11::varchar[], $12::smallint[], $13::smallint[], $14::varchar[],
                       $15::date[], $16::boolean[], $17::boolean[], $18::int[])
             AS v(id, depo_no, customer_name, phone, ebat, marka, dis_derinligi, adet, aciklama, model_name,
                  production_week, production_year, load_speed_index, islem_tarihi, rft, jantli, vehicle_id)
           WHERE s.id = v.id AND s.tenant_id = $1`,
          [user.tenantId, toUpdate.map((r) => r.id), col(toUpdate, "depo_no"), col(toUpdate, "customer_name"), col(toUpdate, "phone"),
           col(toUpdate, "ebat"), col(toUpdate, "marka"), col(toUpdate, "dis_derinligi"), col(toUpdate, "adet"), col(toUpdate, "aciklama"),
           col(toUpdate, "model_name"), col(toUpdate, "production_week"), col(toUpdate, "production_year"), col(toUpdate, "load_speed_index"),
           col(toUpdate, "islem_tarihi"), col(toUpdate, "rft"), col(toUpdate, "jantli"), toUpdate.map((r) => vehicleOf(r.plate))]
        );
      }

      if (toInsert.length > 0) {
        // Depo No boş satırlara (Yeni Kayıt'taki gibi) boşta kalan en küçük
        // numaralar sırayla verilir — güncellemeler yapıldıktan SONRA
        // hesaplanır, dosyada elle verilen numaralar da dolu sayılır.
        const needNo = toInsert.filter((r) => r.depo_no == null).length;
        if (needNo > 0) {
          const used = await client.query<{ depo_no: number }>(
            "SELECT depo_no FROM storage WHERE tenant_id = $1 AND teslim_edildi = false AND depo_no IS NOT NULL",
            [user.tenantId]
          );
          const taken = new Set([...used.rows.map((r) => r.depo_no), ...toInsert.map((r) => r.depo_no).filter((n): n is number => n != null)]);
          let next = 1;
          for (const r of toInsert) {
            if (r.depo_no != null) continue;
            while (taken.has(next)) next++;
            r.depo_no = next;
            taken.add(next);
          }
        }
        await client.query(
          `INSERT INTO storage (tenant_id, depo_no, plate, customer_name, phone, ebat, marka, dis_derinligi, adet, mevsim, aciklama,
                                model_name, production_week, production_year, load_speed_index, islem_tarihi, rft, jantli, vehicle_id)
           SELECT $1, v.depo_no, v.plate, v.customer_name, v.phone, v.ebat, v.marka, v.dis_derinligi, COALESCE(v.adet, 4), v.mevsim, v.aciklama,
                  v.model_name, v.production_week, v.production_year, v.load_speed_index,
                  COALESCE(v.islem_tarihi, CURRENT_DATE), COALESCE(v.rft, false), COALESCE(v.jantli, false), v.vehicle_id
           FROM unnest($2::int[], $3::varchar[], $4::varchar[], $5::varchar[], $6::varchar[], $7::varchar[], $8::varchar[],
                       $9::int[], $10::varchar[], $11::text[], $12::varchar[], $13::smallint[], $14::smallint[], $15::varchar[],
                       $16::date[], $17::boolean[], $18::boolean[], $19::int[])
             AS v(depo_no, plate, customer_name, phone, ebat, marka, dis_derinligi, adet, mevsim, aciklama,
                  model_name, production_week, production_year, load_speed_index, islem_tarihi, rft, jantli, vehicle_id)`,
          [user.tenantId, col(toInsert, "depo_no"), col(toInsert, "plate"), col(toInsert, "customer_name"), col(toInsert, "phone"),
           col(toInsert, "ebat"), col(toInsert, "marka"), col(toInsert, "dis_derinligi"), col(toInsert, "adet"), col(toInsert, "mevsim"),
           col(toInsert, "aciklama"), col(toInsert, "model_name"), col(toInsert, "production_week"), col(toInsert, "production_year"),
           col(toInsert, "load_speed_index"), col(toInsert, "islem_tarihi"), col(toInsert, "rft"), col(toInsert, "jantli"),
           toInsert.map((r) => vehicleOf(r.plate))]
        );
      }

      await client.query("COMMIT");
      return NextResponse.json({ imported: toUpdate.length + toInsert.length, skipped });
    } catch (err) {
      await client.query("ROLLBACK");
      // storage_active_depo_no_unique — dosyadaki bir Depo No aktif başka bir
      // kayıtta (ya da dosyada iki kez) kullanılıyor.
      if (err && typeof err === "object" && "code" in err && err.code === "23505") {
        return NextResponse.json(
          { error: "Hiçbir kayıt aktarılmadı: dosyadaki bir Depo No başka bir aktif kayıtta ya da dosyada iki kez kullanılıyor. Depo No'yu boş bırakırsanız otomatik verilir." },
          { status: 409 }
        );
      }
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
