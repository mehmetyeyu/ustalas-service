import { afterEach, describe, expect, it, vi } from "vitest";
import { ORDERS_LIST_STATE_KEY, dropOrdersListStateOutside, isOrdersPath } from "./ordersListState";

afterEach(() => vi.unstubAllGlobals());

describe("ordersListState", () => {
  it("liste ve sipariş detayı aynı bölüm; benzer adlı yollar değil", () => {
    expect(["/admin/orders", "/admin/orders/45"].every(isOrdersPath)).toBe(true);
    expect(["/admin/products", "/admin", "/admin/orders-x", "/admin/customers/10"].some(isOrdersPath)).toBe(false);
  });
  it("bölümden çıkınca kayıt silinir, detayda korunur; depolama kapalıysa hata vermez", () => {
    const removeItem = vi.fn();
    vi.stubGlobal("sessionStorage", { removeItem });
    dropOrdersListStateOutside("/admin/orders/45");
    expect(removeItem).not.toHaveBeenCalled();
    dropOrdersListStateOutside("/admin/products");
    expect(removeItem).toHaveBeenCalledWith(ORDERS_LIST_STATE_KEY);
    vi.stubGlobal("sessionStorage", { removeItem: () => { throw new Error("kapalı"); } });
    expect(() => dropOrdersListStateOutside("/admin/products")).not.toThrow();
  });
});
