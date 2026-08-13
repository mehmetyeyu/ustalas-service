// Elevire demo dağıtımına özgü: veritabanını sabit, gerçekçi ama tamamen
// sahte bir başlangıç durumuna sıfırlar. Ziyaretçilerin demo hesabında
// yaptığı değişiklikler (yeni sipariş, silinen kayıt vb.) gecelik cron ile
// geri alınır — bkz. src/app/api/admin/reset-demo/route.ts.
//
// Bu modül SADECE elevire dağıtımında çağrılır (route, CRON_SECRET env var'ı
// tanımlı değilse çalışmayı reddeder) — Ustalas'ın gerçek verisine asla
// dokunmaz.
import { Pool } from "pg";

// Bu dosyaya özel, izole bir bağlantı: paylaşılan src/lib/db.ts
// (@neondatabase/serverless, WebSocket tabanlı) bu ortamda bağlantı
// kuramıyordu (hem WebSocket hem poolQueryViaFetch/HTTP modunda "fetch
// failed"). Standart pg paketi (ham TCP) burada güvenilir çalışıyor — sadece
// bu dosyayı etkiliyor, uygulamanın geri kalanının (Ustalas dahil)
// kullandığı paylaşılan pool'a dokunmuyor.
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const GENERIC_SUPPLIERS = [
  "Servis İşçiliği",
  "Merkez Lastik Dağıtım",
  "Anadolu Oto Yedek Parça",
  "Batı Jant",
  "Örnek Lastik A.Ş.",
  "İkinci El",
  "Diğer",
];

const GENERIC_PAYMENT_TYPES = ["Nakit", "POS", "Cari", "Fatura Edildi.", "Havale/EFT", "Mail Order"];

const CUSTOMERS = [
  { name: "Ahmet Yılmaz", phone: "0555 123 45 67" },
  { name: "Merve Kaya", phone: "0532 456 78 90" },
  { name: "Can Demir", phone: "0544 789 01 23" },
  { name: "Zeynep Aksoy", phone: "0505 234 56 78" },
  { name: "Emre Şahin", phone: "0533 345 67 89" },
  { name: "Ayşe Çelik", phone: "0542 456 78 90" },
];

const PRODUCTS = [
  { code: "VYR-205-55-16", brand: "Voyra", size_desc: "205/55R16", season: "Yazlık", supplier: "Merkez Lastik Dağıtım", purchase_price: 1450, sale_price: 1850, stock_qty: 18 },
  { code: "NRD-215-60-16", brand: "Nordex", size_desc: "215/60R16", season: "Kışlık", supplier: "Anadolu Oto Yedek Parça", purchase_price: 1620, sale_price: 2050, stock_qty: 12 },
  { code: "SFR-195-65-15", brand: "Sferro", size_desc: "195/65R15", season: "Yazlık", supplier: "Batı Jant", purchase_price: 1180, sale_price: 1490, stock_qty: 24 },
  { code: "VYR-225-45-17", brand: "Voyra", size_desc: "225/45R17", season: "4 Mevsim", supplier: "Örnek Lastik A.Ş.", purchase_price: 1980, sale_price: 2490, stock_qty: 8 },
];

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

export async function resetDemoData(): Promise<void> {
  // Çocuk tablolardan ebeveyne doğru sil (FK sırası).
  await pool.query("DELETE FROM order_payments");
  await pool.query("DELETE FROM order_services");
  await pool.query("DELETE FROM orders");
  await pool.query("DELETE FROM product_stock_entries");
  await pool.query("DELETE FROM products");
  await pool.query("DELETE FROM storage");
  await pool.query("DELETE FROM customers");
  await pool.query("DELETE FROM suppliers");

  await pool.query(
    "UPDATE app_settings SET business_name = 'Lastik Servis Yönetim Sistemi', storage_overdue_months = 6, payment_types = $1 WHERE id = 1",
    [GENERIC_PAYMENT_TYPES]
  );

  // Paylaşılan tek demo hesabı: bir ziyaretçi şifreyi değiştirirse veya art
  // arda başarısız denemeyle hesabı kilitlerse, bu olmadan sonraki ziyaretçiler
  // landing sayfasında reklamı yapılan admin/admin123 ile hiç giremezdi.
  await pool.query(
    "UPDATE users SET password_hash = $1, failed_attempts = 0, locked_until = NULL, is_active = true WHERE username = 'admin'",
    ["$2a$10$OpYuNAPfyj4RT4OootiFKu2yfYfPKVOrmMk3GyvAiFIUf4dCZvQ5y"]
  );

  for (const name of GENERIC_SUPPLIERS) {
    await pool.query("INSERT INTO suppliers (name) VALUES ($1) ON CONFLICT DO NOTHING", [name]);
  }

  for (const c of CUSTOMERS) {
    await pool.query("INSERT INTO customers (name, phone) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING", [c.name, c.phone]);
  }

  const productIds: number[] = [];
  for (const p of PRODUCTS) {
    const res = await pool.query<{ id: number }>(
      `INSERT INTO products (code, brand, size_desc, season, supplier, production_week, production_year, purchase_price, sale_price, stock_qty)
       VALUES ($1, $2, $3, $4, $5, 12, 2026, $6, $7, $8) RETURNING id`,
      [p.code, p.brand, p.size_desc, p.season, p.supplier, p.purchase_price, p.sale_price, p.stock_qty]
    );
    const id = res.rows[0].id;
    productIds.push(id);
    await pool.query(
      `INSERT INTO product_stock_entries (product_id, entry_date, quantity, purchase_price, sale_price)
       VALUES ($1, CURRENT_DATE - INTERVAL '20 days', $2, $3, $4)`,
      [id, p.stock_qty, p.purchase_price, p.sale_price]
    );
  }

  const servicesRes = await pool.query<{ id: number; name: string }>("SELECT id, name FROM services");
  const serviceId = new Map(servicesRes.rows.map((s) => [s.name, s.id]));

  type OrderLine = { service: string; supplier: string; unit_price: number; quantity: number; cost_price: number; productIdx?: number; size_desc?: string };
  type OrderSpec = {
    plate: string;
    customer_name: string;
    customer_phone: string;
    daysAgo: number;
    status: "TAMAMLANDI" | "BEKLEMEDE";
    payment_type: string | null;
    lines: OrderLine[];
  };

  const orders: OrderSpec[] = [
    { plate: "34 ABC 123", customer_name: "Ahmet Yılmaz", customer_phone: "0555 123 45 67", daysAgo: 1, status: "TAMAMLANDI", payment_type: "Nakit", lines: [
      { service: "Lastik Değişimi", supplier: "Servis İşçiliği", unit_price: 800, quantity: 4, cost_price: 0 },
      { service: "Rot Ayarı", supplier: "Servis İşçiliği", unit_price: 350, quantity: 1, cost_price: 0 },
    ] },
    { plate: "06 XYZ 45", customer_name: "Merve Kaya", customer_phone: "0532 456 78 90", daysAgo: 1, status: "TAMAMLANDI", payment_type: "POS", lines: [
      { service: "Lastik Satışı", supplier: "Merkez Lastik Dağıtım", unit_price: 1850 * 4, quantity: 4, cost_price: 1450 * 4, productIdx: 0, size_desc: "205/55R16" },
    ] },
    { plate: "35 DEF 789", customer_name: "Can Demir", customer_phone: "0544 789 01 23", daysAgo: 2, status: "BEKLEMEDE", payment_type: null, lines: [
      { service: "Balans Ayarı", supplier: "Servis İşçiliği", unit_price: 300, quantity: 1, cost_price: 0 },
      { service: "Rot Ayarı", supplier: "Servis İşçiliği", unit_price: 350, quantity: 1, cost_price: 0 },
    ] },
    { plate: "16 KLM 12", customer_name: "Zeynep Aksoy", customer_phone: "0505 234 56 78", daysAgo: 3, status: "TAMAMLANDI", payment_type: "Nakit", lines: [
      { service: "Lastik Tamiri", supplier: "Servis İşçiliği", unit_price: 250, quantity: 2, cost_price: 0 },
    ] },
    { plate: "42 NOP 67", customer_name: "Emre Şahin", customer_phone: "0533 345 67 89", daysAgo: 4, status: "TAMAMLANDI", payment_type: "Cari", lines: [
      { service: "Lastik Satışı", supplier: "Anadolu Oto Yedek Parça", unit_price: 2050 * 4, quantity: 4, cost_price: 1620 * 4, productIdx: 1, size_desc: "215/60R16" },
      { service: "Balans Ayarı", supplier: "Servis İşçiliği", unit_price: 300, quantity: 1, cost_price: 0 },
    ] },
    { plate: "07 QRS 89", customer_name: "Ayşe Çelik", customer_phone: "0542 456 78 90", daysAgo: 6, status: "TAMAMLANDI", payment_type: "Havale/EFT", lines: [
      { service: "Jant Düzeltme", supplier: "Batı Jant", unit_price: 450, quantity: 2, cost_price: 200 },
    ] },
    { plate: "34 TUV 34", customer_name: "Ahmet Yılmaz", customer_phone: "0555 123 45 67", daysAgo: 9, status: "TAMAMLANDI", payment_type: "POS", lines: [
      { service: "Lastik Satışı", supplier: "Batı Jant", unit_price: 1490 * 4, quantity: 4, cost_price: 1180 * 4, productIdx: 2, size_desc: "195/65R15" },
    ] },
    { plate: "06 WXY 21", customer_name: "Can Demir", customer_phone: "0544 789 01 23", daysAgo: 11, status: "BEKLEMEDE", payment_type: null, lines: [
      { service: "Ön Düzen Kontrolü", supplier: "Servis İşçiliği", unit_price: 400, quantity: 1, cost_price: 0 },
    ] },
    { plate: "35 ZAB 56", customer_name: "Merve Kaya", customer_phone: "0532 456 78 90", daysAgo: 14, status: "TAMAMLANDI", payment_type: "Nakit", lines: [
      { service: "Subap Değişimi", supplier: "Servis İşçiliği", unit_price: 150, quantity: 4, cost_price: 0 },
      { service: "Nitrojen Hava", supplier: "Servis İşçiliği", unit_price: 200, quantity: 1, cost_price: 0 },
    ] },
    { plate: "16 CDE 78", customer_name: "Zeynep Aksoy", customer_phone: "0505 234 56 78", daysAgo: 18, status: "TAMAMLANDI", payment_type: "Cari", lines: [
      { service: "Lastik Satışı", supplier: "Örnek Lastik A.Ş.", unit_price: 2490 * 2, quantity: 2, cost_price: 1980 * 2, productIdx: 3, size_desc: "225/45R17" },
    ] },
    { plate: "42 FGH 90", customer_name: "Emre Şahin", customer_phone: "0533 345 67 89", daysAgo: 22, status: "TAMAMLANDI", payment_type: "POS", lines: [
      { service: "Klima Gazı", supplier: "Servis İşçiliği", unit_price: 900, quantity: 1, cost_price: 0 },
    ] },
    { plate: "34 IJK 11", customer_name: "Ayşe Çelik", customer_phone: "0542 456 78 90", daysAgo: 27, status: "TAMAMLANDI", payment_type: "Nakit", lines: [
      { service: "Bijon", supplier: "Servis İşçiliği", unit_price: 60, quantity: 20, cost_price: 25 },
    ] },
  ];

  for (const o of orders) {
    const totalAmount = o.lines.reduce((sum, l) => sum + l.unit_price, 0);
    const paidAmount = o.status === "TAMAMLANDI" ? totalAmount : null;
    const createdAt = daysAgo(o.daysAgo);

    const orderRes = await pool.query<{ id: number }>(
      `INSERT INTO orders (plate, customer_name, customer_phone, total_amount, paid_amount, status, payment_type, payment_date, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [
        o.plate,
        o.customer_name,
        o.customer_phone,
        totalAmount,
        paidAmount,
        o.status,
        o.payment_type,
        o.status === "TAMAMLANDI" ? createdAt : null,
        createdAt,
      ]
    );
    const orderId = orderRes.rows[0].id;

    for (const l of o.lines) {
      const svcId = serviceId.get(l.service);
      if (!svcId) continue;
      const productId = l.productIdx != null ? productIds[l.productIdx] : null;
      await pool.query(
        `INSERT INTO order_services (order_id, service_id, unit_price, quantity, cost_price, supplier, size_desc, payment_type, product_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [orderId, svcId, l.unit_price, l.quantity, l.cost_price, l.supplier, l.size_desc ?? null, o.payment_type, productId]
      );
    }

    if (o.status === "TAMAMLANDI" && o.payment_type) {
      await pool.query(
        "INSERT INTO order_payments (order_id, payment_type, amount, created_at) VALUES ($1, $2, $3, $4)",
        [orderId, o.payment_type, totalAmount, createdAt]
      );
    }
  }

  const storageRows = [
    { depo_no: 1, plate: "34 ABC 123", customer_name: "Ahmet Yılmaz", phone: "0555 123 45 67", ebat: "205/55R16", marka: "Voyra", mevsim: "Kışlık", islemDaysAgo: 285, overdue: true },
    { depo_no: 2, plate: "06 XYZ 45", customer_name: "Merve Kaya", phone: "0532 456 78 90", ebat: "215/60R16", marka: "Nordex", mevsim: "Yazlık", islemDaysAgo: 45, overdue: false },
    { depo_no: 3, plate: "35 DEF 789", customer_name: "Can Demir", phone: "0544 789 01 23", ebat: "195/65R15", marka: "Sferro", mevsim: "Kışlık", islemDaysAgo: 260, overdue: true },
    { depo_no: 4, plate: "16 KLM 12", customer_name: "Zeynep Aksoy", phone: "0505 234 56 78", ebat: "225/45R17", marka: "Voyra", mevsim: "Yazlık", islemDaysAgo: 20, overdue: false },
    { depo_no: 5, plate: "42 NOP 67", customer_name: "Emre Şahin", phone: "0533 345 67 89", ebat: "205/55R16", marka: "Voyra", mevsim: "Kışlık", islemDaysAgo: 12, overdue: false },
  ];

  for (const s of storageRows) {
    await pool.query(
      `INSERT INTO storage (depo_no, plate, customer_name, phone, ebat, marka, adet, mevsim, islem_tarihi, teslim_edildi)
       VALUES ($1, $2, $3, $4, $5, $6, 4, $7, $8, false)`,
      [s.depo_no, s.plate, s.customer_name, s.phone, s.ebat, s.marka, s.mevsim, daysAgo(s.islemDaysAgo)]
    );
  }
}
