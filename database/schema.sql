-- Lastik Servis Yönetim Sistemi — Veritabanı Şeması
-- PostgreSQL (Neon)

-- Hizmetler
CREATE TABLE IF NOT EXISTS services (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  -- Fiyat opsiyoneldir: her hizmete varsayılan fiyat verilmek zorunda değil —
  -- boş bırakılırsa Sipariş Oluşturma ekranında Tutar elle girilir.
  price      DECIMAL(10,2),
  is_active  SMALLINT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS services_name_unique ON services(name);

-- Siparişler
CREATE TABLE IF NOT EXISTS orders (
  id             SERIAL PRIMARY KEY,
  plate          VARCHAR(20) NOT NULL,
  customer_name  VARCHAR(100),
  customer_phone VARCHAR(20),
  notes          TEXT,
  total_amount   DECIMAL(10,2),
  paid_amount    DECIMAL(10,2),
  status         VARCHAR(20) DEFAULT 'BEKLEMEDE' CHECK (status IN ('BEKLEMEDE', 'TAMAMLANDI')),
  -- Serbest metin: elle kapatma Nakit/POS/Cari/Fatura Edildi. kullanır, Excel
  -- içe aktarımı muhasebe programındaki asıl ödeme etiketini (Cari, Mail Order,
  -- POS, vb.) olduğu gibi korur.
  payment_type   VARCHAR(30),
  payment_date   TIMESTAMP NULL,
  -- Excel içe aktarımından gelen siparişleri tekilleştirmek için (aynı dosya/satır
  -- tekrar içe aktarılırsa yinelenen sipariş oluşmasın diye). Elle girilenlerde NULL.
  import_ref     VARCHAR(150) UNIQUE,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sipariş <-> Hizmet ilişkisi
CREATE TABLE IF NOT EXISTS order_services (
  id            SERIAL PRIMARY KEY,
  order_id      INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  service_id    INT NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  unit_price    DECIMAL(10,2) NOT NULL,
  quantity      INT NOT NULL DEFAULT 1,
  cost_price    DECIMAL(12,2),
  supplier      VARCHAR(100),
  stock_code    VARCHAR(50),
  size_desc     VARCHAR(100),
  -- Aynı siparişteki farklı işlemler farklı şekilde ödenebilir (ör. biri nakit,
  -- biri kart, biri cari) — bu yüzden ödeme tipi sipariş değil, işlem (satır)
  -- seviyesindedir. orders.payment_type ise siparişin özet/görünüm değeridir
  -- (tüm satırlar aynıysa o değer, karışıksa 'Karışık').
  payment_type  VARCHAR(30)
);

-- "Ödeme Al & Kapat" sırasında tek bir tutar/tip yerine parçalı ödeme
-- girilebilir (ör. 7.000 POS + 15.000 Garanti Hesap) — orders.paid_amount bu
-- satırların toplamıdır, orders.payment_type özet değeridir (tek tipse o
-- değer, karışıksa 'Karışık'). Excel'den içe aktarılan eski siparişlerde bu
-- tablo boş kalır; ödeme kırılımı onlar için hâlâ order_services.payment_type
-- (satır bazlı) üzerinden okunur — bkz. /api/reports.
CREATE TABLE IF NOT EXISTS order_payments (
  id            SERIAL PRIMARY KEY,
  order_id      INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  payment_type  VARCHAR(30) NOT NULL,
  amount        DECIMAL(10,2) NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Performans: Sipariş Listesi'nin varsayılan sıralaması (created_at DESC) ve
-- Durum/Tarih filtreleri, ayrıca order_services -> orders/services join'leri.
CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders(status);
CREATE INDEX IF NOT EXISTS order_services_order_id_idx ON order_services(order_id);
CREATE INDEX IF NOT EXISTS order_services_service_id_idx ON order_services(service_id);
-- Sipariş Listesi'ndeki Filtrele modalının Tedarikçi/Ödeme Şekli çoklu seçim
-- filtreleri (= ANY(...), birebir eşleşme) için.
CREATE INDEX IF NOT EXISTS order_services_supplier_idx ON order_services(supplier);
CREATE INDEX IF NOT EXISTS order_services_payment_type_idx ON order_services(payment_type);
CREATE INDEX IF NOT EXISTS order_payments_order_id_idx ON order_payments(order_id);

-- Müşteri dizini (Sipariş Oluşturma ekranındaki Müşteri seçimi için) — orders.customer_name
-- serbest metin olarak kalır (FK değil); burası sadece öneri/yönetim listesidir,
-- yeni bir sipariş yeni bir isimle kaydedildiğinde otomatik olarak eklenir.
CREATE TABLE IF NOT EXISTS customers (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(100) NOT NULL UNIQUE,
  phone      VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tedarikçi dizini (Sipariş Oluşturma ekranındaki Tedarikçi seçimi için) — aynı
-- şekilde order_services.supplier serbest metin kalır, burası öneri/yönetim listesidir.
CREATE TABLE IF NOT EXISTS suppliers (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Kullanıcılar (yöneticiler)
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(20) DEFAULT 'admin',
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Depolama (mevsimlik lastik depolama takibi). Aynı plaka+mevsim için ikinci
-- aktif kayıt açılması DB kısıtı yerine uygulama katmanında engellenir (bkz.
-- src/app/api/storage/route.ts POST) — çünkü teslim edilmiş (teslim_edildi=true)
-- eski bir kayıtla aynı plaka+mevsim çifti tekrar (yeni bir depolama dönemi
-- olarak) açılabilmeli; katı bir UNIQUE(plate, mevsim) kısıtı bunu engellerdi.
CREATE TABLE IF NOT EXISTS storage (
  id             SERIAL PRIMARY KEY,
  depo_no        INT,
  plate          VARCHAR(20),
  customer_name  VARCHAR(100),
  phone          VARCHAR(30),
  ebat           VARCHAR(50),
  marka          VARCHAR(100),
  dis_derinligi  VARCHAR(50),
  adet           INT DEFAULT 4,
  mevsim         VARCHAR(30),
  aciklama       TEXT,
  islem_tarihi   DATE DEFAULT CURRENT_DATE,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- Teslim edilen lastikler "Teslim Et" ile işaretlenir — depo_no tekrar
  -- kullanılabilir hale gelir, kayıt "Teslim Edilenler" görünümüne taşınır.
  teslim_edildi  BOOLEAN DEFAULT false,
  teslim_tarihi  DATE
);
CREATE INDEX IF NOT EXISTS storage_teslim_edildi_idx ON storage(teslim_edildi);

-- Ürün Kataloğu (lastik/ürün fiyat ve stok listesi) — her satır bir PARTİdir.
-- Aynı Ürün Kodu + Marka + Ebat'a sahip birden çok satır olabilir, farklı Üretim
-- Haftası/Yılı ile ayrılırlar (ör. aynı kod 10/2025 ve 10/2026 üretimli iki ayrı
-- parti olarak iki satır tutulur, her partinin kendi stok/alış-satış fiyatı vardır).
-- Üretim Haftası/Yılı, lastik endüstrisindeki DOT kodu (ör. "1026" = 10. hafta,
-- 2026) mantığıyla tutulur — takvim tarihi değil, tam gün gerekmez.
CREATE TABLE IF NOT EXISTS products (
  id                SERIAL PRIMARY KEY,
  code              VARCHAR(50) NOT NULL,
  brand             VARCHAR(100),
  size_desc         VARCHAR(100),
  season            VARCHAR(30),
  supplier          VARCHAR(100),
  production_week   SMALLINT,
  production_year   SMALLINT,
  purchase_price    DECIMAL(12,2),
  sale_price        DECIMAL(12,2),
  stock_qty         INT DEFAULT 0,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

DROP INDEX IF EXISTS products_code_unique;
DROP INDEX IF EXISTS products_name_unique;
DROP INDEX IF EXISTS products_code_date_unique;
DROP INDEX IF EXISTS products_code_nodate_unique;

-- Üretim haftası/yılı girilmiş partiler Kod+Hafta+Yıl+Tedarikçi ile; aynı
-- kod ve üretim haftası/yılına sahip parti farklı tedarikçilerden ayrı ayrı
-- stok girişi olarak eklenebilir (ör. 10/26 partisi 10 farklı tedarikçiden
-- gelebilir). Henüz üretim haftası/yılı girilmemiş "temel" satır (Excel'den
-- ilk gelen, tarihsiz) tek başına Kod ile benzersizdir — İçe aktarma bu temel
-- satırı bulup günceller, partili satırlar elle eklenir.
DROP INDEX IF EXISTS products_code_batch_unique;
CREATE UNIQUE INDEX IF NOT EXISTS products_code_batch_unique ON products(code, production_year, production_week, COALESCE(supplier, '')) WHERE production_year IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS products_code_nodate_unique ON products(code) WHERE production_year IS NULL;

-- NOT: Daha önce ayrı, serbest biçimli bir "Stok Girişi & Fiyat Geçmişi"
-- (product_purchases) tablosu vardı; kaldırılmıştı. Aynı ihtiyaç (fiyatlar gün
-- bazlı değişebildiği için geçmişini görebilme) product_stock_entries ile geri
-- geldi — ama bu sefer doğrudan bir products satırına (parti: kod+hafta/yıl+
-- tedarikçi) bağlı. Aynı partiye tekrar "Stok Girişi" yapıldığında (Yeni Ürün /
-- Parti formu ile, kod+hafta/yıl+tedarikçi eşleşirse) products.stock_qty'ye
-- eklenir ve buraya yeni bir satır düşer — mevcut parti asla ezilmez.
DROP TABLE IF EXISTS product_purchases;

-- Model/Açıklama alanı kaldırıldı; yerine Tedarikçi alanı önceliklendirildi.
ALTER TABLE products DROP COLUMN IF EXISTS model;

CREATE TABLE IF NOT EXISTS product_stock_entries (
  id              SERIAL PRIMARY KEY,
  product_id      INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  entry_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  quantity        INT NOT NULL,
  purchase_price  DECIMAL(12,2),
  sale_price      DECIMAL(12,2),
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS product_stock_entries_product_id_idx ON product_stock_entries(product_id);

-- Geriye dönük dolum: mevcut partilerin (henüz hiç geçmiş kaydı olmayan)
-- şu anki stok/fiyatını tek bir geçmiş satırı olarak kaydeder — böylece
-- "Fiyat Geçmişi" hiçbir zaman tamamen boş görünmez.
INSERT INTO product_stock_entries (product_id, entry_date, quantity, purchase_price, sale_price, created_at)
SELECT p.id, COALESCE(p.updated_at::date, p.created_at::date, CURRENT_DATE), COALESCE(p.stock_qty, 0), p.purchase_price, p.sale_price, COALESCE(p.updated_at, p.created_at, CURRENT_TIMESTAMP)
FROM products p
WHERE NOT EXISTS (SELECT 1 FROM product_stock_entries e WHERE e.product_id = p.id);

-- "Lastik Satışı" işleminde belirli bir parti seçilirse buraya bağlanır —
-- satır kaydedildiğinde o partinin stock_qty'sinden Adet kadar düşülür, satır
-- silinir/değişirse geri eklenir (bkz. src/lib/productStock.ts). Diğer
-- işlemlerde (lastik satışı olmayan) NULL kalır. products tablosu order_services'ten
-- SONRA tanımlandığı için bu FK ayrı bir ALTER TABLE ile eklenir.
ALTER TABLE order_services ADD COLUMN IF NOT EXISTS product_id INT REFERENCES products(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS order_services_product_id_idx ON order_services(product_id);

-- Varsayılan hizmetler (Yapılan İşlem listesi) — fiyatı girilmemiş, yönetici
-- Hizmetler ekranından istediği kaleme fiyat verebilir/vermeyebilir.
INSERT INTO services (name, price) VALUES
  ('Rot Ayarı', NULL), ('Lastik Satışı', NULL), ('Lastik Değişimi', NULL),
  ('Lastik Tamiri', NULL), ('Depolama', NULL), ('Diğer', NULL),
  ('Jant Düzeltme', NULL), ('Sensör', NULL), ('Balans Ayarı', NULL),
  ('Far Ayarı', NULL), ('Kargo Geliri', NULL), ('Subap Değişimi', NULL),
  ('Bijon', NULL), ('Jant Satışı', NULL), ('Ön Düzen Kontrolü', NULL),
  ('İkinci El Jant', NULL), ('İkinci El Lastik', NULL), ('Nitrojen Hava', NULL),
  ('Klima Gazı', NULL), ('Jant Boyama', NULL), ('Yerinde Montaj Hizmeti', NULL)
ON CONFLICT (name) DO NOTHING;

-- Varsayılan tedarikçiler
INSERT INTO suppliers (name) VALUES
  ('Servis İşçiliği'), ('YUKE'), ('Keskin'), ('Artvin'), ('FB Lastik'), ('Uspa'),
  ('Güler'), ('Simetri'), ('Mollaoğlu'), ('Karaoğlu'), ('Yedi Oto'), ('Jantçı Bülent'),
  ('Sel Oto'), ('Mutaflar'), ('Güncan Veysel'), ('DRS'), ('LastikBurada'), ('Atlastur'),
  ('Gizem Oto'), ('İkinci El'), ('Hankook Fabrika'), ('Diğer'), ('Has Ticaret'),
  ('Özkan Lastik'), ('Haskar')
ON CONFLICT DO NOTHING;

-- Varsayılan admin kullanıcısı
-- Şifre: admin123  (bcrypt hash — uygulamayı başlatmadan önce değiştiriniz!)
-- Yeni hash oluşturmak için: node -e "const b=require('bcryptjs'); b.hash('YeniSifre',10).then(h=>console.log(h))"
INSERT INTO users (username, password_hash, role) VALUES
  ('admin', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin')
ON CONFLICT DO NOTHING;
