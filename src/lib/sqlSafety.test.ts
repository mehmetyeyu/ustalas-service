import { describe, it, expect } from "vitest";
import { escapeLike } from "./sqlSafety";

describe("escapeLike", () => {
  it("% karakterini kaçışlar (aksi halde joker karakter olarak yorumlanır)", () => {
    expect(escapeLike("%100")).toBe("\\%100");
  });

  it("_ karakterini kaçışlar (aksi halde tek karakter joker'i olarak yorumlanır)", () => {
    expect(escapeLike("A_B")).toBe("A\\_B");
  });

  it("ters eğik çizginin kendisini de kaçışlar (kaçış karakterinin kendisi)", () => {
    expect(escapeLike("A\\B")).toBe("A\\\\B");
  });

  it("normal metni değiştirmeden bırakır", () => {
    expect(escapeLike("Ahmet Yılmaz")).toBe("Ahmet Yılmaz");
  });

  it("birden fazla özel karakteri aynı anda kaçışlar", () => {
    expect(escapeLike("50%_indirim\\kampanya")).toBe("50\\%\\_indirim\\\\kampanya");
  });
});
