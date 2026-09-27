import { describe, it, expect } from "vitest";
import { escapeHtml } from "./htmlEscape";

describe("escapeHtml", () => {
  it("script etiketini metne çevirir, çalışabilir bir DOM node'una izin vermez", () => {
    expect(escapeHtml("<script>alert(1)</script>")).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("onerror gibi olay handler'ı taşıyan bir img etiketini kaçışlar", () => {
    expect(escapeHtml(`<img src=x onerror="alert(1)">`)).toBe(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"
    );
  });

  it(`çift ve tek tırnağı kaçışlayarak bir öznitelik değerinden dışarı çıkmayı engeller`, () => {
    expect(escapeHtml(`"><script>1</script>`)).toBe("&quot;&gt;&lt;script&gt;1&lt;/script&gt;");
    expect(escapeHtml(`'><script>1</script>`)).toBe("&#39;&gt;&lt;script&gt;1&lt;/script&gt;");
  });

  it("& karakterini önce kaçışlar (sonradan eklenen &lt; vb. tekrar kaçışlanmaz)", () => {
    expect(escapeHtml("Tom & Jerry")).toBe("Tom &amp; Jerry");
  });

  it("null/undefined için boş string döner", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });

  it("zararsız düz metni değiştirmeden bırakır", () => {
    expect(escapeHtml("Ahmet Yılmaz")).toBe("Ahmet Yılmaz");
  });
});
