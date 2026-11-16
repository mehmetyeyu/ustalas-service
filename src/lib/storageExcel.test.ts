import { describe, it, expect } from "vitest";
import { parseStorageRows, StorageImportError, STORAGE_EXCEL_COLUMNS, formatIslemTarihi } from "./storageExcel";

const T = "2026-11-16";
const HEADERS = STORAGE_EXCEL_COLUMNS.map((c) => c.header);
const row = (v: Record<string, unknown>) => STORAGE_EXCEL_COLUMNS.map((c) => v[c.key] ?? null);

describe("parseStorageRows", () => {
  it("şablon başlıklarıyla tüm alanlar", () => {
    const { rows, errors } = parseStorageRows([HEADERS, row({
      plate: "34abc123", adet: 2, mevsim: "kış", islem_tarihi: "01.03.2026", rft: "Evet", jantli: "hayır",
      production_week_year: "10/26", ebat: "205/55R16",
    })], T);
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({
      plate: "34ABC123", adet: 2, mevsim: "Kışlık", islem_tarihi: "2026-03-01", rft: true, jantli: false,
      production_week: 10, production_year: 2026, ebat: "205/55R16", depo_no: null,
    });
  });

  it("sütun sırası önemsiz — eski dışa aktarma sırası (İşlem Tarihi Açıklama'dan sonra) da doğru okunur", () => {
    const { rows } = parseStorageRows([
      ["Depo No", "Plaka", "Açıklama", "İşlem Tarihi", "Model", "Üretim Haftası/Yılı"],
      [5, "34X1", "not", "16.11.2026", "Pilot Sport 4", "12/25"],
    ], T);
    expect(rows[0]).toMatchObject({ depo_no: 5, model_name: "Pilot Sport 4", production_week: 12, production_year: 2025, islem_tarihi: "2026-11-16" });
  });

  it("boş hücreler null (güncellemede korunur), plakasız satır atlanır", () => {
    const { rows, skipped } = parseStorageRows([HEADERS, row({ plate: "34X1" }), row({ marka: "Lassa" })], T);
    expect(skipped).toBe(1);
    expect(rows[0]).toMatchObject({ adet: null, rft: null, jantli: null, islem_tarihi: null, mevsim: null });
  });

  it("mevsim varyantları ve çoklu mevsim", () => {
    const { rows } = parseStorageRows([["Plaka", "Mevsim"], ["A", "YAZLIK"], ["B", "4 mevsim"], ["C", "Yaz, Kış"]], T);
    expect(rows.map((r) => r.mevsim)).toEqual(["Yazlık", "Dört Mevsim", "Yazlık,Kışlık"]);
  });

  it("Excel seri tarihi ve ISO tarih", () => {
    const { rows } = parseStorageRows([["Plaka", "İşlem Tarihi"], ["A", 46000], ["B", "2026-01-05"]], T);
    expect(rows[0].islem_tarihi).toBe("2025-12-09");
    expect(rows[1].islem_tarihi).toBe("2026-01-05");
  });

  it("hatalı hücreler satır numarasıyla", () => {
    const { rows, errors } = parseStorageRows([
      ["Plaka", "Adet", "Depo No", "Mevsim", "İşlem Tarihi", "RFT"],
      ["A", "dört", 1, "Yaz", null, null],
      ["B", 4, "x", "Bahar", "31.02.2026", "belki"],
      ["C", 4, null, null, "01.01.2027", null],
    ], T);
    expect(rows).toHaveLength(0);
    expect(errors[0]).toMatch(/^Satır 2 \(A\): Adet/);
    expect(errors[1]).toMatch(/Satır 3 \(B\): Depo No .* Mevsim "Bahar" .* Geçersiz İşlem Tarihi\. RFT/);
    expect(errors[2]).toMatch(/bugünden sonra/);
  });

  it("Kısmi RFT değişmez sayılır", () => {
    expect(parseStorageRows([["Plaka", "RFT"], ["A", "Kısmi"]], T).rows[0].rft).toBeNull();
  });

  it("Plaka sütunu yoksa hata", () => {
    expect(() => parseStorageRows([["Müşteri"], ["x"]], T)).toThrow(StorageImportError);
  });
});

describe("formatIslemTarihi", () => {
  it("gg.aa.yyyy, boşsa boş", () => {
    expect(formatIslemTarihi(new Date(2026, 2, 1))).toBe("01.03.2026");
    expect(formatIslemTarihi(null)).toBe("");
  });
});
