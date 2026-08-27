import pool from "./db";
import { getAppSettings } from "./settings";

const GRAPH_API_VERSION = "v21.0";
const GRAPH_API_TIMEOUT_MS = 10_000;

// Personelin telefonla gelen talebi elle girdiği POST /api/appointments hiçbir
// hız sınırına tabi değil (public randevu formunun aksine) ve her çağrı
// doğrudan gerçek/ücretli bir WhatsApp mesajı tetikliyor — kötüye kullanımda
// (art arda sahte randevu girme) tenant'ın Meta faturasını şişirmemesi için
// saatlik bir üst sınır uygulanıyor. Küçük bir dükkanın normal randevu
// hacminde asla dokunulmaz, sadece anormal bir patlamayı durdurur.
const HOURLY_SEND_LIMIT = 20;

interface AppointmentConfirmedPayload {
  customerName: string | null;
  customerPhone: string | null;
  plate: string;
  serviceName: string | null;
  requestedAt: Date;
}

// Türkiye telefon numaralarını WhatsApp'ın beklediği "ülke kodu + rakamlar,
// başında + veya 0 olmadan" biçimine (ör. 90XXXXXXXXXX) çevirir — randevu
// formundaki telefon alanı hiç normalize edilmeden saklanıyor (kullanıcı ne
// yazarsa o), bu yüzden gönderim ANINDA burada normalize ediliyor. Emin
// olunamayan bir biçim varsa null döner (gönderim sessizce atlanır).
export function normalizeToE164TR(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("90")) return digits;
  if (digits.length === 11 && digits.startsWith("0")) return `90${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith("5")) return `90${digits}`;
  return null;
}

// Randevu ONAYLANDI olduğunda (otomatik veya manuel onay) müşteriye WhatsApp
// bildirimi — her tenant KENDİ Meta WhatsApp Business hesabını app_settings
// üzerinden bağlar (bkz. database/schema.sql whatsapp_* alanları), tek bir
// paylaşımlı hesap DEĞİL. Hiçbir zaman throw etmez — bu sadece bir bildirim,
// randevu onayının başarısı buna bağlı olmamalı (src/lib/push.ts'teki
// notifyTenantAdmins ile aynı "hata yutan" prensip).
export async function notifyCustomerAppointmentConfirmed(
  tenantId: number,
  payload: AppointmentConfirmedPayload
): Promise<void> {
  try {
    const settings = await getAppSettings(tenantId);
    if (!settings.whatsapp_enabled) return;
    if (!settings.whatsapp_access_token || !settings.whatsapp_phone_number_id || !settings.whatsapp_template_name) return;
    if (!payload.customerPhone) return;

    const to = normalizeToE164TR(payload.customerPhone);
    if (!to) return;

    const recent = await pool.query<{ cnt: string }>(
      "SELECT COUNT(*) AS cnt FROM whatsapp_message_log WHERE tenant_id = $1 AND sent_at > NOW() - INTERVAL '1 hour'",
      [tenantId]
    );
    if (Number(recent.rows[0].cnt) >= HOURLY_SEND_LIMIT) {
      console.error(`WhatsApp saatlik gönderim limiti (${HOURLY_SEND_LIMIT}) aşıldı, tenant ${tenantId} — gönderim atlandı.`);
      return;
    }

    const dateStr = new Intl.DateTimeFormat("tr-TR", {
      day: "2-digit", month: "long", year: "numeric", timeZone: "Europe/Istanbul",
    }).format(payload.requestedAt);
    const timeStr = new Intl.DateTimeFormat("tr-TR", {
      hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul",
    }).format(payload.requestedAt);

    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${settings.whatsapp_phone_number_id}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${settings.whatsapp_access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: {
            name: settings.whatsapp_template_name,
            language: { code: "tr" },
            components: [
              {
                type: "body",
                parameters: [
                  { type: "text", text: payload.customerName?.trim() || "Değerli Müşterimiz" },
                  { type: "text", text: payload.plate },
                  { type: "text", text: dateStr },
                  { type: "text", text: timeStr },
                  { type: "text", text: payload.serviceName?.trim() || "randevu" },
                ],
              },
            ],
          },
        }),
        signal: AbortSignal.timeout(GRAPH_API_TIMEOUT_MS),
      }
    );

    if (res.ok) {
      await pool.query("INSERT INTO whatsapp_message_log (tenant_id) VALUES ($1)", [tenantId]);
    } else {
      const errBody = await res.text().catch(() => "");
      console.error("WhatsApp gönderim hatası:", res.status, errBody);
    }
  } catch (err) {
    console.error("notifyCustomerAppointmentConfirmed hatası:", err);
  }
}
