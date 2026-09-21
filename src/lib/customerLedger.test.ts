import { describe, it, expect } from "vitest";
import { computeOrderLedgerStatus, type LedgerFifoEntry } from "./customerLedger";

// FIFO Cari uzlaşma — bkz. computeOrderLedgerStatus'un kendi yorumu.
// Senaryolar gerçek prod verisiyle (Ahmet Gür, tenant 528875) ve gerçek
// API testleriyle (tenant 338176) bu oturumda zaten doğrulanmıştı; burada
// aynı mantığı regresyona karşı sabitliyoruz.

function debt(orderId: number, amount: number): LedgerFifoEntry {
  return { orderId, direction: 1, amount, paymentType: null };
}
function credit(amount: number, paymentType: string, orderId: number | null = null): LedgerFifoEntry {
  return { orderId, direction: -1, amount, paymentType };
}

describe("computeOrderLedgerStatus", () => {
  it("dokunulmamış bir siparişte remainingAmount originalAmount'a eşit kalır", () => {
    const result = computeOrderLedgerStatus([debt(1, 1000)]);
    expect(result.get(1)).toEqual({ originalAmount: 1000, remainingAmount: 1000, paidVia: null });
  });

  it("tek ödeme tek siparişi tam kapatır", () => {
    const result = computeOrderLedgerStatus([debt(1, 1000), credit(1000, "Nakit")]);
    const status = result.get(1)!;
    expect(status.remainingAmount).toBe(0);
    expect(status.paidVia).toBe("Nakit");
  });

  it("tek toplu ödeme birden fazla eski siparişi sırayla kapatır (Ahmet Gür senaryosu)", () => {
    // Gerçek veri: 400+1000+1000+1000+1000+1000+4000+1000 = 10400, tek
    // kalemde "Nazım Hesap" ile kapatılmıştı — hepsi settled=true çıkmalı.
    const entries: LedgerFifoEntry[] = [
      debt(174, 400), debt(445, 1000), debt(531, 1000), debt(533, 1000),
      debt(554, 1000), debt(584, 1000), debt(679, 4000), debt(701, 1000),
      credit(10400, "Nazım Hesap"),
    ];
    const result = computeOrderLedgerStatus(entries);
    for (const orderId of [174, 445, 531, 533, 554, 584, 679, 701]) {
      const status = result.get(orderId)!;
      expect(status.remainingAmount, `order ${orderId}`).toBe(0);
      expect(status.paidVia, `order ${orderId}`).toBe("Nazım Hesap");
    }
  });

  it("kısmi ödeme en eski siparişleri tam kapatır, sıradaki siparişte kalan bırakır", () => {
    const entries: LedgerFifoEntry[] = [
      debt(722, 1000), debt(723, 1000), debt(724, 1000),
      credit(2500, "POS"),
    ];
    const result = computeOrderLedgerStatus(entries);
    expect(result.get(722)!.remainingAmount).toBe(0);
    expect(result.get(723)!.remainingAmount).toBe(0);
    const last = result.get(724)!;
    expect(last.remainingAmount).toBe(500);
    expect(last.originalAmount).toBe(1000);
    // Kısmen ödenmiş bir siparişe paidVia atanmaz (sadece TAM ödenince
    // dolar) — çağıran taraf (bkz. src/app/api/orders/route.ts) zaten
    // remainingAmount<=0 kontrolüyle bunu ayrıca süzüyor.
  });

  it("bir siparişi birden fazla farklı yöntem kapatırsa paidVia 'Karışık' olur", () => {
    const entries: LedgerFifoEntry[] = [
      debt(1, 1000),
      credit(600, "Nakit"),
      credit(400, "POS"),
    ];
    const result = computeOrderLedgerStatus(entries);
    expect(result.get(1)!.remainingAmount).toBe(0);
    expect(result.get(1)!.paidVia).toBe("Karışık");
  });

  it("order_id'siz (MANUEL) borç kuyrukta yer tutar ama sonuca hiç eklenmez", () => {
    const entries: LedgerFifoEntry[] = [
      { orderId: null, direction: 1, amount: 500, paymentType: null }, // elle eklenen borç
      debt(1, 1000),
      credit(500, "Nakit"), // sadece order_id'siz borcu kapatmaya yeter
    ];
    const result = computeOrderLedgerStatus(entries);
    expect(result.has(null as unknown as number)).toBe(false);
    // order 1'e hiç dokunulmamış olmalı — kredi ondan ÖNCEKİ (order_id'siz)
    // borcu kapatmakla tükendi.
    expect(result.get(1)!.remainingAmount).toBe(1000);
  });

  it("fazla ödeme (overpayment) hata fırlatmaz, kuyruk boşalınca sessizce durur", () => {
    const entries: LedgerFifoEntry[] = [debt(1, 500), credit(800, "Nakit")];
    expect(() => computeOrderLedgerStatus(entries)).not.toThrow();
    expect(computeOrderLedgerStatus(entries).get(1)!.remainingAmount).toBe(0);
  });

  it("hiç borç yokken gelen bir ödeme boş bir sonuç döner", () => {
    const result = computeOrderLedgerStatus([credit(1000, "Nakit")]);
    expect(result.size).toBe(0);
  });
});
