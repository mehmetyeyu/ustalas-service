import { config } from "dotenv";

// Test dosyaları içindeki `import pool from "./db"` gibi importlar modül
// grafiği evrildiğinde hemen çalışır (Pool DATABASE_URL'i o an okur) — bu
// yüzden env'i test dosyasının kendi içinde değil, Vitest'in her test
// dosyasından ÖNCE çalıştırdığı bu setup dosyasında yüklemek gerekiyor.
config({ path: ".env.local" });
