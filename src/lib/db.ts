import { Pool } from "@neondatabase/serverless";
import * as Sentry from "@sentry/nextjs";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Havuzdaki BOŞTA duran bir client'ın bağlantısı (Neon'un boşta kalan
// bağlantıları kapatması, ağ kesintisi vb.) koptuğunda pool 'error' olayı
// yayınlıyor — dinleyen olmazsa Node bunu yakalanmamış (unhandled)
// istisna sayıyor ve isteği "Fatal" olarak çökertiyor (gerçek Sentry
// raporunda "Connection terminated unexpectedly" / GET /api/appointments
// ile saptandı). Bu, o an sürmekte olan bir sorguyu etkilemez — sadece
// havuzun kendini temizlemesini sağlar, sonraki sorgu yeni bir bağlantı
// açar.
pool.on("error", (err: Error) => {
  console.error("pg pool — boşta bağlantı hatası (zararsız, havuz kendini temizler):", err);
  Sentry.captureException(err, { tags: { source: "pg_pool_idle_error" } });
});

export default pool;
