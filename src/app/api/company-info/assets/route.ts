import { NextRequest, NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import pool from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

// Firma Logosu / Panel Logosu / Firma Kaşesi yükleme+silme — bkz.
// database/schema.sql tenants.logo_url/panel_logo_url/stamp_url notu.
// Vercel Blob'a PUBLIC erişimle yazılıyor (gizli değil, zaten İş Emri/panel
// header'ında doğrudan gösterilecek). Her yüklemede YENİ bir dosya yolu
// (zaman damgalı) kullanılıyor — aynı yolun üzerine yazmak tarayıcı
// önbelleğinde eski görselin bir süre görünmeye devam etmesine yol açardı
// (bkz. Vercel Blob dokümantasyonu "treat blobs as immutable" önerisi);
// eski blob, yeni URL DB'ye yazıldıktan SONRA ayrıca silinir.
type AssetType = "logo" | "panel_logo" | "stamp";
const COLUMN_BY_TYPE: Record<AssetType, string> = {
  logo: "logo_url",
  panel_logo: "panel_logo_url",
  stamp: "stamp_url",
};
const MAX_SIZE_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);

function isValidType(t: unknown): t is AssetType {
  return t === "logo" || t === "panel_logo" || t === "stamp";
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const formData = await request.formData();
    const type = formData.get("type");
    const file = formData.get("file");
    if (!isValidType(type)) return NextResponse.json({ error: "Geçersiz görsel tipi." }, { status: 400 });
    if (!(file instanceof File)) return NextResponse.json({ error: "Dosya bulunamadı." }, { status: 400 });
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json({ error: "Sadece PNG, JPG, WEBP veya SVG dosyaları yüklenebilir." }, { status: 400 });
    }
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: "Dosya boyutu 2MB'ı geçemez." }, { status: 400 });
    }

    const column = COLUMN_BY_TYPE[type];
    const existing = await pool.query<Record<string, string | null>>(
      `SELECT ${column} FROM tenants WHERE id = $1`,
      [user.tenantId]
    );
    const oldUrl = existing.rows[0]?.[column] ?? null;

    const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
    const blob = await put(`company/${user.tenantId}/${type}-${Date.now()}.${ext}`, file, { access: "public" });

    await pool.query(`UPDATE tenants SET ${column} = $1 WHERE id = $2`, [blob.url, user.tenantId]);

    if (oldUrl) {
      try {
        await del(oldUrl);
      } catch (delError) {
        console.error("company-info/assets — eski görsel silinemedi (yeni görsel zaten kaydedildi):", delError);
      }
    }

    return NextResponse.json({ url: blob.url });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Yükleme başarısız." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });

  try {
    const type = new URL(request.url).searchParams.get("type");
    if (!isValidType(type)) return NextResponse.json({ error: "Geçersiz görsel tipi." }, { status: 400 });
    const column = COLUMN_BY_TYPE[type];

    const existing = await pool.query<Record<string, string | null>>(
      `SELECT ${column} FROM tenants WHERE id = $1`,
      [user.tenantId]
    );
    const oldUrl = existing.rows[0]?.[column] ?? null;

    await pool.query(`UPDATE tenants SET ${column} = NULL WHERE id = $1`, [user.tenantId]);

    if (oldUrl) {
      try {
        await del(oldUrl);
      } catch (delError) {
        console.error("company-info/assets — görsel silinemedi:", delError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Silme başarısız." }, { status: 500 });
  }
}
