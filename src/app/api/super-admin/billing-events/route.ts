import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

// Son faturalandırma olayları (webhook başarı/başarısızlık, IFN reddi,
// repricing) — bkz. src/lib/billingEvents.ts. Öncesinde bunlar sadece
// Vercel sunucu loglarında görünüyordu, panelde hiçbir izi yoktu.
export async function GET() {
  const user = await getAuthUser();
  if (!user || user.role !== "super_admin") return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  const result = await pool.query(
    `SELECT be.id, be.tenant_id, t.name AS tenant_name, be.event_type, be.detail, be.created_at
     FROM billing_events be
     LEFT JOIN tenants t ON t.id = be.tenant_id
     ORDER BY be.created_at DESC
     LIMIT 100`
  );
  return NextResponse.json(result.rows);
}
