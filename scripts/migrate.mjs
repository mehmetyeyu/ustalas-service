// Build-time migration: her `next build` öncesi (dolayısıyla her Vercel
// deploy'unda — hem Ustalas hem Elevire projelerinde) database/schema.sql'i
// DATABASE_URL'e uygular. schema.sql tamamen idempotent olduğundan (IF NOT
// EXISTS, ON CONFLICT DO NOTHING) tekrar tekrar çalıştırmak güvenlidir.
//
// pg (ham TCP) kullanılır, @neondatabase/serverless değil — src/lib/demoSeed.ts
// içindeki notta açıklandığı gibi, serverless paketin WebSocket/fetch tabanlı
// bağlantısı bu tür ortamlarda güvenilir çalışmıyor.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import { Client } from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Vercel'de DATABASE_URL zaten gerçek env var olarak enjekte edilir, ama
// lokalde (npm run build) sadece .env.local'de bulunur — Next.js'in kendisi
// next build/dev sırasında bunu otomatik yükler, ama bu script Next'in
// dışında çalıştığından aynı yükleyiciyi (@next/env, next paketinin
// bağımlılığı) burada elle çağırmak gerekiyor.
nextEnv.loadEnvConfig(path.join(__dirname, ".."));

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("Migration hatası: DATABASE_URL tanımlı değil.");
    process.exit(1);
  }

  const sql = readFileSync(path.join(__dirname, "..", "database", "schema.sql"), "utf8");
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
    console.log("Migration tamamlandı: database/schema.sql uygulandı.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Migration başarısız:", err);
  process.exit(1);
});
