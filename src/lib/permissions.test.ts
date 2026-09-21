import { describe, it, expect } from "vitest";
import {
  hasPermission,
  canAccessPath,
  getDefaultAdminPath,
  isValidPermissionKey,
} from "./permissions";

describe("hasPermission", () => {
  it("admin, permissions dizisinden bağımsız her zaman true döner", () => {
    expect(hasPermission({ role: "admin", permissions: [] }, "orders.view")).toBe(true);
    expect(hasPermission({ role: "admin" }, "kasa.manage")).toBe(true);
  });

  it("staff, permissions dizisinde olan bir anahtar için true döner", () => {
    expect(hasPermission({ role: "staff", permissions: ["orders.view", "orders.edit"] }, "orders.view")).toBe(true);
  });

  it("staff, permissions dizisinde OLMAYAN bir anahtar için false döner", () => {
    expect(hasPermission({ role: "staff", permissions: ["orders.view"] }, "orders.delete")).toBe(false);
  });

  it("staff, permissions null/undefined ise çökmeden false döner", () => {
    expect(hasPermission({ role: "staff", permissions: null }, "orders.view")).toBe(false);
    expect(hasPermission({ role: "staff" }, "orders.view")).toBe(false);
  });
});

describe("isValidPermissionKey", () => {
  it("gerçek bir kaynak.aksiyon çiftini geçerli sayar", () => {
    expect(isValidPermissionKey("customers.manage_balance")).toBe(true);
  });

  it("uydurma bir anahtarı geçersiz sayar", () => {
    expect(isValidPermissionKey("uydurma.kaynak")).toBe(false);
  });
});

describe("canAccessPath", () => {
  it("admin her yola erişebilir", () => {
    expect(canAccessPath({ role: "admin" }, "/admin/users")).toBe(true);
  });

  it("resource:null olan bir yola (ör. Profil) herkes erişebilir", () => {
    expect(canAccessPath({ role: "staff", permissions: [] }, "/admin/profile")).toBe(true);
  });

  it("__admin_only__ bir yola staff hiçbir izinle erişemez", () => {
    expect(canAccessPath({ role: "staff", permissions: ["appointments.view"] }, "/admin/appointments/ayarlar")).toBe(false);
  });

  it("daha spesifik prefix (appointments/ayarlar) genel appointments eşleşmesinden ÖNCE değerlendirilir", () => {
    // appointments.view izni olsa bile /ayarlar alt yolu admin-only kalmalı.
    const staff = { role: "staff", permissions: ["appointments.view"] };
    expect(canAccessPath(staff, "/admin/appointments")).toBe(true);
    expect(canAccessPath(staff, "/admin/appointments/ayarlar")).toBe(false);
    expect(canAccessPath(staff, "/admin/appointments/gorunum")).toBe(false);
  });

  it("staff, ilgili .view iznine sahipse kaynak sayfasına erişebilir", () => {
    expect(canAccessPath({ role: "staff", permissions: ["kasa.view"] }, "/admin/kasa")).toBe(true);
  });

  it("staff, ilgili .view izni yoksa kaynak sayfasına erişemez", () => {
    expect(canAccessPath({ role: "staff", permissions: [] }, "/admin/kasa")).toBe(false);
  });
});

describe("getDefaultAdminPath", () => {
  it("super_admin her zaman /super-admin'e gider", () => {
    expect(getDefaultAdminPath({ role: "super_admin" })).toBe("/super-admin");
  });

  it("admin her zaman /admin/orders'a gider", () => {
    expect(getDefaultAdminPath({ role: "admin" })).toBe("/admin/orders");
  });

  it("staff, LANDING_ORDER sırasına göre erişebildiği İLK sayfaya gider", () => {
    // orders izni yok ama appointments var -> appointments'a gitmeli (orders'tan sonraki ilk).
    expect(getDefaultAdminPath({ role: "staff", permissions: ["appointments.view"] })).toBe("/admin/appointments");
  });

  it("staff, sadece sipariş oluşturma izniyle (sayfa izni yok) null döner", () => {
    expect(getDefaultAdminPath({ role: "staff", permissions: [] })).toBe(null);
  });
});
