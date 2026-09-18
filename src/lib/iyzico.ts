import crypto from "node:crypto";

// iyzico Abonelik (Subscription V2) API istemcisi — bkz. plan
// (~/.claude/plans/golden-jingling-spindle.md). Resmi `iyzipay` npm
// paketinin V2 Abonelik uçlarını tam kapsayıp kapsamadığı doğrulanamadığı
// için doğrudan REST + kendi IYZWSv2/HMAC-SHA256 imzalamamızla gidiyoruz.
//
// ÖNEMLİ: bu imza formatı (randomKey + uriPath + body → HMAC-SHA256 →
// hex → "apiKey:...&randomKey:...&signature:..." → base64) tek, özetlenmiş
// bir kaynaktan doğrulandı — gerçek sandbox anahtarları gelince, herhangi
// bir üretim çağrısından ÖNCE docs.iyzico.com/en/getting-started/
// preliminaries/authentication/hmacsha256-auth sayfasındaki birebir örnekle
// karşılaştırılıp tek bir düşük riskli GET çağrısıyla doğrulanmalı.
const API_KEY = process.env.IYZICO_API_KEY;
const SECRET_KEY = process.env.IYZICO_SECRET_KEY;
const BASE_URL = process.env.IYZICO_BASE_URL; // sandbox: https://sandbox-api.iyzipay.com

function assertConfigured(): void {
  if (!API_KEY || !SECRET_KEY || !BASE_URL) {
    throw new Error("iyzico API anahtarları (.env: IYZICO_API_KEY/IYZICO_SECRET_KEY/IYZICO_BASE_URL) tanımlı değil.");
  }
}

function buildAuthHeader(uriPath: string, bodyStr: string): { authorization: string; randomKey: string } {
  assertConfigured();
  const randomKey = `${Date.now()}${crypto.randomInt(100000000, 999999999)}`;
  const message = randomKey + uriPath + bodyStr;
  const signature = crypto.createHmac("sha256", SECRET_KEY!).update(message).digest("hex");
  const authStr = `apiKey:${API_KEY}&randomKey:${randomKey}&signature:${signature}`;
  const authorization = `IYZWSv2 ${Buffer.from(authStr, "utf8").toString("base64")}`;
  return { authorization, randomKey };
}

// iyzico'nun V1 API'sindeki yerleşik konvansiyon, gerçek alanların üst
// seviyede değil `data` altında dönmesidir (ör. `{ status, data: {...} }`).
// V2 Abonelik uçlarının da aynı zarfı kullandığı VARSAYILIYOR — araştırma
// bunu kesinleştiremedi. Sandbox anahtarlarıyla yapılacak ilk gerçek
// çağrıda bu varsayım (aşağıdaki `unwrap`) doğrulanmalı; yanlışsa tek
// düzeltme noktası burasıdır.
function unwrap<T>(raw: { status?: string; errorMessage?: string; data?: T } & Record<string, unknown>, uriPath: string): T {
  if (raw.status === "failure") {
    throw new Error(`iyzico hatası (${uriPath}): ${raw.errorMessage || "bilinmeyen hata"}`);
  }
  return (raw.data ?? (raw as unknown)) as T;
}

async function iyzicoRequest<T = Record<string, unknown>>(
  method: "GET" | "POST",
  uriPath: string,
  body?: Record<string, unknown>
): Promise<T> {
  assertConfigured();
  // Body, imzalanan STRING ile isteğe giden STRING birebir aynı olmalı —
  // aksi halde imza sunucu tarafında uyuşmaz (bkz. yukarısı). GET
  // isteğinde fetch'e hiç body verilmediğinden ("body: undefined" —
  // aşağıya bkz.) imza de boş string ile hesaplanmalı; "{}" ile imzalayıp
  // gerçekte hiçbir şey göndermemek gerçek bir çağrıda "Authentication
  // token is not verified" hatasına yol açtı (getPricingPlan ile
  // saptandı). Body'li POST'larda (ör. ürün/plan oluşturma) davranış
  // aynı kalır.
  const bodyStr = method === "GET" ? "" : (body ? JSON.stringify(body) : "{}");
  const { authorization, randomKey } = buildAuthHeader(uriPath, bodyStr);

  const res = await fetch(`${BASE_URL}${uriPath}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: authorization,
      "x-iyzi-rnd": randomKey,
    },
    body: method === "GET" ? undefined : bodyStr,
  });

  const raw = await res.json();
  if (!res.ok) {
    throw new Error(`iyzico hatası (${uriPath}): ${raw.errorMessage || res.statusText}`);
  }
  return unwrap<T>(raw, uriPath);
}

// --- Ürün / Fiyat Planı (bkz. scripts/iyzico-setup.mjs — tek seferlik kurulum) ---

// docs.iyzico.com/en/products/subscription/subscription-implementation/
// subscription-product.md ile doğrulandı — ürünün KENDİ referans kodu
// "referenceCode" (önceden yanlışlıkla "productReferenceCode" varsayılmıştı,
// gerçek sandbox çağrısında "Sistem hatası" ile fark edildi — o hata
// aslında imzalamadan değil, hesapta Abonelik add-on'ının henüz aktif
// olmamasından kaynaklanıyordu, ayrıca bu alan adı sorunu ortaya çıktı).
export interface IyzicoProduct {
  referenceCode: string;
  name: string;
}

export async function createProduct(name: string, description?: string): Promise<IyzicoProduct> {
  return iyzicoRequest("POST", "/v2/subscription/products", { name, description });
}

// docs.iyzico.com/en/products/subscription/subscription-implementation/
// payment-plan.md ile doğrulandı — planın KENDİ referans kodu da
// "referenceCode" (yanıt ayrıca planın bağlı olduğu ürünü belirten ayrı
// bir "productReferenceCode" alanı da içeriyor, o farklı bir şey).
export interface IyzicoPricingPlan {
  referenceCode: string;
  productReferenceCode: string;
  name: string;
  price: string;
  currencyCode: string;
  paymentInterval: "MONTHLY" | "YEARLY";
}

export async function createPricingPlan(
  productReferenceCode: string,
  params: { name: string; price: string; currencyCode: "USD" | "TRY" | "EUR"; paymentInterval: "MONTHLY" | "YEARLY"; trialPeriodDays?: number }
): Promise<IyzicoPricingPlan> {
  return iyzicoRequest("POST", `/v2/subscription/products/${productReferenceCode}/pricing-plans`, {
    ...params,
    planPaymentType: "RECURRING",
  });
}

export async function getPricingPlan(pricingPlanReferenceCode: string): Promise<IyzicoPricingPlan> {
  return iyzicoRequest("GET", `/v2/subscription/pricing-plans/${pricingPlanReferenceCode}`);
}

// --- Checkout (bkz. /api/billing/checkout, /api/billing/switch-plan, /api/billing/callback) ---

export interface IyzicoCustomer {
  name: string;
  surname: string;
  email: string;
  gsmNumber?: string;
  identityNumber: string;
  billingAddress: { contactName: string; city: string; country: string; address: string };
}

// iyzico E.164 bekliyor (ör. "+905555555555") — kayıt formlarımızdan gelen
// telefon numaraları Türkiye'de yaygın yerel biçimde ("0555 555 55 55")
// saklanıyor, bu da "Geçersiz telefon numarası" hatasıyla reddedildi
// (gerçek bir sandbox çağrısıyla saptandı). Sadece 0 ile başlayan 11
// haneli TR numaraları ve zaten +90/90 ile başlayanlar normalize edilir;
// tanınmayan bir biçimse dokunulmadan bırakılır (iyzico kendi hata
// mesajını versin, burada sessizce yanlış bir numara üretmeyelim).
function normalizeGsmNumber(phone: string): string {
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.length === 11 && digits.startsWith("0")) return `+90${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith("90")) return `+${digits}`;
  if (digits.length === 10) return `+90${digits}`;
  return phone.startsWith("+") ? phone : `+${digits || phone}`;
}

// checkout ve plan değiştirme aynı tenant→customer dönüşümünü kullanır.
export function buildCustomerFromTenant(tenant: {
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
}): IyzicoCustomer {
  const [firstName, ...rest] = (tenant.contact_name || tenant.name).trim().split(/\s+/);
  const surname = rest.length > 0 ? rest.join(" ") : firstName;
  return {
    name: firstName,
    surname,
    email: tenant.contact_email || "",
    gsmNumber: tenant.contact_phone ? normalizeGsmNumber(tenant.contact_phone) : undefined,
    // iyzico kimlik numarası zorunlu tutuyor; B2B abonelikte gerçek bir
    // TC/vergi no yerine bu placeholder kullanılıyor — sandbox'ta gerçek
    // bir çağrıyla bunun kabul edilip edilmediği doğrulanmalı (bkz. plan).
    identityNumber: "11111111111",
    billingAddress: {
      contactName: tenant.contact_name || tenant.name,
      city: "İstanbul",
      country: "Türkiye",
      address: tenant.name,
    },
  };
}

export interface CheckoutFormInitResult {
  token: string;
  checkoutFormContent?: string;
  paymentPageUrl?: string;
  [key: string]: unknown;
}

export async function initializeCheckoutForm(params: {
  conversationId: string;
  callbackUrl: string;
  pricingPlanReferenceCode: string;
  subscriptionInitialStatus: "ACTIVE" | "PENDING";
  trialPeriodDays?: number;
  customer: IyzicoCustomer;
}): Promise<CheckoutFormInitResult> {
  return iyzicoRequest("POST", "/v2/subscription/checkoutform/initialize", params);
}

// Gerçek bir sandbox çağrısıyla doğrulandı — önceki varsayım (status,
// subscriptionReferenceCode, conversationId alanları) tamamen yanlıştı.
// Bu uç nokta aslında oluşan ABONELİĞİN kendisini döndürüyor: kendi
// referans kodu "referenceCode" (subscriptionReferenceCode DEĞİL),
// başarı "subscriptionStatus === 'ACTIVE'" ile anlaşılıyor (status alanı
// hiç yok), ve "conversationId" HİÇ dönmüyor — tenant eşleştirmesi bu
// yüzden checkout başlatılırken ayrıca kaydedilen bir token→tenant
// eşleşmesinden yapılmalı (bkz. iyzico_checkout_sessions, /api/billing/callback).
export interface CheckoutFormResult {
  referenceCode?: string;
  parentReferenceCode?: string;
  pricingPlanReferenceCode?: string;
  customerReferenceCode?: string;
  subscriptionStatus?: string;
  trialDays?: number;
  createdDate?: number;
  startDate?: number;
  [key: string]: unknown;
}

export async function retrieveCheckoutForm(token: string): Promise<CheckoutFormResult> {
  return iyzicoRequest("GET", `/v2/subscription/checkoutform/${token}`);
}

// --- Abonelik yaşam döngüsü (bkz. /api/billing/cancel, /api/billing/switch-plan) ---

export async function cancelSubscription(subscriptionReferenceCode: string): Promise<Record<string, unknown>> {
  return iyzicoRequest("POST", `/v2/subscription/subscriptions/${subscriptionReferenceCode}/cancel`);
}

export async function getSubscription(subscriptionReferenceCode: string): Promise<Record<string, unknown>> {
  return iyzicoRequest("GET", `/v2/subscription/subscriptions/${subscriptionReferenceCode}`);
}

interface SubscriptionOrder {
  referenceCode: string;
  orderStatus?: string;
  paymentAttempts?: Array<{ paymentId?: string | number }>;
}

// IFN (bkz. database/schema.sql iyzico_payments notu) bize sadece paymentId
// veriyor — hangi tenant'a ait olduğunu bulabilmemiz için her başarılı
// tahsilatta paymentId'yi KENDİMİZ paymentAttempts'ten çekip saklamamız
// gerekiyor (/payment/detail orijinal conversationId'yi geri vermiyor,
// gerçek bir çağrıyla doğrulandı). orderReferenceCode verilirse o order
// aranır (yenileme webhook'u — bkz. /api/webhooks/iyzico); verilmezse ilk
// SUCCESS order alınır (ilk aktivasyon — bkz. /api/billing/callback, o an
// tek bir SUCCESS order olması beklenir).
export async function findPaymentId(subscriptionReferenceCode: string, orderReferenceCode?: string): Promise<string | null> {
  const sub = await getSubscription(subscriptionReferenceCode) as { orders?: SubscriptionOrder[] };
  const order = orderReferenceCode
    ? sub.orders?.find((o) => o.referenceCode === orderReferenceCode)
    : sub.orders?.find((o) => o.orderStatus === "SUCCESS");
  const lastAttempt = order?.paymentAttempts?.[order.paymentAttempts.length - 1];
  return lastAttempt?.paymentId != null ? String(lastAttempt.paymentId) : null;
}

// docs.iyzico.com/en/products/subscription/subscription-implementation/
// subscription-transactions.md ile doğrulandı — hedef plan AYNI ürüne ve
// AYNI ödeme periyoduna (paymentInterval + paymentIntervalCount) ait olmak
// zorunda (Aylık↔Yıllık arası çalışmaz, bkz. /api/billing/switch-plan'ın
// neden iptal+yeni checkout kullandığı). upgradePeriod="NEXT_PERIOD" ile
// kart bilgisi istenmeden, mevcut (zaten ödenmiş) döneme dokunmadan bir
// SONRAKİ tahsilata yeni fiyat uygulanır — bkz. scripts/
// reprice-subscriptions.mjs (cron). resetRecurrenceCount=false: dönem
// bitiş tarihi mevcut plandan aynen yeni plana taşınır, sıfırlanmaz.
//
// ÖNEMLİ (gerçek bir sandbox çağrısıyla saptandı): upgrade, VERİLEN
// subscriptionReferenceCode'u YERİNDE güncellemiyor — o referansı
// "UPGRADED" durumuna çekip AYNI parentReferenceCode altında YENİ bir
// abonelik nesnesi (yeni referenceCode, subscriptionStatus="ACTIVE")
// oluşturuyor; bu yeni referenceCode doğrudan bu çağrının yanıtında
// dönüyor. Çağıran taraf tenants.billing_subscription_ref'i mutlaka bu
// YENİ referansla güncellemeli — aksi halde sonraki cancel/upgrade/webhook
// eşleştirmeleri artık pasif olan eski referansı hedefler.
export interface UpgradeSubscriptionResult {
  referenceCode: string;
  parentReferenceCode?: string;
  pricingPlanReferenceCode?: string;
  customerReferenceCode?: string;
  subscriptionStatus?: string;
  [key: string]: unknown;
}

export async function upgradeSubscription(
  subscriptionReferenceCode: string,
  newPricingPlanReferenceCode: string,
  upgradePeriod: "NOW" | "NEXT_PERIOD"
): Promise<UpgradeSubscriptionResult> {
  return iyzicoRequest("POST", `/v2/subscription/subscriptions/${subscriptionReferenceCode}/upgrade`, {
    newPricingPlanReferenceCode,
    upgradePeriod,
    useTrial: false,
    resetRecurrenceCount: false,
  });
}

// --- Webhook imza doğrulaması (bkz. /api/webhooks/iyzico) ---
// X-IYZ-SIGNATURE-V3 header'ı — iyzico entegrasyon ekibi hesapta AÇMADIĞI
// sürece bu header hiç gelmez; env IYZICO_WEBHOOK_SIGNATURE_ENABLED=true
// olmadan çağıran kod bu fonksiyonu hiç kullanmamalı (bkz. webhook route'u).
export function verifyWebhookSignature(params: {
  signatureHeader: string;
  merchantId: string;
  eventType: string;
  subscriptionReferenceCode: string;
  orderReferenceCode: string;
  customerReferenceCode: string;
}): boolean {
  assertConfigured();
  const message =
    params.merchantId + SECRET_KEY + params.eventType + params.subscriptionReferenceCode +
    params.orderReferenceCode + params.customerReferenceCode;
  const expected = crypto.createHmac("sha256", SECRET_KEY!).update(message).digest("hex");
  // Sabit zamanlı karşılaştırma — string eşitliği (===) erken çıkışla ilk
  // uyuşmayan karakterde durur, bu da (teorik de olsa) zamanlama yan kanalı
  // ile imza tahminine izin verir. Uzunluklar farklıysa timingSafeEqual
  // exception atar, bu yüzden önce kontrol ediliyor.
  const expectedBuf = Buffer.from(expected, "hex");
  const receivedBuf = Buffer.from(params.signatureHeader, "hex");
  if (expectedBuf.length !== receivedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, receivedBuf);
}
