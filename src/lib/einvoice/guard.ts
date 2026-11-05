// e-Fatura uçlarının ortak giriş kontrolü: oturum + ek özellik (hak + ücretli
// abonelik, src/lib/addons.ts) + izin. Ek özellik kapalıysa 403
// code=addon_required — ekran tanıtım kartını gösterebilsin.
import { NextResponse } from "next/server";
import { getAuthUser, hasUserAddon, type JwtPayload } from "../auth";
import { hasPermission } from "../permissions";
import { InvoiceError } from "./engine";
import { ProviderError } from "./provider";

export async function einvoiceUser(permission: string | "admin"): Promise<{ user: JwtPayload & { tenantId: number } } | { response: NextResponse }> {
  const user = await getAuthUser();
  if (!user || user.tenantId == null) return { response: NextResponse.json({ error: "Yetkisiz." }, { status: 401 }) };
  if (!hasUserAddon(user, "einvoice")) {
    return { response: NextResponse.json({ error: "e-Fatura modülü bu firmada açık değil.", code: "addon_required" }, { status: 403 }) };
  }
  const allowed = permission === "admin" ? user.role === "admin" : hasPermission(user, permission);
  if (!allowed) return { response: NextResponse.json({ error: "Yetkisiz." }, { status: 403 }) };
  return { user: user as JwtPayload & { tenantId: number } };
}

export function einvoiceErrorResponse(error: unknown): NextResponse {
  if (error instanceof InvoiceError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof ProviderError) return NextResponse.json({ error: error.message }, { status: 502 });
  console.error(error);
  return NextResponse.json({ error: "Sunucu hatası." }, { status: 500 });
}
