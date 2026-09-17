// iyzico Abonelik ürünü + Aylık/Yıllık fiyat planlarını TEK SEFERLİK
// oluşturur — bkz. plan (~/.claude/plans/golden-jingling-spindle.md).
// src/lib/iyzico.ts'in imzalama mantığını (bu script düz `node` ile
// çalıştığından "@/" alias'ını çözemez, bkz. scripts/create-tenant.mjs'in
// aynı gerekçesi) kendi başına tekrarlar.
//
// Fiyatlar dolar bazlı belirleniyor — DB/Vercel maliyetleri dolar
// olduğundan TL aşınmasına karşı marj korumak için (bkz. plan). AMA
// gerçek tahsilat TRY olarak yapılmalı: yerli (Türkiye'de basılan)
// kartlar döviz (USD/EUR) ile doğrudan ödeme yapamıyor (BDDK kısıtı) —
// gerçek bir denemede "Yerli kart ile döviz ödemesi yapılamaz" hatasıyla
// saptandı. Bu yüzden bu script'e TRY fiyatlar (o günkü TCMB kuruyla
// çevrilmiş) verilir, currencyCode parametresiyle. Bu, iyzico'da SABİT
// bir fiyat demektir — TL zamanla USD karşısında değer kaybettikçe bu
// planı periyodik olarak (yeni bir plan oluşturup env var'ı güncelleyerek)
// yeniden fiyatlamak gerekir, otomatik değildir.
//
// Kullanım: node scripts/iyzico-setup.mjs <aylık-fiyat> <yıllık-fiyat> [currency]
// Örnek:    node scripts/iyzico-setup.mjs 1216.87 12168.73 TRY
//
// IYZICO_PRODUCT_REF .env.local'de zaten tanımlıysa YENİ bir ürün
// oluşturulmaz, mevcut ürüne yeni fiyat planları eklenir (ör. aynı
// "Elevire Abonelik" ürünü altında hem eski USD hem yeni TRY planları
// bir arada durabilir, kullanılmayanlar zararsızca öylece kalır).
//
// .env.local'de IYZICO_API_KEY, IYZICO_SECRET_KEY, IYZICO_BASE_URL
// (sandbox: https://sandbox-api.iyzipay.com) tanımlı olmalı. Çıktıdaki
// referans kodları .env.local'e (IYZICO_PRODUCT_REF, IYZICO_PLAN_MONTHLY_REF,
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

const [monthlyPrice, yearlyPrice, currencyArg] = process.argv.slice(2);
const currencyCode = (currencyArg || "USD").toUpperCase();
if (!monthlyPrice || !yearlyPrice) {
  console.error("Kullanım: node scripts/iyzico-setup.mjs <aylık-fiyat> <yıllık-fiyat> [currency]");
  process.exit(1);
}
if (!["USD", "TRY", "EUR"].includes(currencyCode)) {
  console.error("Geçersiz para birimi (USD/TRY/EUR olmalı):", currencyCode);
  process.exit(1);
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
// `productReferenceCode`/`pricingPlanReferenceCode` DEĞİL (bkz.
// docs.iyzico.com/en/products/subscription/subscription-implementation/
// {subscription-product,payment-plan}.md). Ham yanıt yine de konsola
// basılıyor, ileride başka bir varsayım yanlış çıkarsa hemen görülsün.
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

let productRef = process.env.IYZICO_PRODUCT_REF;
if (productRef) {
  console.log("Mevcut ürün kullanılıyor:", productRef);
} else {
  const product = await iyzicoRequest("POST", "/v2/subscription/products", {
    name: "Elevire Abonelik",
    description: "Lastik Servisi Yönetim Sistemi - aylık/yıllık abonelik",
  });
  productRef = product.referenceCode;
  console.log("Ürün oluşturuldu:", productRef);
}

const monthly = await iyzicoRequest("POST", `/v2/subscription/products/${productRef}/pricing-plans`, {
  name: `Aylık (${currencyCode})`,
  price: monthlyPrice,
  currencyCode,
  paymentInterval: "MONTHLY",
  planPaymentType: "RECURRING",
});
console.log("Aylık plan oluşturuldu:", monthly.referenceCode);

const yearly = await iyzicoRequest("POST", `/v2/subscription/products/${productRef}/pricing-plans`, {
  name: `Yıllık (${currencyCode})`,
  price: yearlyPrice,
  currencyCode,
  paymentInterval: "YEARLY",
  planPaymentType: "RECURRING",
});
console.log("Yıllık plan oluşturuldu:", yearly.referenceCode);

console.log("\n.env.local'e ekle:");
console.log(`IYZICO_PRODUCT_REF=${productRef}`);
console.log(`IYZICO_PLAN_MONTHLY_REF=${monthly.referenceCode}`);
console.log(`IYZICO_PLAN_YEARLY_REF=${yearly.referenceCode}`);
