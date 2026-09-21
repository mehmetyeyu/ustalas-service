import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Sadece "saf" mantığı (DB/Next.js runtime'ına dokunmayan src/lib
// fonksiyonları) test ediyoruz — bkz. görüşme notları: dış servislere
// (iyzico, Vercel Blob) bağımlı kod zaten gerçek sandbox çağrılarıyla
// doğrulanıyor, mock'lu bir birim test o sınıf hataları (yanlış alan
// adı, dokümante edilmemiş API davranışı) yakalamaz. node environment
// yeterli, jsdom gerekmiyor.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
