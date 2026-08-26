import { resolveServiceIds } from "./serviceCatalog";
import { upsertDirectoryNames } from "./directories";

interface QueryClient {
  query<T = unknown>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export class AppointmentNotFoundError extends Error {
  constructor() {
    super("Randevu bulunamadı.");
    this.name = "AppointmentNotFoundError";
  }
}

export class AppointmentAlreadyConvertedError extends Error {
  constructor() {
    super("Bu randevu zaten bir siparişe dönüştürülmüş.");
    this.name = "AppointmentAlreadyConvertedError";
  }
}

// Onaylanmış bir randevuyu, mevcut Sipariş Oluşturma akışıyla (bkz.
// POST /api/orders) aynı deseni izleyerek tek satırlı, BEKLEMEDE statülü bir
// siparişe dönüştürür — paralel bir sipariş-oluşturma mantığı yazılmaz.
// Ürün/stok bağlantısı yok (randevu anında parti seçilmiyor), personel
// siparişi Sipariş Listesi'nden tamamlar. Çağıran, bunu bir transaction
// içinde çalıştırmalı.
export async function convertAppointmentToOrder(
  client: QueryClient,
  tenantId: number,
  appointmentId: number
): Promise<number> {
  const apptResult = await client.query<{
    id: number;
    plate: string;
    customer_name: string | null;
    customer_phone: string | null;
    service_id: number | null;
    order_id: number | null;
    notes: string | null;
  }>(
    `SELECT id, plate, customer_name, customer_phone, service_id, order_id, notes
     FROM appointments WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
    [appointmentId, tenantId]
  );
  const appt = apptResult.rows[0];
  if (!appt) throw new AppointmentNotFoundError();
  if (appt.order_id != null) throw new AppointmentAlreadyConvertedError();

  let serviceId: number;
  let unitPrice = 0;
  if (appt.service_id != null) {
    const svc = await client.query<{ price: number | null }>(
      "SELECT price FROM services WHERE id = $1 AND tenant_id = $2",
      [appt.service_id, tenantId]
    );
    if (!svc.rows[0]) throw new Error("Randevunun bağlı olduğu hizmet bulunamadı.");
    serviceId = appt.service_id;
    unitPrice = svc.rows[0].price != null ? Number(svc.rows[0].price) : 0;
  } else {
    // Randevu belirli bir hizmete bağlı değilse (ör. personel elle, hizmet
    // seçmeden oluşturmuşsa) genel bir "Randevu" kaydı otomatik açılır —
    // Excel içe aktarımındaki eşleşmeyen isim davranışıyla aynı desen.
    const map = await resolveServiceIds(client, tenantId, [{ service_name: "Randevu" }]);
    serviceId = map.get("Randevu")!;
  }

  if (appt.customer_name) {
    // Genel Ayarlar'daki "Müşterileri Otomatik Kaydet" kapalıysa (bkz.
    // app_settings.auto_register_customers) sipariş oluşturma/düzenlemedeki
    // aynı davranışla tutarlı olarak burada da atlanır.
    const settingsResult = await client.query<{ auto_register_customers: boolean }>(
      "SELECT auto_register_customers FROM app_settings WHERE tenant_id = $1",
      [tenantId]
    );
    if (settingsResult.rows[0]?.auto_register_customers ?? true) {
      await upsertDirectoryNames(client, "customers", tenantId, [appt.customer_name]);
      await client.query(
        `INSERT INTO customers (tenant_id, name, phone) VALUES ($1, $2, $3)
         ON CONFLICT (tenant_id, name) DO UPDATE SET phone = COALESCE(customers.phone, EXCLUDED.phone)`,
        [tenantId, appt.customer_name, appt.customer_phone]
      );
    }
  }

  const orderResult = await client.query<{ id: number }>(
    `INSERT INTO orders (tenant_id, plate, customer_name, customer_phone, notes, total_amount, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'BEKLEMEDE') RETURNING id`,
    [tenantId, appt.plate, appt.customer_name, appt.customer_phone, appt.notes, unitPrice]
  );
  const orderId = orderResult.rows[0].id;

  await client.query(
    `INSERT INTO order_services (tenant_id, order_id, service_id, unit_price, quantity)
     VALUES ($1, $2, $3, $4, 1)`,
    [tenantId, orderId, serviceId, unitPrice]
  );

  await client.query(
    "UPDATE appointments SET order_id = $1, status = 'TAMAMLANDI' WHERE id = $2 AND tenant_id = $3",
    [orderId, appointmentId, tenantId]
  );

  return orderId;
}
