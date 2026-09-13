import { NextRequest, NextResponse } from "next/server";
import { signToken } from "@/lib/auth";
import { provisionTenant } from "@/lib/provisionTenant";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+()\s-]{7,20}$/;

// Elevire landing'deki "Ücretsiz Hesap Oluştur" (bkz. src/app/kayit/page.tsx)
// — kendi kendine kayıt, auth gerektirmeyen public bir uç (src/app/api/public/
// randevu/ ile aynı konvansiyon). E-posta/telefon doğrulaması YOK, captcha/
// rate-limit YOK — düşük trafikli ilk sürüm için bilinçli olarak kapsam dışı
// bırakıldı (bkz. plan). Kullanıcı adı olarak e-posta kullanılır — yeni
// tenant'ta başka kullanıcı olmadığından çakışma imkânsız.
export async function POST(request: NextRequest) {
  try {
    const { contactName, businessName, email, phone, password } = await request.json();

    const name = String(contactName ?? "").trim();
    const business = String(businessName ?? "").trim();
    const emailTrimmed = String(email ?? "").trim();
    const phoneTrimmed = String(phone ?? "").trim();
    const passwordStr = String(password ?? "");

    if (!name || !business || !emailTrimmed || !phoneTrimmed || !passwordStr) {
      return NextResponse.json({ error: "Tüm alanlar zorunludur." }, { status: 400 });
    }
    if (!EMAIL_RE.test(emailTrimmed)) {
      return NextResponse.json({ error: "Geçersiz e-posta adresi." }, { status: 400 });
    }
    if (!PHONE_RE.test(phoneTrimmed)) {
      return NextResponse.json({ error: "Geçersiz telefon numarası." }, { status: 400 });
    }
    if (passwordStr.length < 6) {
      return NextResponse.json({ error: "Şifre en az 6 karakter olmalıdır." }, { status: 400 });
    }

    const result = await provisionTenant({
      tenantName: business,
      adminUsername: emailTrimmed,
      adminPassword: passwordStr,
      contactName: name,
      contactEmail: emailTrimmed,
      contactPhone: phoneTrimmed,
    });

    // Kayıt sonrası otomatik giriş — bkz. src/app/api/auth/login/route.ts'teki
    // AYNI signToken/cookie deseni. Yeni tenant'ın tek kullanıcısı her zaman
    // role: 'admin' (provisionTenant'ta sabit).
    const token = await signToken({
      userId: result.adminUserId,
      username: emailTrimmed,
      role: "admin",
    });

    const response = NextResponse.json({ success: true });
    response.cookies.set("auth_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 12,
      path: "/",
    });
    return response;
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && error.code === "23505") {
      return NextResponse.json({ error: "Bu işletme adı zaten kullanılıyor." }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Sunucu hatası.";
    console.error(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
