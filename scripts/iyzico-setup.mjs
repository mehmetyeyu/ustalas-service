// Sadece iyzico Abonelik ÜRÜNÜ'nü (Product) TEK SEFERLİK oluşturur —
// fiyat planı oluşturma/güncelleme artık burada DEĞİL, süper admin
// panelinden yapılıyor (Platform Fiyatlandırması kutusu →
// src/app/api/super-admin/pricing/route.ts → src/lib/platformPricing.ts,
// bkz. database/schema.sql platform_pricing notu) — ilk checkout/cron
// çağrısında ensurePricingPlanRef kendi planlarını otomatik oluşturur
// (self-healing), bu yüzden burada elle plan oluşturmaya gerek yok.
// src/lib/iyzico.ts'in imzalama mantığını (bu script düz `node` ile
// çalıştığından "@/" alias'ını çözemez, bkz. scripts/create-tenant.mjs'in
// aynı gerekçesi) kendi başına tekrarlar.
//
// Kullanım: node scripts/iyzico-setup.mjs
// (IYZICO_PRODUCT_REF .env.local'de zaten tanımlıysa hiçbir şey yapmaz —
// yeni bir ortama (ör. production'a ilk geçiş) kurulum için kullanılır.)
//
// .env.local'de IYZICO_API_KEY, IYZICO_SECRET_KEY, IYZICO_BASE_URL
// (sandbox: https://sandbox-api.iyzipay.com) tanımlı olmalı.
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import nextEnv from "@next/env";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
nextEnv.loadEnvConfig(path.join(__dirname, ".."));

const API_KEY = process.env.IYZICO_API_KEY;
const SECRET_KEY = process.env.IYZICO_SECRET_KEY;
const BASE_URL = process.env.IYZICO_BASE_URL;

if (!API_KEY || !SECRET_KEY || !BASE_URL) {
  console.error("Hata: .env.local'de IYZICO_API_KEY / IYZICO_SECRET_KEY / IYZICO_BASE_URL eksik.");
  process.exit(1);
}

if (process.env.IYZICO_PRODUCT_REF) {
  console.log("IYZICO_PRODUCT_REF zaten tanımlı, yapılacak bir şey yok:", process.env.IYZICO_PRODUCT_REF);
  process.exit(0);
}

function buildAuthHeader(uriPath, bodyStr) {
  const randomKey = `${Date.now()}${crypto.randomInt(100000000, 999999999)}`;
  const message = randomKey + uriPath + bodyStr;
  const signature = crypto.createHmac("sha256", SECRET_KEY).update(message).digest("hex");
  const authStr = `apiKey:${API_KEY}&randomKey:${randomKey}&signature:${signature}`;
  return { authorization: `IYZWSv2 ${Buffer.from(authStr, "utf8").toString("base64")}`, randomKey };
}

// Gerçek sandbox çağrısıyla doğrulandı: alanlar `data` altında dönüyor
// (varsayım doğruydu) ama referans kodu alan adı `referenceCode` —
// `productReferenceCode` DEĞİL (bkz. docs.iyzico.com/en/products/
// subscription/subscription-implementation/subscription-product.md). Ham
// yanıt yine de konsola basılıyor, ileride başka bir varsayım yanlış
// çıkarsa hemen görülsün.
async function iyzicoRequest(method, uriPath, body) {
  const bodyStr = body ? JSON.stringify(body) : "{}";
  const { authorization, randomKey } = buildAuthHeader(uriPath, bodyStr);
  const res = await fetch(`${BASE_URL}${uriPath}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: authorization, "x-iyzi-rnd": randomKey },
    body: method === "GET" ? undefined : bodyStr,
  });
  const raw = await res.json();
  console.log(`  (ham yanıt — ${uriPath}):`, JSON.stringify(raw));
  if (!res.ok || raw.status === "failure") {
    throw new Error(`iyzico hatası (${uriPath}): ${raw.errorMessage || res.statusText}`);
  }
  return raw.data ?? raw;
}

const product = await iyzicoRequest("POST", "/v2/subscription/products", {
  name: "Elevire Abonelik",
  description: "Lastik Servisi Yönetim Sistemi - aylık/yıllık abonelik",
});
console.log("\nÜrün oluşturuldu:", product.referenceCode);
console.log("\n.env.local'e ekle:");
console.log(`IYZICO_PRODUCT_REF=${product.referenceCode}`);
console.log("\nArdından süper admin panelinden (Platform Fiyatlandırması) fiyatı girip kaydedin — ilk kayıt anında iyzico fiyat planları otomatik oluşturulur.");
