import { NextRequest, NextResponse } from "next/server";
// import { resetDemoData } from "@/lib/demoSeed";

// Yalnızca Elevire demo dağıtımında anlamlı — CRON_SECRET env var'ı sadece o
// projede tanımlı olduğundan Ustalas'ın prod ortamında bu route hep 404 döner
// ve gerçek veriye asla dokunmaz. Vercel, CRON_SECRET set edildiğinde kendi
// cron isteklerine otomatik olarak "Authorization: Bearer <secret>" ekler.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // GEÇİCİ TEŞHİS — değeri değil sadece varlığını/uzunluğunu loglar, kaldırılacak.
  console.log("DEBUG_DATABASE_URL", JSON.stringify({
    hasDatabaseUrl: typeof process.env.DATABASE_URL === "string",
    databaseUrlLength: process.env.DATABASE_URL?.length ?? 0,
    databaseUrlHost: process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).host : null,
  }));
  return NextResponse.json({ debug: true });
}
