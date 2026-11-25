import { describe, it, expect } from "vitest";
import { parseStorageId, resolveStorageTextFields } from "./storageInput";

describe("parseStorageId", () => {
  it("yalnızca geçerli pozitif tam sayı", () => {
    expect(parseStorageId("60545")).toBe(60545);
    for (const v of ["abc", "0", "-1", "1.5", "99999999999", "2147483648", ""]) expect(parseStorageId(v)).toBeNull();
  });
});

describe("resolveStorageTextFields", () => {
  it("boş değerler null olur", () => {
    expect(resolveStorageTextFields({ plate: "34ABC123", phone: "", depo_no: "" })).toEqual({
      depo_no: null, plate: "34ABC123", customer_name: null, phone: null, mevsim: null, aciklama: null, islem_tarihi: null,
    });
  });
  it("uzun ya da metin olmayan değer reddedilir", () => {
    expect(() => resolveStorageTextFields({ phone: "0".repeat(31) })).toThrow("Telefon en fazla 30");
    expect(() => resolveStorageTextFields({ plate: { a: 1 } })).toThrow("Geçersiz Plaka");
  });
  it("depo no pozitif tam sayı olmalı", () => {
    expect(resolveStorageTextFields({ depo_no: "12" }).depo_no).toBe(12);
    for (const v of ["abc", -1, 0, 1.5, 99999999999]) expect(() => resolveStorageTextFields({ depo_no: v })).toThrow("Depo No");
  });
  it("tarih: gün ya da ISO zaman kabul, bozuk reddedilir", () => {
    expect(resolveStorageTextFields({ islem_tarihi: "2026-11-25" }).islem_tarihi).toBe("2026-11-25");
    expect(resolveStorageTextFields({ islem_tarihi: "2026-11-25T00:00:00.000Z" }).islem_tarihi).toBe("2026-11-25");
    for (const v of ["bozuk", "2026-02-31", 5]) expect(() => resolveStorageTextFields({ islem_tarihi: v })).toThrow("İşlem Tarihi");
  });
});
