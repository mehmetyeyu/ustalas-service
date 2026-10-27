import { describe, it, expect } from "vitest";
import { CURRENT_UI_VERSION, NEXT_UI_VERSION, resolveBetaVersion, resolveUiVersion, selectableUiVersions } from "./uiVersion";

describe("resolveUiVersion", () => {
  it("emekli v1 kaydı güncel sürüme çözülür (toplu UPDATE gerekmez)", () => {
    expect(resolveUiVersion("v1")).toBe(CURRENT_UI_VERSION);
  });

  it("boş/bilinmeyen değer güncel sürüme düşer", () => {
    expect(resolveUiVersion(null)).toBe(CURRENT_UI_VERSION);
    expect(resolveUiVersion("v9")).toBe(CURRENT_UI_VERSION);
  });

  it("güncel sürüm olduğu gibi kalır", () => {
    expect(resolveUiVersion(CURRENT_UI_VERSION)).toBe(CURRENT_UI_VERSION);
  });

  it("beta erişimi olmayan, sonraki sürümü seçmiş kullanıcı güncel sürümü görür", () => {
    expect(resolveUiVersion("v3", null)).toBe(CURRENT_UI_VERSION);
  });
});

describe("resolveBetaVersion / selectableUiVersions", () => {
  it("tanımlı bir sonraki sürüm yokken hiçbir işaret beta erişimi vermez", () => {
    if (NEXT_UI_VERSION === null) {
      expect(resolveBetaVersion("v2")).toBeNull();
      expect(resolveBetaVersion("v3")).toBeNull();
    }
  });

  it("beta yoksa seçilebilen tek sürüm güncel sürüm (eskiye dönüş yok)", () => {
    expect(selectableUiVersions(null)).toEqual([CURRENT_UI_VERSION]);
  });
});
