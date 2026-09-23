import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Ağırlıklı olarak "saf" mantığı (DB/Next.js runtime'ına dokunmayan src/lib
// fonksiyonları) test ediyoruz — bkz. görüşme notları: dış servislere
// (iyzico, Vercel Blob) bağımlı kod zaten gerçek sandbox çağrılarıyla
// doğrulanıyor, mock'lu bir birim test o sınıf hataları (yanlış alan
// adı, dokümante edilmemiş API davranışı) yakalamaz. node environment
// yeterli, jsdom gerekmiyor.
//
// İSTİSNA: src/lib/productStock.test.ts BİLEREK gerçek DB'ye dokunuyor —
// aynı "mock hiçbir zaman gerçek bir tutarsızlık hatasını yakalamaz"
// gerekçesi, iki tablonun senkron kalması gereken bir bug'da (bkz. o
// dosyanın başındaki not) DB için de geçerli. setupFiles, .env.local'i
// test dosyalarının kendi importları (ör. src/lib/db.ts'in Pool'u)
// değerlendirilmeden ÖNCE yükler — DATABASE_URL yoksa o dosyadaki testler
// sessizce atlanır.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
