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
  -- POS, vb.) olduğu gibi korur. "Mail Order" bir tedarikçiyle birleşip
  -- "<Tedarikçi> Mail Order" olarak saklanabildiğinden (bkz. api/orders/[id])
  -- ve tedarikçi ismi serbest/uzun metin olabildiğinden VARCHAR(30) yetersizdi
  -- (ör. "Anadolu Oto Yedek Parça Mail Order" 34 karakter) — TEXT'e genişletildi.
  payment_type   TEXT,
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
  -- (tüm satırlar aynıysa o değer, karışıksa 'Karışık'). TEXT — bkz. orders.payment_type yorumu.
  payment_type  TEXT
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
  payment_type  TEXT NOT NULL,
  amount        DECIMAL(10,2) NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Yukarıdaki üç payment_type sütunu başlangıçta VARCHAR(30) idi — "Mail
-- Order" bir tedarikçiyle birleşince (bkz. yukarıdaki yorumlar) bazı
-- tedarikçi isimleriyle 30 karakteri aşıp INSERT'te 500 hatasına yol
-- açıyordu (canlıda gerçekleşti: "Anadolu Oto Yedek Parça Mail Order", 34
-- karakter). Zaten var olan tablolarda CREATE TABLE IF NOT EXISTS kolon
-- tipini değiştirmediğinden, mevcut Ustalas/Elevire veritabanları için
-- burada ayrıca genişletiliyor.
ALTER TABLE orders ALTER COLUMN payment_type TYPE TEXT;
ALTER TABLE order_services ALTER COLUMN payment_type TYPE TEXT;
ALTER TABLE order_payments ALTER COLUMN payment_type TYPE TEXT;

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
-- Müşteri Detayı ekranındaki "Siparişler" ve müşteri silme öncesi aktif
-- sipariş kontrolü, customer_name üzerinden filtreler (bkz. /api/customers/*).
CREATE INDEX IF NOT EXISTS orders_customer_name_idx ON orders(customer_name);

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

-- Genel uygulama ayarları — tek satır (id=1, CHECK ile zorlanır). İleride
-- çoklu firma (SaaS) desteği eklenirse bu tabloya company_id eklenip firma
-- başına bir satır olur; şimdilik firmaya özel değerleri kod içinde dağınık
-- hardcode etmek yerine burada toplamak o geçişi ucuzlatır.
-- payment_types: sipariş kapama ekranındaki ödeme seçenekleri + Excel içe
-- aktarmada "bilinen" (Mail Order'a çevrilmeyen) ödeme tipleri (bkz.
-- src/lib/ordersExcel.ts) — "Mail Order" hariç listenin geri kalanı. Bu
-- listeyi değiştirmek geçmiş sipariş kayıtlarını (serbest metin olarak
-- saklanır) etkilemez, yalnızca yeni seçim/içe aktarma davranışını etkiler.
CREATE TABLE IF NOT EXISTS app_settings (
  id                     INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  business_name          VARCHAR(150) NOT NULL DEFAULT 'Lastik Servis Yönetim Sistemi',
  storage_overdue_months INT NOT NULL DEFAULT 6,
  payment_types          TEXT[] NOT NULL DEFAULT ARRAY['Nakit','POS','Cari','Fatura Edildi.','Havale/EFT','Mail Order'],
  updated_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO app_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

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
-- Aktif kayıtlarda depo no eşzamanlı iki POST'ta çakışabiliyordu (boşta kalan
-- no ayrı bir SELECT ile bulunup kilitsiz INSERT ediliyordu) — bu kısıt
-- ikincisini 23505 ile engeller (bkz. src/app/api/storage/route.ts POST).
-- teslim_edildi=true olunca depo no'nun tekrar kullanılabilmesi için kısıt
-- yalnızca aktif (teslim_edildi=false) kayıtları kapsar.
CREATE UNIQUE INDEX IF NOT EXISTS storage_active_depo_no_unique ON storage(depo_no) WHERE teslim_edildi = false AND depo_no IS NOT NULL;
-- Liste varsayılan sıralaması (created_at DESC) ve "Gecikmiş" filtresi (islem_tarihi).
CREATE INDEX IF NOT EXISTS storage_created_at_idx ON storage(created_at DESC);
CREATE INDEX IF NOT EXISTS storage_islem_tarihi_idx ON storage(islem_tarihi);

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
-- Yukarıdaki iki unique index kısmi (partial) olduğundan genel Kod eşleşmesini/
-- GROUP BY code'u (liste ekranı, stok-kodu önerisi) güvenilir şekilde karşılamaz —
-- düz bir index de eklenir. supplier/season, liste ve stok-kodu filtrelerinde kullanılır.
CREATE INDEX IF NOT EXISTS products_code_idx ON products(code);
CREATE INDEX IF NOT EXISTS products_supplier_idx ON products(supplier);
CREATE INDEX IF NOT EXISTS products_season_idx ON products(season);

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

-- Masraflar (kira, elektrik, personel, malzeme vb. işletme giderleri) —
-- sipariş/hizmetlerden bağımsız, sadece yönetici tarafından girilir;
-- Raporlar sayfasındaki Kâr hesabından düşülür (bkz. /api/reports).
CREATE TABLE IF NOT EXISTS expenses (
  id             SERIAL PRIMARY KEY,
  expense_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  category       VARCHAR(100) NOT NULL,
  description    TEXT,
  amount         DECIMAL(10,2) NOT NULL,
  payment_type   TEXT,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS expenses_expense_date_idx ON expenses(expense_date);

-- Sabit Giderler (kira gibi ayda bir tekrar eden, tutarı yılda belki bir kez
-- değişen giderler) — her ay elle yeniden girmek yerine bir kere tanımlanır,
-- Masraflar ekranındaki "Sabit Giderleri Ekle" ile o ay için tek tıkla
-- masraf satırına dönüştürülür (bkz. expenses.recurring_expense_id).
-- is_active=false: geçici olarak durdurulmuş bir sabit gider (silinmeden).
CREATE TABLE IF NOT EXISTS recurring_expenses (
  id           SERIAL PRIMARY KEY,
  category     VARCHAR(100) NOT NULL,
  description  TEXT,
  amount       DECIMAL(10,2) NOT NULL,
  payment_type TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Bir masrafın hangi sabit gider şablonundan oluşturulduğunu izler — "Sabit
-- Giderleri Ekle" akışı, seçili ay için henüz eklenmemiş şablonları bulmak
-- amacıyla bunu kullanır. Şablon silinirse geçmiş masraf kayıtları etkilenmez
-- (SET NULL) — bu yalnızca soy/köken bilgisidir, FK zorunlu değildir.
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS recurring_expense_id INT REFERENCES recurring_expenses(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS expenses_recurring_expense_id_idx ON expenses(recurring_expense_id);

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

-- Varsayılan tedarikçiler — genel/nötr bir başlangıç listesi (bkz. src/app/page.tsx
-- TEDARIKCI_SEED yorumu): bu proje başka firmalara da sunulacağından kod ve
-- şema içine tek bir firmanın gerçek tedarikçi listesini gömmek yanlış olur.
INSERT INTO suppliers (name) VALUES
  ('Servis İşçiliği'), ('Merkez Lastik Dağıtım'), ('Anadolu Oto Yedek Parça'),
  ('Batı Jant'), ('Örnek Lastik A.Ş.'), ('İkinci El'), ('Diğer')
ON CONFLICT DO NOTHING;

-- Brute-force koruması: art arda başarısız giriş denemesi sayacı ve geçici
-- kilit süresi (bkz. src/app/api/auth/login/route.ts) — DB'de tutulur ki
-- birden fazla sunucu örneği (serverless) arasında da tutarlı çalışsın.
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_attempts INT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

-- Hesap devre dışı bırakma (silmeden): pasif hesapla giriş yapılamaz,
-- mevcut token'ı da getAuthUser'daki DB kontrolüyle geçersiz sayılır.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Zorla oturum sonlandırma: bu zamandan ÖNCE imzalanmış (iat) token'lar
-- artık geçersiz sayılır — bkz. getAuthUser. Şifre değişse bile eski
-- cookie'ler token süresi dolana kadar geçerli kalırdı; bu alan yöneticinin
-- "Oturumu Sonlandır" aksiyonuyla belirli bir kullanıcının tüm cihazlardaki
-- oturumunu anında düşürmesini sağlar.
ALTER TABLE users ADD COLUMN IF NOT EXISTS tokens_invalid_before TIMESTAMPTZ;

-- Son başarılı giriş zamanı — Kullanıcılar listesinde görünürlük için.
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- Varsayılan admin kullanıcısı
-- Şifre: admin123  (bcrypt hash — uygulamayı başlatmadan önce değiştiriniz!)
-- Yeni hash oluşturmak için: node -e "const b=require('bcryptjs'); b.hash('YeniSifre',10).then(h=>console.log(h))"
-- Not: buradaki hash önceden "admin123" ile eşleşmiyordu (2026-08-14'te fark edildi,
-- Elevire demo girişini kalıcı olarak kilitliyordu) — düzeltildi ve doğrulandı.
INSERT INTO users (username, password_hash, role) VALUES
  ('admin', '$2a$10$OpYuNAPfyj4RT4OootiFKu2yfYfPKVOrmMk3GyvAiFIUf4dCZvQ5y', 'admin')
ON CONFLICT DO NOTHING;
