import pool from "./db";
import { createPricingPlan, getPricingPlan } from "./iyzico";

// Platform genelinde SABİT TL fiyatlandırma — bkz. database/schema.sql
// platform_pricing notu. Kullanıcıları dolar kuruyla korkutmamak için USD/
// TCMB kur bazlı vitrin fiyatı (eski exchangeRate.ts USD_REFERENCE_PRICING)
// tamamen kaldırıldı, yerine süper adminin panelden belirlediği sabit TL
// fiyatı geldi.

const PRODUCT_REF = process.env.IYZICO_PRODUCT_REF;

export interface PlatformPricing {
  monthlyPrice: number;
  yearlyPrice: number;
  monthlyPricingPlanRef: string | null;
  yearlyPricingPlanRef: string | null;
}

export async function getPlatformPricing(): Promise<PlatformPricing> {
  const result = await pool.query<{
    monthly_price: string;
    yearly_price: string;
    monthly_pricing_plan_ref: string | null;
    yearly_pricing_plan_ref: string | null;
  }>(
    "SELECT monthly_price, yearly_price, monthly_pricing_plan_ref, yearly_pricing_plan_ref FROM platform_pricing WHERE id = 1"
  );
  const row = result.rows[0];
  if (!row) throw new Error("platform_pricing satırı bulunamadı — migration çalıştırılmamış olabilir.");
  return {
    monthlyPrice: Number(row.monthly_price),
    yearlyPrice: Number(row.yearly_price),
    monthlyPricingPlanRef: row.monthly_pricing_plan_ref,
    yearlyPricingPlanRef: row.yearly_pricing_plan_ref,
  };
}

// checkout/switch-plan/cron'un ortak ihtiyacı: "şu an geçerli iyzico plan
// referansı". Kayıtlı referans varsa VE iyzico'daki fiyatı platform_pricing
// ile hâlâ uyuşuyorsa aynen kullanılır (gereksiz plan çöplüğü oluşmaz);
// referans yoksa (ilk kullanım) veya iyzico'da bulunamıyorsa/fiyatı
// uyuşmuyorsa yeni bir plan oluşturulup kalıcı hale getirilir. Normal
// akışta yeni plan oluşturma sadece updatePlatformPricing() içinde,
// süper admin fiyatı DEĞİŞTİRDİĞİNDE olur — burası çoğunlukla mevcut
// referansı okuyan hızlı bir yol, ilk deploy/kurtarma senaryosu için
// kendiliğinden iyileşen (self-healing) bir güvenlik ağıdır.
export async function ensurePricingPlanRef(
  planKey: "monthly" | "yearly"
): Promise<{ price: number; pricingPlanRef: string }> {
  if (!PRODUCT_REF) throw new Error("IYZICO_PRODUCT_REF tanımlı değil.");
  const pricing = await getPlatformPricing();
  const price = planKey === "monthly" ? pricing.monthlyPrice : pricing.yearlyPrice;
  const existingRef = planKey === "monthly" ? pricing.monthlyPricingPlanRef : pricing.yearlyPricingPlanRef;

  if (existingRef) {
    try {
      const plan = await getPricingPlan(existingRef);
      if (Number(plan.price) === price) {
        return { price, pricingPlanRef: existingRef };
      }
    } catch {
      // Referans iyzico'da artık bulunamıyor — aşağıda yeniden oluşturulur.
    }
  }

  const newPlan = await createPricingPlan(PRODUCT_REF, {
    name: `${planKey === "yearly" ? "Yıllık" : "Aylık"} (TRY) - ${price} - ${Date.now()}`,
    price: price.toFixed(2),
    currencyCode: "TRY",
    paymentInterval: planKey === "yearly" ? "YEARLY" : "MONTHLY",
  });
  const column = planKey === "monthly" ? "monthly_pricing_plan_ref" : "yearly_pricing_plan_ref";
  await pool.query(`UPDATE platform_pricing SET ${column} = $1 WHERE id = 1`, [newPlan.referenceCode]);
  return { price, pricingPlanRef: newPlan.referenceCode };
}

// Süper admin fiyatı güncellediğinde çağrılır. Yeni fiyatlar kaydedilip
// eski plan referansları temizlenir, ardından HEMEN (lazy değil) iki yeni
// iyzico planı oluşturulur — süper admin "Kaydet"e bastığı anda bir
// iyzico hatası varsa hemen görsün isteriz, ilk gerçek müşteri
// denemesinde sessizce patlamasın.
export async function updatePlatformPricing(monthlyPrice: number, yearlyPrice: number): Promise<void> {
  await pool.query(
    `UPDATE platform_pricing
     SET monthly_price = $1, yearly_price = $2,
         monthly_pricing_plan_ref = NULL, yearly_pricing_plan_ref = NULL,
         updated_at = NOW()
     WHERE id = 1`,
    [monthlyPrice, yearlyPrice]
  );
  await Promise.all([ensurePricingPlanRef("monthly"), ensurePricingPlanRef("yearly")]);
}
