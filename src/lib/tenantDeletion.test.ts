import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { TENANT_ID_TABLES_IN_DELETE_ORDER, TENANT_CASCADE_CHILD_TABLES } from "./tenantDeletion";

// Yeni bir tenant_id'li tablo eklenip silme listesine eklenmeyi unutulunca
// Süper Admin'de o tabloda satırı olan firma silinemez (FK ihlali, tüm
// işlem geri alınır) — iki kez yaşandı (2026-10-01, 2026-10-29). Şema
// taranıp her tenant_id'li tablonun listede olduğu doğrulanır.
function tablesWithTenantId(sql: string): Set<string> {
  const tables = new Set<string>();
  for (const m of Array.from(sql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+) \(([\s\S]*?)\n\);/g))) {
    if (/^\s*tenant_id\s/m.test(m[2])) tables.add(m[1]);
  }
  for (const m of Array.from(sql.matchAll(/ALTER TABLE (\w+)\s+ADD COLUMN IF NOT EXISTS tenant_id\b/g))) tables.add(m[1]);
  return tables;
}

describe("firma silme sırası", () => {
  const sql = readFileSync(path.join(__dirname, "../../database/schema.sql"), "utf8");
  const schemaTables = tablesWithTenantId(sql);

  it("şema taraması tabloları buluyor", () => {
    expect(schemaTables.has("orders")).toBe(true);
    expect(schemaTables.has("quotes")).toBe(true);
    expect(schemaTables.size).toBeGreaterThan(25);
  });

  it("tenant_id'li her tablo silme listesinde ya da CASCADE alt tablo", () => {
    const covered = new Set<string>([...TENANT_ID_TABLES_IN_DELETE_ORDER, ...TENANT_CASCADE_CHILD_TABLES]);
    const missing = Array.from(schemaTables).filter((t) => !covered.has(t));
    expect(missing).toEqual([]);
  });

  it("listede şemada olmayan tablo yok", () => {
    const stale = [...TENANT_ID_TABLES_IN_DELETE_ORDER].filter((t) => !schemaTables.has(t));
    expect(stale).toEqual([]);
  });
});
