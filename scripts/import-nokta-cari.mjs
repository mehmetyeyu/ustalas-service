// NOKTA muhasebe yazılımından alınan "Borçlu Cari Hesaplar" raporunu (.xls)
// bir firmanın Cari açılış bakiyeleri olarak içe aktarır. Her müşteri için
// TEK bir "Borç Ekle" kaydı yazılır (uygulamanın kendi "Tahsilat Al / Borç
// Ekle" akışıyla AYNI desen — bkz. src/app/api/customers/[id]/payments/
// route.ts, src/lib/customerLedger.ts validateManualLedgerInput): entry_type
// MANUEL, direction 1, payment_type/kasa_id NULL (uygulama direction=1'de
// ikisini de NULL'a zorluyor, burada da öyle).
//
// Neden "Döviz Borç" ve "Döviz Alacak" AYRI AYRI değil de NET BAKİYE tek
// kayıt olarak aktarılıyor: Alacak (tahsilat) kaydı için uygulama bir
// payment_type (Nakit/POS/Havale...) zorunlu kılıyor — bu rapor geçmiş
// tahsilatların hangi yöntemle yapıldığını söylemiyor, onu uydurmak yanlış
// olur. Net "Bakiye Borç" tek kayıt, bugün itibarıyla doğru bakiyeyi verir
// ve uygulamanın FIFO cari mantığıyla tam uyumludur.
//
// GÜVENLİK: varsayılan DRY-RUN'dır — dosyayı okur, ne yazılacağını gösterir,
// hiçbir şey yazmaz. Gerçekten yazmak için --confirm gerekir.
//
// Kullanım:
//   node scripts/import-nokta-cari.mjs --file=/path/NOKTA.XLS --code=707327            (dry-run)
//   node scripts/import-nokta-cari.mjs --file=/path/NOKTA.XLS --code=707327 --confirm  (gerçekten yazar)
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import { Client } from "pg";
import XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
nextEnv.loadEnvConfig(path.join(__dirname, ".."));

const args = process.argv.slice(2);
const fileArg = args.find((a) => a.startsWith("--file="))?.split("=")[1];
const codeArg = args.find((a) => a.startsWith("--code="))?.split("=")[1]?.trim();
const confirm = args.includes("--confirm");

if (!fileArg || !codeArg) {
  console.error("Kullanım: node scripts/import-nokta-cari.mjs --file=/path/NOKTA.XLS --code=FIRMA_KODU [--confirm]");
  process.exit(1);
}

function parseRows(filePath) {
  // XLSX.readFile (ESM derlemesinde) Node'un fs modülünü otomatik algılamıyor
  // (XLSX.set_fs çağrılmadıkça "Cannot access file" hatası veriyor) — bunun
  // yerine dosyayı kendimiz okuyup XLSX.read(buffer) kullanıyoruz.
  const buffer = readFileSync(filePath);
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: false });
  // İlk 2 satır başlık ("Borçlu Cari Hesaplar" + kolon adları) — veri 3. satırdan başlar.
  const dataRows = raw.slice(2);

  const parsed = [];
  const problems = [];
  for (const [i, row] of dataRows.entries()) {
    const rowNo = i + 3; // Excel'deki gerçek satır no (1-index + 2 başlık)
    const code = String(row[0] ?? "").trim();
    const name = String(row[1] ?? "").trim().replace(/\s+/g, " ");
    const balanceRaw = row[4];
    const balance = balanceRaw != null ? parseFloat(String(balanceRaw).replace(/,/g, "")) : NaN;

    if (!name) { problems.push(`Satır ${rowNo}: isim boş, atlandı.`); continue; }
    if (!Number.isFinite(balance) || balance <= 0) { problems.push(`Satır ${rowNo} (${name}): geçersiz/sıfır bakiye (${balanceRaw}), atlandı.`); continue; }

    parsed.push({ code, name, balance });
  }

  const nameCounts = new Map();
  for (const r of parsed) nameCounts.set(r.name, (nameCounts.get(r.name) ?? 0) + 1);
  for (const [name, count] of nameCounts) {
    if (count > 1) problems.push(`"${name}" dosyada ${count} kez geçiyor — hepsi ayrı müşteri olarak eklenecek, kasıtlıysa yoksayın.`);
  }

  return { parsed, problems };
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL tanımlı değil.");
    process.exit(1);
  }

  const { parsed, problems } = parseRows(fileArg);
  const total = parsed.reduce((s, r) => s + r.balance, 0);

  console.log(`Dosya: ${fileArg}`);
  console.log(`Okunan satır: ${parsed.length}, toplam bakiye: ${total.toFixed(2)}`);
  if (problems.length) {
    console.log("\nUyarılar:");
    problems.forEach((p) => console.log("  - " + p));
  }
  console.log("\nÖrnek (ilk 5):");
  parsed.slice(0, 5).forEach((r) => console.log(`  ${r.code}  ${r.name}  ${r.balance.toFixed(2)}`));

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const tenantResult = await client.query("SELECT id, name FROM tenants WHERE code = $1", [codeArg]);
    if (tenantResult.rows.length === 0) {
      console.error(`\nFirma kodu bulunamadı: ${codeArg}`);
      process.exit(1);
    }
    const { id: tenantId, name: tenantName } = tenantResult.rows[0];
    console.log(`\nFirma: ${tenantName} (tenant_id=${tenantId}, kod=${codeArg})`);
    console.log(confirm ? "MOD: GERÇEKTEN YAZILACAK\n" : "MOD: DRY-RUN (hiçbir şey yazılmayacak)\n");

    if (!confirm) {
      console.log("Gerçekten yazmak için aynı komutu --confirm ile tekrar çalıştırın.");
      return;
    }

    await client.query("BEGIN");
    try {
      let created = 0;
      for (const r of parsed) {
        const customerResult = await client.query(
          `INSERT INTO customers (tenant_id, name) VALUES ($1, $2)
           ON CONFLICT (tenant_id, name) DO UPDATE SET name = EXCLUDED.name
           RETURNING id`,
          [tenantId, r.name]
        );
        const customerId = customerResult.rows[0].id;
        await client.query(
          `INSERT INTO customer_ledger_entries
             (tenant_id, customer_id, entry_type, direction, amount, payment_type, entry_date, note, kasa_id)
           VALUES ($1, $2, 'MANUEL', 1, $3, NULL, CURRENT_DATE, $4, NULL)`,
          [tenantId, customerId, r.balance, `NOKTA aktarımı — Cari Hesap Kodu: ${r.code || "—"}`]
        );
        created++;
      }
      await client.query("COMMIT");
      console.log(`Tamamlandı — ${created} müşteri + açılış bakiyesi yazıldı, toplam ${total.toFixed(2)}.`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("İçe aktarma başarısız:", err);
  process.exit(1);
});
