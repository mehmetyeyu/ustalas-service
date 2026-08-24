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
-- Not: payment_types'ın DEFAULT'u bir süre yanlışlıkla Ustalas'a özel bir
-- listeye (Garanti Hesap/Nazım Hesap/Sait Hesap dahil) sabitlenmişti,
-- 02890c6 ile buradaki (CREATE TABLE) tanım jenerik listeye düzeltildi —
-- ama "CREATE TABLE IF NOT EXISTS" zaten var olan bir tabloda DEFAULT
-- değişikliğini asla uygulamadığından, Ustalas'ın canlı veritabanındaki
-- kolonun gerçek DEFAULT'u hâlâ o eski özel listedeydi (yeni firma
-- oluşturulunca bu miras kalıyordu — provisionTenant() bulup düzeltti).
-- Aşağıdaki ALTER, o eksik düzeltmeyi tamamlıyor; zararsız/idempotent
-- (sadece gelecekteki INSERT'lerin default'unu etkiler, mevcut satırların
-- verisini değiştirmez).
ALTER TABLE app_settings ALTER COLUMN payment_types SET DEFAULT ARRAY['Nakit','POS','Cari','Fatura Edildi.','Havale/EFT','Mail Order'];

-- Not: bu tablonun tekil-satır (id=1) seed'i artık bu dosyanın sonundaki
-- multi-tenant bloğunda, tenant_id'ye göre yapılıyor (id kolonu o blokta
-- kaldırılıyor — burada bırakılsaydı ikinci build'de "column id does not
-- exist" hatası verirdi).

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

-- Not: varsayılan hizmet/tedarikçi seed'leri artık burada değil — bu iki
-- INSERT tek bir global kuruluma özeldi (ON CONFLICT (name)/DO NOTHING),
-- services/suppliers artık (tenant_id, name) bazında benzersiz olduğundan
-- (bkz. aşağıdaki "ÇOKLU FİRMA" bloğu) bu satırlar hem hatalı hem tehlikeli
-- hale geldi: services'teki ON CONFLICT (name) artık hiçbir index'i
-- hedeflemediğinden hata verirdi; suppliers'taki hedefsiz ON CONFLICT DO
-- NOTHING ise (tenant_id eklenmediği için NULL'a düşen) her yeniden
-- çalıştırmada sessizce yeni tenant_id=NULL kopyalar üretiyordu (NULL hiçbir
-- unique kısıtta "eşit" sayılmaz). Bu iki listenin firma başına doğru
-- şekilde eklenmesi artık `src/lib/provisionTenant.ts` / `scripts/create-tenant.mjs`
-- ile oluyor (tenant oluşturulurken tek seferlik).

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

-- Sayfa/aksiyon bazlı ek yetkiler — sadece role='staff' için anlamlı (admin
-- her zaman tam yetkili, bu alanı yoksayar). "kaynak.aksiyon" biçiminde
-- düz metin dizisi (ör. 'orders.view', 'storage.edit') — bkz. src/lib/permissions.ts
-- (tek doğruluk kaynağı: hangi kaynak/aksiyon çiftleri geçerli). Var olan
-- kullanıcılar boş dizi alır — bu, mevcut staff davranışını (sadece /) hiç
-- değiştirmez, geriye dönük tam uyumlu.
ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions TEXT[] NOT NULL DEFAULT '{}';

-- Ana admin: tek, sabit bir hesap — rolü/aktifliği/şifresi/kullanıcı adı
-- başka HİÇBİR admin tarafından değiştirilemez veya silinemez (bkz.
-- PATCH/DELETE /api/users/:id). Son-admin korumasından farklı: admin sayısı
-- kaç olursa olsun bu hesap dokunulmaz kalır. UI'da bunu değiştirecek bir
-- buton yok — kasıtlı olarak sabit, elle DB'den değiştirilir.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_primary_admin BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS users_single_primary_admin ON users(is_primary_admin) WHERE is_primary_admin = true;
UPDATE users SET is_primary_admin = true WHERE username = 'admin';

-- Varsayılan admin kullanıcısı
-- Şifre: admin123  (bcrypt hash — uygulamayı başlatmadan önce değiştiriniz!)
-- Yeni hash oluşturmak için: node -e "const b=require('bcryptjs'); b.hash('YeniSifre',10).then(h=>console.log(h))"
-- Not: buradaki hash önceden "admin123" ile eşleşmiyordu (2026-08-14'te fark edildi,
-- Elevire demo girişini kalıcı olarak kilitliyordu) — düzeltildi ve doğrulandı.
INSERT INTO users (username, password_hash, role) VALUES
  ('admin', '$2a$10$OpYuNAPfyj4RT4OootiFKu2yfYfPKVOrmMk3GyvAiFIUf4dCZvQ5y', 'admin')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- ÇOKLU FİRMA (MULTI-TENANT) — Aşama 1: temel altyapı.
--
-- Amaç: tek deployment/DB'de birden çok firmayı (lastikçiyi) birbirinin
-- verisini görmeden barındırabilmek (bkz. proje planı,
-- ~/.claude/plans/joyful-kindling-badger.md). Bu blok BİLEREK sadece
-- ekleyici/zararsız: yeni "tenants" tablosu + her firma-sahipli tabloya
-- nullable bir tenant_id + mevcut tek gerçek müşterinin (id=1, "Ustalas")
-- tüm satırlarına anında geri-dolum. Henüz HİÇBİR route bu kolonu
-- okumuyor/filtrelemiyor ve HİÇBİR eski UNIQUE index/seed değişmedi — o
-- yüzden bu blok şu an çalışan uygulamanın davranışını hiç değiştirmez.
-- Her kaynak (orders, products, storage, ...) kendi göç sırası geldiğinde
-- HEM route'ları HEM o tabloya özel unique index'i (tenant_id'yi de içerecek
-- şekilde) aynı deploy'da güncelleyecek — bkz. plan dosyasındaki Faz 3-9.
--
-- İSTİSNA: app_settings burada tam olarak dönüştürülüyor (tekil id=1 satırı
-- yerine firma başına bir satır, PK=tenant_id) çünkü onu kullanan 3 dosya
-- (src/lib/settings.ts, api/settings, api/storage, api/orders/[id]) bu
-- commit'te birlikte güncellendi — yarım kalmış bir ara durum yok.
CREATE TABLE IF NOT EXISTS tenants (
  id                   SERIAL PRIMARY KEY,
  name                 VARCHAR(150) NOT NULL,
  slug                 VARCHAR(60) UNIQUE,
  is_active            BOOLEAN NOT NULL DEFAULT true,
  -- İleride merkezi kayıt/faturalandırma için ayrılmış — şu an hiçbir kod
  -- bu alanları okumuyor/yazmıyor.
  plan                 VARCHAR(50),
  billing_provider     VARCHAR(30),
  billing_customer_id  VARCHAR(100),
  billing_status       VARCHAR(30),
  trial_ends_at        TIMESTAMPTZ,
  created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- Mevcut tek gerçek müşteri (Ustalas prod) için bootstrap satırı — sonraki
-- geri-dolum UPDATE'lerinin işaret ettiği firma budur. Elevire kendi ayrı
-- veritabanında bu INSERT'i kendi başına çalıştırır; isim/slug orada da ilk
-- deploy'da "Ustalas"/"ustalas" olarak oluşuyordu — Elevire'ın verisiyle
-- karışma riski yok (tamamen ayrı bir veritabanı) ama Online Randevu
-- eklenince artık Elevire panelindeki embed linkinde ve /randevu/ustalas
-- URL'inde gerçek müşteri adı görünür oldu (2026-08-25'te fark edildi).
-- ON CONFLICT DO NOTHING olduğu için burada değer değiştirmek Elevire'nin
-- zaten var olan satırını düzeltmez — Elevire'nin kendi DB'sinde tek seferlik
-- `UPDATE tenants SET name='Elevire Demo', slug='elevire-demo' WHERE id=1;`
-- ile elle düzeltildi (demoSeed.ts'in gecelik reset'i tenants tablosuna hiç
-- dokunmuyor, bu değişiklik kalıcı).
-- slug NOT NULL (bkz. "Online Randevu" bölümü) — Postgres, ON CONFLICT DO
-- NOTHING'in çakışmayı tespit etmesinden ÖNCE önerilen satırın NOT NULL
-- kısıtlarını doğruluyor; slug verilmezse id=1 zaten var olsa bile bu INSERT
-- her seferinde "null value in column slug" hatasıyla patlardı.
INSERT INTO tenants (id, name, slug) VALUES (1, 'Ustalas', 'ustalas') ON CONFLICT (id) DO NOTHING;
-- Yukarıdaki elle-id'li INSERT, "id SERIAL" sütununun kendi sequence'ini
-- ilerletmez — düzeltilmezse bir sonraki "INSERT INTO tenants (name) ..."
-- (provisionTenant/create-tenant.mjs) yine id=1 üretmeye çalışıp
-- "duplicate key" hatası verirdi. Sequence'i mevcut en yüksek id'ye göre
-- senkronlamak her build'de güvenle tekrarlanabilir.
SELECT setval('tenants_id_seq', (SELECT MAX(id) FROM tenants));

ALTER TABLE services ADD COLUMN IF NOT EXISTS tenant_id INT REFERENCES tenants(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tenant_id INT REFERENCES tenants(id);
ALTER TABLE order_services ADD COLUMN IF NOT EXISTS tenant_id INT REFERENCES tenants(id);
ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS tenant_id INT REFERENCES tenants(id);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tenant_id INT REFERENCES tenants(id);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS tenant_id INT REFERENCES tenants(id);
-- users.username kasıtlı olarak GLOBAL unique kalıyor (bkz. plan) — girişte
-- firma seçimi yok, tenant_id kullanıcının kendi satırından okunuyor.
ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id INT REFERENCES tenants(id);
ALTER TABLE storage ADD COLUMN IF NOT EXISTS tenant_id INT REFERENCES tenants(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS tenant_id INT REFERENCES tenants(id);
ALTER TABLE product_stock_entries ADD COLUMN IF NOT EXISTS tenant_id INT REFERENCES tenants(id);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS tenant_id INT REFERENCES tenants(id);
ALTER TABLE recurring_expenses ADD COLUMN IF NOT EXISTS tenant_id INT REFERENCES tenants(id);

-- Şu an tek firma olduğundan geri-dolum tartışmasız: mevcut her satır o
-- firmaya (id=1) aittir. Sonraki tüm satırlar zaten provisionTenant() ile
-- doğru tenant_id ile oluşacak — bu UPDATE'ler idempotent (WHERE tenant_id
-- IS NULL), sonraki build'lerde no-op olur.
UPDATE services SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE orders SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE order_services SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE order_payments SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE customers SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE suppliers SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE users SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE storage SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE products SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE product_stock_entries SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE expenses SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE recurring_expenses SET tenant_id = 1 WHERE tenant_id IS NULL;

-- orders/products, çocuk tablolardan composite FK ile referans alınabilsin
-- diye (id, tenant_id) üzerinde de bir UNIQUE'e ihtiyaç duyar — id zaten tek
-- başına PK olduğundan bu ek kısıt otomatik sağlanır, mevcut veriyle hiçbir
-- çakışma riski yoktur.
CREATE UNIQUE INDEX IF NOT EXISTS orders_id_tenant_unique ON orders(id, tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS products_id_tenant_unique ON products(id, tenant_id);

-- Çocuk satırların ebeveynden FARKLI bir tenant_id ile eklenmesini DB
-- seviyesinde imkansız kılan composite FK'lar (savunma katmanı — yanlış
-- tenant_id ile INSERT artık sessiz bir sızıntı değil, 23503 hatası olur).
-- product_id nullable olduğundan (yalnızca lastik satışı satırlarında
-- doludur) composite FK, product_id NULL olan satırlarda standart FK NULL
-- semantiğiyle (MATCH SIMPLE) otomatik atlanır. Postgres'te
-- "ADD CONSTRAINT IF NOT EXISTS" yok — idempotentlik için DO bloğu +
-- duplicate_object yakalama kullanılıyor (dosyanın geri kalanındaki
-- IF NOT EXISTS deseniyle aynı amaç, farklı araç).
DO $$ BEGIN
  ALTER TABLE order_services ADD CONSTRAINT order_services_order_tenant_fk
    FOREIGN KEY (order_id, tenant_id) REFERENCES orders(id, tenant_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE order_services ADD CONSTRAINT order_services_product_tenant_fk
    FOREIGN KEY (product_id, tenant_id) REFERENCES products(id, tenant_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE order_payments ADD CONSTRAINT order_payments_order_tenant_fk
    FOREIGN KEY (order_id, tenant_id) REFERENCES orders(id, tenant_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE product_stock_entries ADD CONSTRAINT product_stock_entries_product_tenant_fk
    FOREIGN KEY (product_id, tenant_id) REFERENCES products(id, tenant_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- app_settings: tekil satır (id=1, CHECK ile zorlanıyordu) → firma başına
-- bir satır, PK=tenant_id. id kolonu (ve ona bağlı PK/CHECK kısıtları)
-- kaldırılıyor. Aşağıdaki DROP/ADD sırası her build'de güvenle tekrar
-- çalışacak şekilde tasarlandı (DROP CONSTRAINT IF EXISTS + duplicate_object
-- yakalayan DO bloğu) — dosyanın geri kalanındaki "drop then recreate"
-- index deseniyle aynı ruhta.
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS tenant_id INT REFERENCES tenants(id);
UPDATE app_settings SET tenant_id = 1 WHERE tenant_id IS NULL;
-- Yepyeni (boş) bir veritabanında yukarıdaki UPDATE'in geri dolduracağı
-- satır hiç yoktur (eski tekil-satır seed'i kaldırıldı, bkz. yukarıdaki not)
-- — bu yüzden firma 1 için satır burada, gerekirse, oluşturuluyor.
INSERT INTO app_settings (tenant_id)
  SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM app_settings WHERE tenant_id = 1);
ALTER TABLE app_settings DROP CONSTRAINT IF EXISTS app_settings_pkey;
ALTER TABLE app_settings ALTER COLUMN tenant_id SET NOT NULL;
DO $$ BEGIN
  ALTER TABLE app_settings ADD CONSTRAINT app_settings_pkey PRIMARY KEY (tenant_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
-- id kolonu düşünce ona bağlı eski CHECK (id = 1) kısıtı da otomatik kalkar.
ALTER TABLE app_settings DROP COLUMN IF EXISTS id;

-- "Tek ana admin" kısıtı global'den firma-bazlıya dönüşüyor: her firma kendi
-- ana admin'ine sahip olabilir. Bu index hiçbir route'ta ON CONFLICT hedefi
-- olarak kullanılmıyor (sadece sessiz bir bütünlük kısıtı) — o yüzden diğer
-- name-bazlı unique index'lerin aksine (bkz. plan Faz 3, onlar route
-- değişiklikleriyle birlikte gidecek) burada route değişikliği beklemeden
-- hemen dönüştürülebilir; provisionTenant() yeni bir firma için ikinci bir
-- ana admin oluşturabilsin diye bu, Faz 2'nin (tenant oluşturma) bir
-- ön koşuludur.
DROP INDEX IF EXISTS users_single_primary_admin;
CREATE UNIQUE INDEX IF NOT EXISTS users_single_primary_admin ON users(tenant_id) WHERE is_primary_admin = true;

-- ============================================================================
-- ÇOKLU FİRMA — Aşama 2: kalan global unique kısıtların firma-bazlıya
-- dönüşümü. Her biri, o kısıtı ON CONFLICT hedefi olarak kullanan route'ların
-- (bkz. ilgili dosyalar) AYNI commit'inde gidiyor — aksi halde eski
-- "ON CONFLICT (name)" gibi ifadeler artık var olmayan bir kısıtı hedefleyip
-- 500 hatası verirdi.

-- services: services/route.ts, services/[id]/route.ts
DROP INDEX IF EXISTS services_name_unique;
CREATE UNIQUE INDEX IF NOT EXISTS services_name_unique ON services(tenant_id, name);

-- suppliers: suppliers/route.ts, suppliers/[id]/route.ts, src/lib/directories.ts
ALTER TABLE suppliers DROP CONSTRAINT IF EXISTS suppliers_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS suppliers_tenant_name_unique ON suppliers(tenant_id, name);

-- customers: customers/route.ts, customers/[id]/route.ts, src/lib/directories.ts
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS customers_tenant_name_unique ON customers(tenant_id, name);

-- orders.import_ref: import_ref NULL olabilir (elle girilen siparişler) —
-- düz unique index NULL'ları birbirinden farklı sayar, eski davranışla aynı.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_import_ref_key;
CREATE UNIQUE INDEX IF NOT EXISTS orders_tenant_import_ref_unique ON orders(tenant_id, import_ref);

-- products: iki parti-benzersizliği index'i de tenant_id ile öne alınıyor.
DROP INDEX IF EXISTS products_code_batch_unique;
CREATE UNIQUE INDEX IF NOT EXISTS products_code_batch_unique ON products(tenant_id, code, production_year, production_week, COALESCE(supplier, '')) WHERE production_year IS NOT NULL;
DROP INDEX IF EXISTS products_code_nodate_unique;
CREATE UNIQUE INDEX IF NOT EXISTS products_code_nodate_unique ON products(tenant_id, code) WHERE production_year IS NULL;

-- storage: aktif depo no artık firma başına benzersiz.
DROP INDEX IF EXISTS storage_active_depo_no_unique;
CREATE UNIQUE INDEX IF NOT EXISTS storage_active_depo_no_unique ON storage(tenant_id, depo_no) WHERE teslim_edildi = false AND depo_no IS NOT NULL;

-- Performans: her sorgu artık tenant_id'yi eşitlikle filtreliyor (bkz. yukarısı)
-- ama en sık çalışan liste/rapor sorgularının WHERE'inde kullanılan mevcut
-- index'lerin hiçbiri tenant_id ile başlamıyordu — 100 firmalı bir kurulumda
-- bu, Seq Scan'e düşüyordu (EXPLAIN ile doğrulandı, bkz. proje planı/multi-tenant
-- performans incelemesi). tenant_id her zaman en solda: her sorgu onu eşitlikle
-- filtrelediğinden en seçici/en sık kullanılan öndeki sütun budur.
CREATE INDEX IF NOT EXISTS orders_tenant_created_at_idx ON orders(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS storage_tenant_created_at_idx ON storage(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS expenses_tenant_expense_date_idx ON expenses(tenant_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS products_tenant_code_idx ON products(tenant_id, code);
CREATE INDEX IF NOT EXISTS product_stock_entries_tenant_product_idx ON product_stock_entries(tenant_id, product_id);

-- ============================================================================
-- ÇOKLU FİRMA — Aşama 3: Online Randevu modülü.
--
-- Oturum açmamış bir müşterinin randevu sayfası (/randevu/<slug>) hangi
-- firmaya ait olduğunu bilmesi gerekiyor — ama mevcut kiracı çözümlemesi
-- (bkz. src/lib/auth.ts getAuthUserByToken) tamamen oturum açmış kullanıcının
-- users.tenant_id'sine dayanıyor, public bir sayfada bu yok. tenants.slug
-- kolonu bunun için zaten vardı ama hiçbir yerde doldurulmuyor/okunmuyordu
-- (her zaman NULL) — şimdi canlandırılıyor: mevcut firmalar isimlerinden
-- slugify edilip dolduruluyor, ileride NOT NULL zorunlu kılınıyor.
DO $$
DECLARE
  t RECORD;
  base_slug TEXT;
  candidate TEXT;
  suffix INT;
BEGIN
  FOR t IN SELECT id, name FROM tenants WHERE slug IS NULL LOOP
    base_slug := lower(translate(t.name, 'çğıöşüÇĞİÖŞÜ', 'cgiosuCGIOSU'));
    base_slug := regexp_replace(base_slug, '[^a-z0-9]+', '-', 'g');
    base_slug := trim(both '-' from base_slug);
    IF base_slug = '' THEN
      base_slug := 'firma-' || t.id;
    END IF;
    candidate := base_slug;
    suffix := 2;
    WHILE EXISTS (SELECT 1 FROM tenants WHERE slug = candidate AND id != t.id) LOOP
      candidate := base_slug || '-' || suffix;
      suffix := suffix + 1;
    END LOOP;
    UPDATE tenants SET slug = candidate WHERE id = t.id;
  END LOOP;
END $$;
ALTER TABLE tenants ALTER COLUMN slug SET NOT NULL;

-- Bir hizmetin online randevuya açık olup olmadığı ve tahmini süresi (kapasite
-- hesaplamasında slot uzunluğu için kullanılır) — bkz. app_settings.booking_*.
ALTER TABLE services ADD COLUMN IF NOT EXISTS bookable BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE services ADD COLUMN IF NOT EXISTS duration_minutes INT;

-- appointments.service_id'nin (order_services.product_id gibi) firma-güvenli
-- bir composite FK ile bağlanabilmesi için orders/products'takiyle aynı
-- desen: (id, tenant_id) üzerinde bir UNIQUE.
CREATE UNIQUE INDEX IF NOT EXISTS services_id_tenant_unique ON services(id, tenant_id);

-- Randevu ayarları firma başına (app_settings zaten tenant_id PK'lı tek
-- satır): kapasite (aynı anda kaç randevu kabul edilir), haftalık çalışma
-- saatleri şablonu, ve otomatik onay anahtarı. booking_auto_approve
-- varsayılan false — MVP'de onay hep personelde kalıyor (bkz. proje planı,
-- "Online Randevu Stratejisi"), ama alan şimdiden hazır: güven arttıkça
-- kod değişikliği gerekmeden açılabilir.
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS booking_capacity INT NOT NULL DEFAULT 1;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS booking_working_hours JSONB;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS booking_auto_approve BOOLEAN NOT NULL DEFAULT false;
-- Public randevu formundan en fazla kaç gün ileriye randevu alınabileceği
-- (bkz. src/lib/appointmentSlots.ts isWithinBookableWindow) — sınırsız
-- olursa bir bot IP/telefon limitlerini takvime yayılarak aşabilir, bu
-- yüzden makul bir üst sınır zorunlu; firma isterse Ayarlar'dan değiştirir.
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS booking_max_days_ahead INT NOT NULL DEFAULT 30;

CREATE TABLE IF NOT EXISTS appointments (
  id             SERIAL PRIMARY KEY,
  tenant_id      INT NOT NULL REFERENCES tenants(id),
  plate          VARCHAR(20) NOT NULL,
  -- Ad Soyad, Plaka, Telefon üçü de randevu formunda zorunlu (bkz.
  -- /randevu/[slug] ve /api/public/randevu/[slug]) — mevcut satırlar
  -- (varsa) boş string'e geri doldurulup ardından NOT NULL uygulanıyor.
  customer_name  VARCHAR(100),
  customer_phone VARCHAR(20) NOT NULL,
  service_id     INT REFERENCES services(id),
  requested_at   TIMESTAMPTZ NOT NULL,
  -- BEKLEMEDE: müşteri talep gönderdi, onay bekliyor (booking_auto_approve
  -- kapalıyken varsayılan). ONAYLANDI: personel onayladı VEYA
  -- booking_auto_approve açık. REDDEDILDI/IPTAL: personel/müşteri iptal etti.
  -- TAMAMLANDI: siparişe dönüştürüldü (bkz. order_id). GELMEDI: müşteri
  -- randevuya gelmedi (no-show, elle işaretlenir).
  status         VARCHAR(20) NOT NULL DEFAULT 'BEKLEMEDE'
                   CHECK (status IN ('BEKLEMEDE','ONAYLANDI','REDDEDILDI','TAMAMLANDI','IPTAL','GELMEDI')),
  order_id       INT REFERENCES orders(id),
  notes          TEXT,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
DO $$ BEGIN
  ALTER TABLE appointments ADD CONSTRAINT appointments_service_tenant_fk
    FOREIGN KEY (service_id, tenant_id) REFERENCES services(id, tenant_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE appointments ADD CONSTRAINT appointments_order_tenant_fk
    FOREIGN KEY (order_id, tenant_id) REFERENCES orders(id, tenant_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS appointments_tenant_status_idx ON appointments(tenant_id, status);
-- Slot müsaitlik hesaplaması (bkz. src/lib/appointmentSlots.ts) her zaman bir
-- gün + tenant için mevcut randevuları taradığından tenant_id + requested_at
-- en sık kullanılan filtre kombinasyonu.
CREATE INDEX IF NOT EXISTS appointments_tenant_requested_idx ON appointments(tenant_id, requested_at);
-- information_schema kontrolü olmadan bu UPDATE her `next build`/deploy'da
-- (migrate.mjs'in çalıştırdığı, tamamen idempotent olması gereken bu dosyada)
-- appointments tablosunun tam taramasına yol açardı — tenants.slug backfill'i
-- yukarıda (satır ~570) aynı sebeple WHERE slug IS NULL ile korunuyordu, kolon
-- zaten NOT NULL olduğunda bu artık hiçbir satıra dokunmadan no-op geçer.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'appointments' AND column_name = 'customer_name' AND is_nullable = 'YES'
  ) THEN
    UPDATE appointments SET customer_name = '' WHERE customer_name IS NULL;
    ALTER TABLE appointments ALTER COLUMN customer_name SET NOT NULL;
  END IF;
END $$;

-- Public randevu formu artık firmaların kendi sitelerine gömülebiliyor (bkz.
-- embed.js) — telefon-bazlı soğuma tek başına yetersiz (bot her seferinde
-- farklı bir telefon numarası üretebilir). IP bazlı hız sınırı için
-- (bkz. /api/public/randevu/[slug] POST) her randevuya isteğin geldiği IP
-- kaydediliyor.
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45);
CREATE INDEX IF NOT EXISTS appointments_tenant_ip_created_idx ON appointments(tenant_id, ip_address, created_at);
-- Aynı public POST route'undaki telefon-bazlı soğuma kontrolü (customer_phone
-- + created_at) IP kontrolüyle aynı desende ama karşılık gelen bir index'i
-- yoktu — tek tenant/düşük hacimde fark etmiyor ama en yoğun public rota
-- olduğundan tutarlılık için IP index'iyle aynı şekilde ekleniyor.
CREATE INDEX IF NOT EXISTS appointments_tenant_phone_created_idx ON appointments(tenant_id, customer_phone, created_at);
