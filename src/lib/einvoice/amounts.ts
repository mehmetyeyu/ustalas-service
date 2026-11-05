// Sipariş tutarlarından fatura satırları (docs/e-fatura-tasarim.md §6).
// Sipariş tarafında her şey KDV DAHİL (kullanıcı kararı 2026-10-30;
// order_services.unit_price satır toplamıdır, bkz. orderLineAmounts,
// src/lib/quotes.ts). Sağlayıcılar (Paraşüt) birim fiyatı KDV HARİÇ ister —
// burada net birim fiyat ve satır indirimi geri hesaplanır. Sipariş
// indirimi (total_amount - paid_amount, kurumsal indirim dahil) satırlara
// tutarlarıyla orantılı dağıtılır, kuruş farkı son satıra yazılır ki
// faturanın genel toplamı müşterinin ödediğiyle birebir aynı olsun.
// Para hesabı kuruş tamsayılarıyla yapılır.

export interface InvoiceSourceLine {
  localKey: string;        // 'service:<id>' | 'tire:<stok kodu>' — ürün eşlemesi
  description: string;
  quantity: number;
  grossTotal: number;      // satır toplamı, KDV dahil (order_services.unit_price)
  vatRate: number;         // 0 | 1 | 10 | 20
}

export interface InvoiceLine {
  localKey: string;
  description: string;
  quantity: number;
  unitPriceNet: number;    // KDV hariç birim fiyat, 4 ondalık
  vatRate: number;
  discountNet: number;     // KDV hariç satır indirimi (tutar), 2 ondalık
  grossAfterDiscount: number;
  netAfterDiscount: number;
  vat: number;
}

export interface InvoiceAmounts {
  lines: InvoiceLine[];
  net: number;
  vat: number;
  gross: number;           // müşterinin ödediği, KDV dahil
  discountGross: number;
}

// Sağlayıcının hesapladığı genel toplamla bizimki arasındaki kabul edilebilir
// fark (satır bazında KDV yuvarlaması). Aşılırsa resmileştirmeye geçilmez.
export const PROVIDER_TOTAL_TOLERANCE = 0.05;

// Satır açıklaması üst sınırı (Paraşüt entegrasyonlarında görülen sınır).
export const LINE_DESCRIPTION_MAX = 120;

const toKurus = (n: number) => Math.round((n + Number.EPSILON) * 100);
const fromKurus = (k: number) => k / 100;
const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10_000) / 10_000;

export function buildInvoiceAmounts(source: InvoiceSourceLine[], discountGross = 0): InvoiceAmounts {
  if (source.length === 0) throw new Error("Faturada en az bir satır olmalı.");
  for (const l of source) {
    if (!(l.quantity > 0)) throw new Error("Satır adedi sıfırdan büyük olmalı.");
    if (!(l.grossTotal >= 0)) throw new Error("Satır tutarı negatif olamaz.");
  }
  const grossK = source.map((l) => toKurus(l.grossTotal));
  const totalK = grossK.reduce((s, k) => s + k, 0);
  const discountK = Math.min(Math.max(toKurus(discountGross), 0), totalK);

  // İndirimi tutarla orantılı dağıt; kalan kuruş son tutarlı satıra.
  const shareK = grossK.map((k) => (totalK === 0 ? 0 : Math.floor((k * discountK) / totalK)));
  let rest = discountK - shareK.reduce((s, k) => s + k, 0);
  for (let i = shareK.length - 1; i >= 0 && rest > 0; i--) {
    const room = grossK[i] - shareK[i];
    const add = Math.min(room, rest);
    shareK[i] += add;
    rest -= add;
  }

  const lines = source.map((l, i): InvoiceLine => {
    const factor = 1 + l.vatRate / 100;
    const afterK = grossK[i] - shareK[i];
    const netAfterK = Math.round(afterK / factor);
    const netBefore = fromKurus(grossK[i]) / factor;
    const netAfter = fromKurus(netAfterK);
    return {
      localKey: l.localKey,
      description: l.description.slice(0, LINE_DESCRIPTION_MAX),
      quantity: l.quantity,
      unitPriceNet: round4(netBefore / l.quantity),
      vatRate: l.vatRate,
      discountNet: Math.max(0, fromKurus(Math.round((netBefore - netAfter) * 100))),
      grossAfterDiscount: fromKurus(afterK),
      netAfterDiscount: netAfter,
      vat: fromKurus(afterK - netAfterK),
    };
  });

  const netK = lines.reduce((s, l) => s + toKurus(l.netAfterDiscount), 0);
  const grossAfterK = totalK - discountK;
  return {
    lines,
    net: fromKurus(netK),
    vat: fromKurus(grossAfterK - netK),
    gross: fromKurus(grossAfterK),
    discountGross: fromKurus(discountK),
  };
}

export function withinProviderTolerance(expectedGross: number, providerGross: number): boolean {
  return Math.abs(toKurus(expectedGross) - toKurus(providerGross)) <= toKurus(PROVIDER_TOTAL_TOLERANCE);
}
