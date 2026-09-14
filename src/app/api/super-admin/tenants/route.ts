import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { provisionTenant } from "@/lib/provisionTenant";

// Süper Admin Paneli — hiçbir gerçek müşteriye ait olmayan, tüm firmaları
// (tenants) yönetebilen ayrı bir üst-düzey rol (bkz. src/app/super-admin/,
// scripts/create-super-admin.mjs). Mevcut hasPermission/RESOURCE_ACTIONS
// sistemine hiç girmez — Kullanıcılar/Genel Ayarlar sayfalarının
// `role === 'admin'` kontrolüyle aynı desende, doğrudan role kontrolü.
export async function GET() {
  const user = await getAuthUser();
  if (!user || user.role !== "super_admin") return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const result = await pool.query(
      `SELECT id, name, code, slug, is_active, created_at, contact_name, contact_email, contact_phone,
              billing_status, trial_ends_at, plan
       FROM tenants WHERE is_platform = false
       ORDER BY created_at DESC`
    );
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
  }
}

// Yeni bir firma oluşturur — scripts/create-tenant.mjs'in yaptığının
// AYNISI, ama panelden: mevcut, zaten test edilmiş provisionTenant()
// (src/lib/provisionTenant.ts) doğrudan çağrılır.
export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user || user.role !== "super_admin") return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const { tenantName, adminUsername, adminPassword, contactName, contactEmail, contactPhone } = await request.json();
    if (!tenantName || !String(tenantName).trim()) {
      return NextResponse.json({ error: "Firma adı zorunludur." }, { status: 400 });
    }
    if (!adminUsername || !String(adminUsername).trim()) {
      return NextResponse.json({ error: "Yönetici kullanıcı adı zorunludur." }, { status: 400 });
    }
    if (!adminPassword || String(adminPassword).length < 6) {
      return NextResponse.json({ error: "Şifre en az 6 karakter olmalıdır." }, { status: 400 });
    }

    const result = await provisionTenant({
      tenantName: String(tenantName),
      adminUsername: String(adminUsername),
      adminPassword: String(adminPassword),
      contactName: contactName ? String(contactName) : undefined,
      contactEmail: contactEmail ? String(contactEmail) : undefined,
      contactPhone: contactPhone ? String(contactPhone) : undefined,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && error.code === "23505") {
      return NextResponse.json({ error: "Bu firma adı ya da kullanıcı adı zaten kullanılıyor." }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Sunucu hatası.";
    console.error(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
