import { describe, it, expect } from "vitest";
import { normalizeTeslimAciklama, TESLIM_ACIKLAMA_MAX } from "./storageDelivery";

describe("normalizeTeslimAciklama", () => {
  it("metni kırpar", () => {
    expect(normalizeTeslimAciklama("  Ahmet Yılmaz'a teslim edildi ")).toBe("Ahmet Yılmaz'a teslim edildi");
  });
  it("boş ya da metin olmayan değer null olur", () => {
    for (const v of ["", "   ", null, undefined, 5, {}]) expect(normalizeTeslimAciklama(v)).toBeNull();
  });
  it("uzun metin sınırda kesilir", () => {
    expect(normalizeTeslimAciklama("a".repeat(TESLIM_ACIKLAMA_MAX + 50))).toHaveLength(TESLIM_ACIKLAMA_MAX);
  });
});
