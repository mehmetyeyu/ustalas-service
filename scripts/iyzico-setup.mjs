// iyzico Abonelik ürünü + Aylık/Yıllık fiyat planlarını TEK SEFERLİK
// oluşturur — bkz. plan (~/.claude/plans/golden-jingling-spindle.md).
// src/lib/iyzico.ts'in imzalama mantığını (bu script düz `node` ile
// çalıştığından "@/" alias'ını çözemez, bkz. scripts/create-tenant.mjs'in
// aynı gerekçesi) kendi başına tekrarlar.
//
// Fiyatlar USD bazlıdır — DB/Vercel maliyetleri dolar olduğundan TL
// aşınmasına karşı marj korumak için (bkz. plan). Landing sayfasındaki
// TL karşılığı ayrıca canlı kurla hesaplanır, buradaki USD fiyatla
// senkron kalmalı (bkz. src/app/elevire/page.tsx PRICING sabiti).
//
// Kullanım: node scripts/iyzico-setup.mjs <aylık-fiyat-usd> <yıllık-fiyat-usd>
// Örnek:    node scripts/iyzico-setup.mjs 25.00 250.00
//
// .env.local'de IYZICO_API_KEY, IYZICO_SECRET_KEY, IYZICO_BASE_URL
// (sandbox: https://sandbox-api.iyzipay.com) tanımlı olmalı. Çıktıdaki üç
// referans kodu .env.local'e (IYZICO_PRODUCT_REF, IYZICO_PLAN_MONTHLY_REF,
// IYZICO_PLAN_YEARLY_REF) elle kopyalanır. Hem sandbox hem (onay gelince)
// production ortamı için AYRI AYRI çalıştırılmalı — referans kodları
// ortamlar arası taşınmaz.
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

const [monthlyPrice, yearlyPrice] = process.argv.slice(2);
if (!monthlyPrice || !yearlyPrice) {
  console.error("Kullanım: node scripts/iyzico-setup.mjs <aylık-fiyat> <yıllık-fiyat>");
  process.exit(1);
}

function buildAuthHeader(uriPath, bodyStr) {
  const randomKey = `${Date.now()}${crypto.randomInt(100000000, 999999999)}`;
  const message = randomKey + uriPath + bodyStr;
  const signature = crypto.createHmac("sha256", SECRET_KEY).update(message).digest("hex");
  const authStr = `apiKey:${API_KEY}&randomKey:${randomKey}&signature:${signature}`;
  return { authorization: `IYZWSv2 ${Buffer.from(authStr, "utf8").toString("base64")}`, randomKey };
}

// NOT: iyzico'nun gerçek alanları `data` altında mı üst seviyede mi
// döndüğü ve referans kodu alan adının tam olarak ne olduğu (bu script
// `productReferenceCode`/`pricingPlanReferenceCode` varsayıyor, bkz.
// src/lib/iyzico.ts'teki aynı varsayım) araştırmayla kesinleştirilemedi.
// İlk gerçek sandbox çağrısında konsola tam ham yanıtı da basıyoruz ki
// varsayım yanlışsa hemen görülüp düzeltilebilsin.
async function iyzicoRequest(method, uriPath, body) {
  const bodyStr = body ? JSON.stringify(body) : "{}";
  const { authorization, randomKey } = buildAuthHeader(uriPath, bodyStr);
  const res = await fetch(`${BASE_URL}${uriPath}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: authorization, "x-iyzi-rnd": randomKey },
    body: method === "GET" ? undefined : bodyStr,
  });
  const raw = await res.json();
  if (!res.ok || raw.status === "failure") {
    throw new Error(`iyzico hatası (${uriPath}): ${raw.errorMessage || res.statusText}`);
  }
  console.log(`  (ham yanıt — ${uriPath}):`, JSON.stringify(raw));
  return raw.data ?? raw;
}

const product = await iyzicoRequest("POST", "/v2/subscription/products", {
  name: "Elevire Abonelik",
  description: "Lastik Servisi Yönetim Sistemi - aylık/yıllık abonelik",
});
console.log("Ürün oluşturuldu:", product.productReferenceCode);

const monthly = await iyzicoRequest("POST", `/v2/subscription/products/${product.productReferenceCode}/pricing-plans`, {
  name: "Aylık",
  price: monthlyPrice,
  currencyCode: "USD",
  paymentInterval: "MONTHLY",
  planPaymentType: "RECURRING",
});
console.log("Aylık plan oluşturuldu:", monthly.pricingPlanReferenceCode);

const yearly = await iyzicoRequest("POST", `/v2/subscription/products/${product.productReferenceCode}/pricing-plans`, {
  name: "Yıllık",
  price: yearlyPrice,
  currencyCode: "USD",
  paymentInterval: "YEARLY",
  planPaymentType: "RECURRING",
});
console.log("Yıllık plan oluşturuldu:", yearly.pricingPlanReferenceCode);

console.log("\n.env.local'e ekle:");
console.log(`IYZICO_PRODUCT_REF=${product.productReferenceCode}`);
console.log(`IYZICO_PLAN_MONTHLY_REF=${monthly.pricingPlanReferenceCode}`);
console.log(`IYZICO_PLAN_YEARLY_REF=${yearly.pricingPlanReferenceCode}`);
