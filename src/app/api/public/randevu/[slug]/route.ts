import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { resolveTenantBySlug } from "@/lib/publicTenant";
import { isSlotStillAvailable, isWithinBookableWindow, DEFAULT_DURATION_MINUTES, type WorkingHours } from "@/lib/appointmentSlots";
import { getClientIp } from "@/lib/clientIp";
import { notifyTenantAdmins } from "@/lib/push";
import { notifyCustomerAppointmentConfirmed } from "@/lib/whatsapp";
import { withCors, corsPreflight } from "@/lib/publicCors";

export const OPTIONS = corsPreflight;

// Bu route'ta çok sayıda dönüş noktası var (doğrulama hataları, rate limit,
// 409 vb.) — her birine tek tek withCors sarmak yerine yerel bir kısayol.
function json(body: unknown, init?: ResponseInit) {
  return withCors(NextResponse.json(body, init));
}

const PHONE_COOLDOWN_MINUTES = 5;
// Form artık firmaların kendi sitelerine gömülebiliyor (bkz. embed.js) —
// telefon-bazlı soğuma tek başına yetersiz, bir bot her istekte farklı bir
// telefon numarası üretebilir. IP bazlı bir üst sınır da ekleniyor.
const IP_MAX_REQUESTS_PER_HOUR = 8;

// Kimlik doğrulamasız — herkes tarafından çağrılabilir bir POST. Anti-spam:
// (1) gizli honeypot alanı ("website" — bot'lar genelde görünmeyen alanları
// da doldurur, gerçek kullanıcı görmez/dolduramaz), (2) aynı telefon
// numarasından kısa bir soğuma süresi, (3) aynı IP'den saatlik üst sınır.
// Gerçek bir CAPTCHA (ör. Turnstile) değil — kötüye kullanım gerçekten
// görülürse eklenecek bir sonraki adım (bkz. proje planı).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const tenant = await resolveTenantBySlug(slug);
  if (!tenant) return json({ error: "Bulunamadı." }, { status: 404 });

  try {
    const body = await request.json();
    const { plate, customer_name, customer_phone, service_id, requested_at, website } = body;

    if (website) {
      // Honeypot dolu — bot. Sessizce başarılı gibi davran, hiçbir şey kaydetme.
      return json({ success: true }, { status: 201 });
    }
    if (!plate || !String(plate).trim()) {
      return json({ error: "Plaka zorunludur." }, { status: 400 });
    }
    if (!customer_name || !String(customer_name).trim()) {
      return json({ error: "Ad Soyad zorunludur." }, { status: 400 });
    }
    if (!customer_phone || !String(customer_phone).trim()) {
      return json({ error: "Telefon numarası zorunludur." }, { status: 400 });
    }
    if (!requested_at || Number.isNaN(new Date(requested_at).getTime())) {
      return json({ error: "Geçerli bir randevu zamanı gerekli." }, { status: 400 });
    }

    const phone = String(customer_phone).trim();
    const ip = getClientIp(request);
    const cooldownCheck = await pool.query(
      `SELECT id FROM appointments
       WHERE tenant_id = $1 AND customer_phone = $2
         AND created_at > NOW() - INTERVAL '${PHONE_COOLDOWN_MINUTES} minutes'
       LIMIT 1`,
      [tenant.id, phone]
    );
    if ((cooldownCheck.rowCount ?? 0) > 0) {
      return json(
        { error: "Az önce bir randevu talebi gönderdiniz, birkaç dakika sonra tekrar deneyin." },
        { status: 429 }
      );
    }
    if (ip !== "bilinmiyor") {
      const ipCheck = await pool.query(
        `SELECT COUNT(*)::int AS cnt FROM appointments
         WHERE tenant_id = $1 AND ip_address = $2 AND created_at > NOW() - INTERVAL '1 hour'`,
        [tenant.id, ip]
      );
      if ((ipCheck.rows[0]?.cnt ?? 0) >= IP_MAX_REQUESTS_PER_HOUR) {
        return json(
          { error: "Çok fazla randevu talebi gönderildi, lütfen daha sonra tekrar deneyin." },
          { status: 429 }
        );
      }
    }

    let durationMinutes = DEFAULT_DURATION_MINUTES;
    let serviceIdNum: number | null = null;
    let serviceName: string | null = null;
    if (service_id != null) {
      const svc = await pool.query<{ id: number; name: string; duration_minutes: number | null }>(
        "SELECT id, name, duration_minutes FROM services WHERE id = $1 AND tenant_id = $2 AND bookable = true",
        [Number(service_id), tenant.id]
      );
      if (!svc.rows[0]) return json({ error: "Geçersiz hizmet." }, { status: 400 });
      serviceIdNum = svc.rows[0].id;
      serviceName = svc.rows[0].name;
      durationMinutes = svc.rows[0].duration_minutes ?? DEFAULT_DURATION_MINUTES;
    }

    const requestedAt = new Date(requested_at);

    // Client'ın (veya API'ye doğrudan istek atan herhangi birinin — Postman
    // vb.) "bu saat müsait" iddiasına hiç güvenilmez: geçmiş bir tarih,
    // yıllar sonrası bir tarih, kapalı bir gün veya çalışma saatleri dışında
    // bir saat burada reddedilir — kapasite kontrolünden (isSlotStillAvailable,
    // aşağıda) tamamen bağımsız, ayrı bir doğrulama.
    const settingsCheck = await pool.query<{ booking_capacity: number; booking_auto_approve: boolean; booking_working_hours: WorkingHours | null; booking_max_days_ahead: number }>(
      "SELECT booking_capacity, booking_auto_approve, booking_working_hours, booking_max_days_ahead FROM app_settings WHERE tenant_id = $1",
      [tenant.id]
    );
    const capacity = settingsCheck.rows[0]?.booking_capacity ?? 1;
    const autoApprove = settingsCheck.rows[0]?.booking_auto_approve ?? false;
    const workingHours = settingsCheck.rows[0]?.booking_working_hours ?? null;
    const maxDaysAhead = settingsCheck.rows[0]?.booking_max_days_ahead ?? 30;

    if (!isWithinBookableWindow(requestedAt, durationMinutes, workingHours, maxDaysAhead)) {
      return json({ error: "Geçersiz randevu zamanı." }, { status: 400 });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // isSlotStillAvailable'daki "FOR UPDATE" sadece VAR OLAN randevu
      // satırlarını kilitler — o slotta henüz hiç randevu yoksa (ör. günün
      // ilk talebi, kapasite=1'de en sık senaryo) iki eşzamanlı istek de
      // "0 dolu" görüp ikisi de INSERT edebilir (satır bazlı kilit boşluk/
      // aralık kilidi değildir). Bu tenant-düzeyinde bir advisory kilitle
      // engelleniyor — ikinci istek ilkinin COMMIT/ROLLBACK'ini bekler, sonra
      // güncel duruma göre kontrol eder. Aynı anda tek bir küçük dükkanın
      // randevu hacminde bu serileştirme performans sorunu yaratmaz.
      await client.query("SELECT pg_advisory_xact_lock($1)", [tenant.id]);
      const available = await isSlotStillAvailable(client, tenant.id, requestedAt, durationMinutes, capacity);
      if (!available) {
        await client.query("ROLLBACK");
        return json(
          { error: "Bu saat az önce doldu, lütfen başka bir saat seçin." },
          { status: 409 }
        );
      }

      const status = autoApprove ? "ONAYLANDI" : "BEKLEMEDE";
      const result = await client.query<{ id: number }>(
        `INSERT INTO appointments (tenant_id, plate, customer_name, customer_phone, service_id, requested_at, status, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [
          tenant.id,
          String(plate).replace(/\s+/g, "").toUpperCase(),
          customer_name ? String(customer_name).trim() : null,
          phone,
          serviceIdNum,
          requestedAt.toISOString(),
          status,
          ip,
        ]
      );
      await client.query("COMMIT");
      await notifyTenantAdmins(tenant.id, {
        title: "Yeni Randevu Talebi",
        body: `${customer_name ? String(customer_name).trim() : "Müşteri"} — ${String(plate).replace(/\s+/g, "").toUpperCase()}`,
        url: "/admin/appointments",
      });
      if (status === "ONAYLANDI") {
        await notifyCustomerAppointmentConfirmed(tenant.id, {
          customerName: customer_name ? String(customer_name).trim() : null,
          customerPhone: phone,
          plate: String(plate).replace(/\s+/g, "").toUpperCase(),
          serviceName,
          requestedAt,
        });
      }
      return json({ id: result.rows[0].id, status }, { status: 201 });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(error);
    return json({ error: "Sunucu hatası." }, { status: 500 });
  }
}
