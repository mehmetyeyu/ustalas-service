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

-- Üretim haftası/yılı girilmiş partiler firma+Kod+Hafta+Yıl+Tedarikçi ile; aynı
-- kod ve üretim haftası/yılına sahip parti farklı tedarikçilerden ayrı ayrı
-- stok girişi olarak eklenebilir (ör. 10/26 partisi 10 farklı tedarikçiden
-- gelebilir). Henüz üretim haftası/yılı girilmemiş "temel" satır (Excel'den
-- ilk gelen, tarihsiz) firma içinde tek başına Kod ile benzersizdir — İçe
-- aktarma bu temel satırı bulup günceller, partili satırlar elle eklenir.
--
-- Bu index'ler burada OLUŞTURULMAZ — tenant_id kolonu henüz yok (aşağıda,
-- multi-tenant dönüşüm bölümünde ekleniyor), asıl tanım orada
-- (products_code_batch_unique / products_code_nodate_unique, tenant_id
-- dahil). Eskiden burada tenant_id'siz (global) bir ara sürüm oluşturulup
-- aşağıda düzeltiliyordu — ama migration her deploy'da DROP+CREATE ile
-- yeniden çalıştığından, iki farklı firma aynı Kod'u kullandığında (ör.
-- Paylaşılan Stok demo verisi, DENEME-* kodları) bu ARA sürüm migration'ı
-- burada patlatıyor ve asıl (doğru) tanıma hiç ulaşılamıyordu. Sadece DROP
-- bırakılır ki eski bare index bir yerde kalmışsa temizlensin.
DROP INDEX IF EXISTS products_code_batch_unique;
DROP INDEX IF EXISTS products_code_nodate_unique;
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

-- (KALDIRILDI 2026-09-09) Burada multi-tenant öncesinden kalma bir varsayılan
-- "admin" kullanıcısı INSERT'i vardı (`ON CONFLICT DO NOTHING`, hedef kolon
-- belirtilmeden — herhangi bir unique/exclusion constraint ihlaliyle eşleşen
-- "bare" biçim). users.username üzerindeki GLOBAL unique constraint
-- (`users_username_key`) Firma Kodu eklenmesiyle `(tenant_id, username)`
-- composite'e dönüşünce, tenant_id'siz (NULL) bu satır artık HİÇBİR
-- constraint'e çarpmıyordu (composite unique'te NULL hiçbir şeye "eşit"
-- sayılmaz) — bu yüzden `ON CONFLICT DO NOTHING` her schema.sql çalışmasında
-- sessizce atlanmak yerine gerçekten INSERT denemeye başladı, ve
-- tenant_id NOT NULL constraint'ine çarpıp migration'ı kırdı. Services/suppliers
-- tablolarında daha önce yaşanan AYNI sınıf hataya bkz. (bu dosyanın "ÇOKLU
-- FİRMA" bloklarındaki not) — gerçek kullanıcılar artık yalnızca
-- provisionTenant()/create-tenant.mjs ile oluşturulduğundan bu legacy seed'e
-- hiç gerek yoktu, tamamen kaldırıldı.

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

-- Süper admin hesabının yaşadığı, hiçbir gerçek müşteriye ait olmayan
-- dahili "Platform" kaydını gerçek müşterilerden ayırt etmek için (bkz.
-- scripts/create-super-admin.mjs, src/app/api/super-admin/tenants/route.ts)
-- — süper admin panelindeki firma listesinden bu satır hariç tutulur.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS is_platform BOOLEAN NOT NULL DEFAULT false;

-- Kendi kendine kayıt formundan gelen iletişim bilgisi (bkz.
-- src/app/api/public/register/route.ts) — süper admin panelinde "hangi
-- müşteri ne zaman, hangi mail/telefonla kayıt oldu" sorusuna cevap vermek
-- için. Manuel oluşturulan eski firmalarda ve süper admin panelinden elle
-- eklenenlerde bilinmiyorsa NULL kalabilir.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS contact_name  VARCHAR(150);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS contact_email VARCHAR(150);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(30);
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
-- code kolonu (Firma Kodu, bkz. dosyanın sonundaki blok) BURADA, bootstrap
-- INSERT'inden ÖNCE eklenir — üç farklı DB durumunun HEPSİNDE aynı anda
-- doğru çalışması gerekiyor: (a) sıfırdan boş bir veritabanında bu ALTER
-- kolonu ilk kez ekler (nullable), (b) code'u daha önce hiç görmemiş eski
-- bir veritabanında (ör. Elevire, henüz bu migration'ı hiç almamış) da aynı
-- şekilde ilk kez ekler, (c) code'u zaten NOT NULL olarak uygulamış bir
-- veritabanında (ör. Ustalas prod, bu özelliğin ilk halinde) IF NOT EXISTS
-- sayesinde no-op'tur. Kolon HER ÜÇ durumda da bu noktadan itibaren var
-- olduğundan, aşağıdaki INSERT artık code'u güvenle referans alabilir.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS code VARCHAR(6);
-- slug ve code NOT NULL olabilir (code, (c) durumunda zaten NOT NULL'dır) —
-- Postgres, ON CONFLICT DO NOTHING'in çakışmayı tespit etmesinden ÖNCE
-- önerilen satırın NOT NULL kısıtlarını doğruluyor; ikisinden biri
-- verilmezse id=1 zaten var olsa bile bu INSERT her seferinde "null value"
-- hatasıyla patlardı (code eklendiğinde 2026-09-09'da tam olarak bu şekilde
-- fark edildi, iki kez: önce code hiç verilmeden, sonra code'un henüz
-- eklenmediği bir DB'de code verilerek — ikisi de farklı DB durumlarında
-- patlıyordu). code='000000' salt bir yer tutucu, (a) ve (b) durumlarında
-- dosyanın sonundaki backfill bloğu bunu hiç düzeltmez ('000000' aralık
-- dışı bırakıldığından hiçbir gerçek rastgele kodla çakışmaz) — istenirse
-- elle değiştirilebilir; (c) durumunda zaten hiç kullanılmaz (id=1 hep var,
-- ON CONFLICT devreye girer).
INSERT INTO tenants (id, name, slug, code) VALUES (1, 'Ustalas', 'ustalas', '000000') ON CONFLICT (id) DO NOTHING;
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
-- (ESKİ, artık geçersiz) users.username kasıtlı olarak GLOBAL unique
-- kalıyordu, girişte firma seçimi yoktu — bu karar 2026-09-09'da Firma Kodu
-- eklenmesiyle tersine çevrildi, bkz. dosyanın sonundaki
-- users_tenant_username_unique bloğu.
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
-- NOT: Bu iki index BURADA OLUŞTURULMAZ, sadece DROP edilir — asıl (location
-- dahil, en güncel) tanım aşağıda (bkz. "Ürün Kataloğu: aynı partinin..."
-- notu). Yukarıdaki (satır ~227) aynı sebeple: migration her deploy'da
-- DROP+CREATE ile yeniden çalıştığından, burada ARA bir sürüm (location'sız)
-- oluşturulursa ve iki farklı konumdaki aynı kod+tedarikçi+hafta/yılı
-- kombinasyonu artık meşru şekilde ayrı satırlar olarak var olduğunda (bkz.
-- Konum özelliği), bu ara sürüm migration'ı burada patlatır ve asıl (doğru,
-- location dahil) tanıma hiç ulaşılamaz — gerçekten yaşandı, bu yüzden
-- düzeltildi.
DROP INDEX IF EXISTS products_code_batch_unique;
DROP INDEX IF EXISTS products_code_nodate_unique;

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

-- Randevu formunun (src/app/randevu/[slug]) görsel stili — firma kendi
-- sitesine gömerken formun "yabancı bir widget" değil, sitenin doğal bir
-- parçası gibi görünmesini istiyor. preset yapısal görünümü belirler,
-- accent_color vurgu rengini (buton, seçili saat, odak halkası) markaya
-- yaklaştırır. Varsayılanlar bugünkü sabit görünümle birebir aynı (card =
-- mevcut beyaz kart, #2563eb = mevcut blue-600, NULL başlık/açıklama =
-- mevcut sabit metinler) — mevcut kiracılarda görsel fark yaratmaz,
-- backfill gerekmiyor.
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS booking_widget_preset VARCHAR(20) NOT NULL DEFAULT 'card';
DO $$ BEGIN
  ALTER TABLE app_settings ADD CONSTRAINT app_settings_booking_widget_preset_check
    CHECK (booking_widget_preset IN ('card','seamless','outlined'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS booking_widget_accent_color VARCHAR(7) NOT NULL DEFAULT '#2563eb';
-- İlk sürümde her katman için ikili bir "layout" (single/wide) alanı vardı.
-- Kullanıcı bunun yerine gerçek bir kolon SAYISI istedi — mobil her zaman
-- tek kolon (form zaten en dar cihazda tek sütuna sığacak kadar sade),
-- tablet 1-2 kolon arasında, masaüstü 1-3 kolon arasında seçilebilsin (bkz.
-- Hizmet/Tarih/Müsait Saatler artık üç bağımsız grid öğesi,
-- src/app/randevu/[slug]/page.tsx). Hiç yayınlanmamış (henüz commit'lenmemiş)
-- alanlar olduğundan düz bir DROP+yeni kolonla değiştiriliyor, ayrı bir
-- geri-dolum migration'ına gerek yok.
ALTER TABLE app_settings DROP COLUMN IF EXISTS booking_widget_layout_mobile;
ALTER TABLE app_settings DROP COLUMN IF EXISTS booking_widget_layout_tablet;
ALTER TABLE app_settings DROP COLUMN IF EXISTS booking_widget_layout_desktop;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS booking_widget_columns_tablet SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS booking_widget_columns_desktop SMALLINT NOT NULL DEFAULT 1;
DO $$ BEGIN
  ALTER TABLE app_settings ADD CONSTRAINT app_settings_booking_widget_columns_tablet_check
    CHECK (booking_widget_columns_tablet IN (1,2));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE app_settings ADD CONSTRAINT app_settings_booking_widget_columns_desktop_check
    CHECK (booking_widget_columns_desktop IN (1,2,3));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS booking_widget_title VARCHAR(120);
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS booking_widget_description VARCHAR(300);
-- Gömülü (?embed=1) modda başlık/açıklama bugün hiç gösterilmiyor (firmanın
-- kendi sitesi zaten bir bağlam sağladığı varsayılıyor) — bu varsayılan
-- korunuyor, isteyen firma açabilir.
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS booking_widget_show_heading_embed BOOLEAN NOT NULL DEFAULT false;
-- Üç ek stil boyutu (2026-08-26 stil araştırmasının sonucu) — varsayılanlar
-- yine bugünkü sabit görünümle birebir aynı (lg = mevcut rounded-xl/rounded-lg
-- karışımı, normal = mevcut p-5/gap-4/px-3 py-2, md = mevcut text-xl/text-sm
-- başlık/açıklama) — mevcut kiracılarda görsel fark yaratmaz.
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS booking_widget_radius VARCHAR(10) NOT NULL DEFAULT 'lg';
DO $$ BEGIN
  ALTER TABLE app_settings ADD CONSTRAINT app_settings_booking_widget_radius_check
    CHECK (booking_widget_radius IN ('sharp','md','lg','pill'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS booking_widget_density VARCHAR(12) NOT NULL DEFAULT 'normal';
DO $$ BEGIN
  ALTER TABLE app_settings ADD CONSTRAINT app_settings_booking_widget_density_check
    CHECK (booking_widget_density IN ('compact','normal','comfortable'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS booking_widget_heading_size VARCHAR(6) NOT NULL DEFAULT 'md';
DO $$ BEGIN
  ALTER TABLE app_settings ADD CONSTRAINT app_settings_booking_widget_heading_size_check
    CHECK (booking_widget_heading_size IN ('sm','md','lg'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Sipariş oluşturma/düzenleme/içe aktarma ve randevu→sipariş dönüşümü, sipariş
-- üzerindeki müşteri adını (varsa telefonuyla) otomatik olarak Müşteriler
-- listesine kaydediyordu — bazı firmalar bunu istemiyor (ör. tek seferlik/
-- mail-order müşterileri listede görmek istemiyor). Varsayılan TRUE — mevcut
-- davranışla birebir aynı, mevcut kiracılarda fark yaratmaz.
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS auto_register_customers BOOLEAN NOT NULL DEFAULT true;

-- Tarayıcı push bildirimleri (yeni randevu geldiğinde, panel sekmesi kapalı/
-- arka plandayken bile) — bkz. src/lib/push.ts. Tenant-safe composite FK için
-- services_id_tenant_unique/orders_id_tenant_unique ile aynı desen; users
-- tablosunda bu henüz yoktu.
CREATE UNIQUE INDEX IF NOT EXISTS users_id_tenant_unique ON users(id, tenant_id);

-- Bir kullanıcı birden fazla tarayıcı/cihazda abone olabilir (her biri ayrı
-- satır) — endpoint tarayıcının push servisinin ürettiği benzersiz URL,
-- global olarak tekil. p256dh/auth, web-push'un şifreleme için ihtiyaç
-- duyduğu abonelik anahtarları (PushSubscription.toJSON().keys).
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id           SERIAL PRIMARY KEY,
  tenant_id    INT NOT NULL REFERENCES tenants(id),
  user_id      INT NOT NULL REFERENCES users(id),
  endpoint     TEXT NOT NULL,
  p256dh       TEXT NOT NULL,
  auth         TEXT NOT NULL,
  user_agent   VARCHAR(255),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_unique ON push_subscriptions(endpoint);
CREATE INDEX IF NOT EXISTS push_subscriptions_tenant_idx ON push_subscriptions(tenant_id);
DO $$ BEGIN
  ALTER TABLE push_subscriptions ADD CONSTRAINT push_subscriptions_user_tenant_fk
    FOREIGN KEY (user_id, tenant_id) REFERENCES users(id, tenant_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Randevu ONAYLANDI olduğunda müşteriye WhatsApp bildirimi (bkz. src/lib/whatsapp.ts)
-- — her firma KENDİ Meta WhatsApp Business hesabını (kendi telefon numarası,
-- kendi doğrulanmış işletme adı) bağlar; tek bir paylaşımlı hesap/ortam
-- değişkeni DEĞİL — aksi halde tüm firmaların mesajları aynı isimden giderdi.
-- access_token DB'de düz metin olarak tutuluyor (bu tabloda şu an başka bir
-- şifreleme katmanı yok, JWT_SECRET gibi diğer sırlar da .env'de düz metin) —
-- ileride bir kasa/şifreleme katmanı eklenirse buraya da uygulanmalı.
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS whatsapp_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS whatsapp_access_token TEXT;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS whatsapp_phone_number_id VARCHAR(50);
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS whatsapp_business_account_id VARCHAR(50);
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS whatsapp_template_name VARCHAR(100);

-- Tenant başına saatlik gönderim sayacı (bkz. src/lib/whatsapp.ts) — personelin
-- telefonla gelen talebi elle girdiği POST /api/appointments hiçbir hız
-- sınırına tabi değil (public randevu formunun aksine, appointments.create
-- izni olan herhangi bir personel çağırabilir) ve her çağrı doğrudan
-- ONAYLANDI ile açılıp gerçek/ücretli bir WhatsApp mesajı tetikliyor —
-- kötüye kullanımda (art arda sahte randevu girme) tenant'ın Meta faturasını
-- şişirmemesi için burada ayrı bir kayıt tutuluyor, sadece BAŞARILI
-- gönderimler (Meta 2xx döndüğünde) satır ekliyor.
CREATE TABLE IF NOT EXISTS whatsapp_message_log (
  id        SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id),
  sent_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS whatsapp_message_log_tenant_sent_idx ON whatsapp_message_log(tenant_id, sent_at);

-- Sipariş Listesi sayfası açıldığında hangi tarih filtresinin varsayılan
-- olarak uygulanacağı (Genel Ayarlar'dan seçilir) — '' Tümü demektir, "ozel"
-- (Özel Aralık) burada seçilemez çünkü kalıcı bir varsayılan olarak anlamsız.
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS orders_default_date_filter VARCHAR(10) NOT NULL DEFAULT '';
DO $$ BEGIN
  ALTER TABLE app_settings ADD CONSTRAINT app_settings_orders_default_date_filter_check
    CHECK (orders_default_date_filter IN ('','bugun','bu_hafta','bu_ay'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Girişe "Firma Kodu" ekleniyor (bkz. src/app/api/auth/login/route.ts) —
-- Natro vb. hosting panellerindeki "hesap kodu" mantığı: kısa, akılda kalıcı,
-- rastgele 6 haneli sayısal kod. tenants.slug BUNUN İÇİN KULLANILMIYOR —
-- ayrı bir kavram (public /randevu/<slug> URL'i, "Yeniden Oluştur" ile
-- rastgele değişebilir, kullanıcı dostu/hatırlanabilir olması gerekmiyor).
-- Bu, users.username'in artık TENANT BAZINDA benzersiz olabilmesinin ön
-- koşulu — global benzersizlik, iki firmanın aynı kullanıcı adını (ör.
-- "admin") kullanamamasına yol açıyordu (~100 firma hedefiyle operasyonel
-- bir kısıt haline geldi). `code` kolonunun kendisini ekleyen ALTER TABLE
-- ADD COLUMN ARTIK BURADA DEĞİL — tenants bootstrap satırının (yukarıda,
-- CREATE TABLE tenants'ın hemen ardından, id=1 INSERT'inden önce) bu kolonu
-- güvenle referans alabilmesi için oraya taşındı, bkz. oradaki not.
DO $$
DECLARE
  t RECORD;
  candidate TEXT;
BEGIN
  FOR t IN SELECT id FROM tenants WHERE code IS NULL LOOP
    LOOP
      candidate := (100000 + floor(random() * 900000))::INT::TEXT;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM tenants WHERE code = candidate);
    END LOOP;
    UPDATE tenants SET code = candidate WHERE id = t.id;
  END LOOP;
END $$;
ALTER TABLE tenants ALTER COLUMN code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tenants_code_unique ON tenants(code);
DO $$ BEGIN
  ALTER TABLE tenants ADD CONSTRAINT tenants_code_format_check CHECK (code ~ '^[0-9]{6}$');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- users.username artık GLOBAL değil, TENANT BAZINDA benzersiz — yukarıdaki
-- Firma Kodu sayesinde login artık hangi firma olduğunu bilerek arama yapıyor.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_key;
ALTER TABLE users ALTER COLUMN tenant_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_tenant_username_unique ON users(tenant_id, username);

-- Cari Bakiye / Tahsilat Takibi (FB Lastik geri bildirimi + piyasa araştırması:
-- Paraşüt/Mikro/Logo — KOBİ ölçeğinde tahsilat belirli bir faturaya bağlanmaz,
-- müşterinin GENEL bakiyesine karşı bağımsız bir fiş olarak düşer, bakiye her
-- zaman hareketlerin CANLI toplamıdır, cache kolonu yok).
--
-- entry_type='SIPARIS': bir siparişin Cari'ye düşen kısmı — src/lib/customerLedger.ts
--   syncOrderLedger() tarafından TAMAMEN otomatik yönetilir (elle eklenip
--   silinmez), her zaman direction=1 (borç). order_id dolu.
-- entry_type='MANUEL': "Tahsilat Al" (direction=-1, gerçek nakit/POS/havale
--   girişi — payment_type ZORUNLU, Kasa raporuna yansır) veya "Borç Ekle"
--   (direction=1, salt bakiye düzeltmesi/açılış bakiyesi — payment_type NULL).
--   order_id NULL (bağımsız fiş). Ayrı bir "ACILIS" tipi yok — açılış bakiyesi
--   de MANUEL+direction=1'dir, tek esnek "Tahsilat Al / Borç Ekle" modalıyla
--   hem tahsilat hem açılış/düzeltme ihtiyacı tek UI'dan karşılanır.
CREATE TABLE IF NOT EXISTS customer_ledger_entries (
  id           SERIAL PRIMARY KEY,
  tenant_id    INT NOT NULL REFERENCES tenants(id),
  customer_id  INT NOT NULL REFERENCES customers(id),
  order_id     INT REFERENCES orders(id) ON DELETE CASCADE,
  entry_type   VARCHAR(10) NOT NULL CHECK (entry_type IN ('SIPARIS', 'MANUEL')),
  direction    SMALLINT NOT NULL CHECK (direction IN (1, -1)),
  amount       DECIMAL(10,2) NOT NULL CHECK (amount > 0),
  payment_type TEXT,
  entry_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  note         TEXT,
  created_by   INT REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (entry_type <> 'SIPARIS' OR direction = 1)
);

-- customers, composite FK ile referans alınabilsin diye (id, tenant_id) üzerinde
-- de bir UNIQUE'e ihtiyaç duyar — orders_id_tenant_unique ile aynı desen.
CREATE UNIQUE INDEX IF NOT EXISTS customers_id_tenant_unique ON customers(id, tenant_id);

DO $$ BEGIN
  ALTER TABLE customer_ledger_entries ADD CONSTRAINT customer_ledger_entries_customer_tenant_fk
    FOREIGN KEY (customer_id, tenant_id) REFERENCES customers(id, tenant_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE customer_ledger_entries ADD CONSTRAINT customer_ledger_entries_order_tenant_fk
    FOREIGN KEY (order_id, tenant_id) REFERENCES orders(id, tenant_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Her sipariş için en fazla bir SIPARIS satırı olabilir — syncOrderLedger()
-- zaten "sil + yeniden ekle" ile bunu garanti eder, bu ikinci bir savunma katmanı.
CREATE UNIQUE INDEX IF NOT EXISTS customer_ledger_entries_order_siparis_unique
  ON customer_ledger_entries(order_id) WHERE entry_type = 'SIPARIS';

CREATE INDEX IF NOT EXISTS customer_ledger_entries_customer_idx
  ON customer_ledger_entries(tenant_id, customer_id, entry_date, id);

-- Kasa (Fiziksel Nakit Kasa) — Serbest Manuel Hareketler ("Yavuz Abiye
-- Gönderildi", "Çalışana Ödeme" gibi hiçbir siparişe/masrafa bağlı olmayan
-- nakit giriş-çıkışları). Kasa'nın OTOMATİK türeyen tarafı (nakit sipariş
-- tahsilatı, nakit masraf, Cari'den nakit tahsilat) zaten kendi kaynak
-- tablolarında tam olarak var — customer_ledger_entries'in aksine burada
-- YENİ bir sync mekanizmasına gerek yok, sadece bu tablo + CRUD, hem
-- /api/kasa GET'inde hem reports/route.ts'teki Kasa (Nakit) agregatında
-- diğer kaynaklarla UNION ALL edilir. Bakiye canlı hesaplanır, cache
-- kolonu yok (customer_ledger_entries ile aynı desen).
CREATE TABLE IF NOT EXISTS cash_ledger_entries (
  id           SERIAL PRIMARY KEY,
  tenant_id    INT NOT NULL REFERENCES tenants(id),
  direction    SMALLINT NOT NULL CHECK (direction IN (1, -1)),
  amount       DECIMAL(10,2) NOT NULL CHECK (amount > 0),
  entry_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  description  TEXT,
  created_by   INT REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cash_ledger_entries_tenant_idx
  ON cash_ledger_entries(tenant_id, entry_date, id);

-- Kasalar (fiziksel nakit kasa dizini) — suppliers'daki gibi serbest metin
-- upsert değil, gerçek FK'li bir seçim listesi (bkz. aşağıdaki composite
-- FK'lar). kasa_id HER YERDE nullable: hiç kasa tanımlamamış firmalar için
-- davranış birebir eskisiyle aynı kalır (bkz. src/app/api/kasa/route.ts).
CREATE TABLE IF NOT EXISTS kasalar (
  id         SERIAL PRIMARY KEY,
  tenant_id  INT NOT NULL REFERENCES tenants(id),
  name       VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS kasalar_tenant_name_unique ON kasalar(tenant_id, name);
CREATE UNIQUE INDEX IF NOT EXISTS kasalar_id_tenant_unique ON kasalar(id, tenant_id);

-- Bir kasa TL dışında bir para birimi tutabilir (ör. "Dolar Kasa", "Euro
-- Kasa") — varsayılan TL, mevcut tüm kasalar geriye dönük TL sayılır,
-- davranış değişmez (bkz. src/app/api/kasa/route.ts: try_amount mantığı).
ALTER TABLE kasalar ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'TRY';

-- Tenant başına, para birimi başına GÜNCEL kur (TL karşılığı) — geçmiş
-- işlemleri yeniden hesaplamaz, sadece "şu an bu kasada duran döviz kaç TL
-- eder" sorusuna cevap verir (canlı gösterim, muhasebe geçmişi değil).
-- Kullanıcı Kasaları Yönet'ten ne zaman isterse günceller, dış bir kur
-- API'sinden otomatik çekilmez.
CREATE TABLE IF NOT EXISTS currency_rates (
  tenant_id   INT NOT NULL REFERENCES tenants(id),
  currency    VARCHAR(3) NOT NULL,
  rate_to_try DECIMAL(14,4) NOT NULL,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, currency)
);

-- Bir kasa, "Nazım Hesap" gibi Nakit-dışı bir ödeme tipine bağlanabilir (bkz.
-- src/lib/kasalar.ts: resolveKasaId) — o ödeme tipiyle yapılan işlemler
-- otomatik olarak bu kasaya sayılır, ayrı bir kasa seçimi gerekmez. Bir ödeme
-- tipi aynı anda en fazla bir kasaya bağlı olabilir (tenant başına).
ALTER TABLE kasalar ADD COLUMN IF NOT EXISTS linked_payment_type VARCHAR(100);
CREATE UNIQUE INDEX IF NOT EXISTS kasalar_tenant_linked_payment_type_unique
  ON kasalar(tenant_id, linked_payment_type) WHERE linked_payment_type IS NOT NULL;

ALTER TABLE order_payments          ADD COLUMN IF NOT EXISTS kasa_id INT;
ALTER TABLE order_services          ADD COLUMN IF NOT EXISTS kasa_id INT;
ALTER TABLE expenses                ADD COLUMN IF NOT EXISTS kasa_id INT;
ALTER TABLE recurring_expenses      ADD COLUMN IF NOT EXISTS kasa_id INT;
ALTER TABLE customer_ledger_entries ADD COLUMN IF NOT EXISTS kasa_id INT;
ALTER TABLE cash_ledger_entries     ADD COLUMN IF NOT EXISTS kasa_id INT;

-- Kasalar Arası Transfer — bir transferin iki bacağını (kaynak kasadan -1,
-- hedef kasaya +1) birbirine bağlar. Kendi kendine referans veren nullable
-- bir FK: her iki satır da diğerinin id'sini taşır. NULL ise normal
-- (transfer olmayan) bir manuel harekettir (bkz. src/app/api/kasa/transfers/route.ts).
ALTER TABLE cash_ledger_entries ADD COLUMN IF NOT EXISTS transfer_pair_id INT;

-- Composite (kasa_id, tenant_id) FK — yanlış firmanın kasasına referans DB
-- seviyesinde imkansız; kasa_id NULL olan satırlarda standart FK NULL
-- semantiğiyle otomatik atlanır. ON DELETE belirtilmez (RESTRICT/NO ACTION,
-- varsayılan) — bir kasaya bağlı hareket varsa silme reddedilsin diye.
DO $$ BEGIN
  ALTER TABLE order_payments ADD CONSTRAINT order_payments_kasa_tenant_fk
    FOREIGN KEY (kasa_id, tenant_id) REFERENCES kasalar(id, tenant_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE order_services ADD CONSTRAINT order_services_kasa_tenant_fk
    FOREIGN KEY (kasa_id, tenant_id) REFERENCES kasalar(id, tenant_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE expenses ADD CONSTRAINT expenses_kasa_tenant_fk
    FOREIGN KEY (kasa_id, tenant_id) REFERENCES kasalar(id, tenant_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE recurring_expenses ADD CONSTRAINT recurring_expenses_kasa_tenant_fk
    FOREIGN KEY (kasa_id, tenant_id) REFERENCES kasalar(id, tenant_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE customer_ledger_entries ADD CONSTRAINT customer_ledger_entries_kasa_tenant_fk
    FOREIGN KEY (kasa_id, tenant_id) REFERENCES kasalar(id, tenant_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE cash_ledger_entries ADD CONSTRAINT cash_ledger_entries_kasa_tenant_fk
    FOREIGN KEY (kasa_id, tenant_id) REFERENCES kasalar(id, tenant_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE cash_ledger_entries ADD CONSTRAINT cash_ledger_entries_transfer_pair_fk
    FOREIGN KEY (transfer_pair_id) REFERENCES cash_ledger_entries(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS order_payments_kasa_idx ON order_payments(kasa_id);
CREATE INDEX IF NOT EXISTS order_services_kasa_idx ON order_services(kasa_id);
CREATE INDEX IF NOT EXISTS expenses_kasa_idx ON expenses(kasa_id);
CREATE INDEX IF NOT EXISTS customer_ledger_entries_kasa_idx ON customer_ledger_entries(kasa_id);
CREATE INDEX IF NOT EXISTS cash_ledger_entries_kasa_idx ON cash_ledger_entries(kasa_id);

-- Paylaşılan Stok: karşılıklı opt-in ile diğer aktif firmaların stok
-- özetini (marka/ebat/sezon bazında, fiyat/tedarikçi/kod HARİÇ)
-- görüntüleme. Tek yönlü değil — bkz. /api/shared-stock.
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS shared_stock_enabled BOOLEAN NOT NULL DEFAULT false;

-- iyzico Abonelik (SaaS faturalandırma) — tenants.plan/billing_provider/
-- billing_customer_id/billing_status/trial_ends_at daha önce (multi-tenant
-- dönüşümünde) ayrılmış ama hiç kullanılmamıştı, bkz. plan
-- (~/.claude/plans/golden-jingling-spindle.md). billing_subscription_ref,
-- iyzico'daki subscriptionReferenceCode'u tutar — retry/cancel/upgrade
-- çağrıları bu referansla yapılır.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS billing_subscription_ref VARCHAR(100);

-- Geriye dönük: bu kolonlar eklenmeden önce var olan TÜM firmalar (Ustalas,
-- FB Lastik, Süper Admin panelinden elle eklenenler, ...) muaf sayılır —
-- hiçbiri iyzico'ya hiç girmez, Aktif/Pasif kontrolü hep Süper Admin'de
-- kalır. Yalnızca bundan sonra /api/public/register ile kendi kendine
-- kayıt olanlar provisionTenant()'ta açıkça 'trialing' başlar.
UPDATE tenants SET billing_status = 'exempt' WHERE billing_status IS NULL;

-- İptal, ödenmiş dönemin sonuna kadar erişimi KESMEZ (Netflix vb. SaaS
-- standardı) — /api/billing/cancel iyzico'da aboneliği hemen iptal eder
-- (bir daha tahsilat yapılmaz) ama billing_status='active' kalır,
-- billing_cancel_at_period_end=true olur; isBillingLocked (bkz.
-- src/lib/billing.ts) yalnızca billing_period_ends_at geçince kilitler.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS billing_period_ends_at TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS billing_cancel_at_period_end BOOLEAN NOT NULL DEFAULT false;

-- Eşzamanlı checkout kilidi: initializeCheckoutForm HER çağrıldığında
-- iyzico'da yeni bir müşteri + abonelik açar, var olan bir aboneliği hiç
-- kontrol etmez. billing_status yalnızca callback tamamlanınca 'active'
-- olduğundan, checkout başlatılıp callback tamamlanana kadarki pencerede
-- (kullanıcı kart bilgilerini girerken) aynı tenant için ikinci bir
-- checkout/switch-plan çağrısı (çift tıklama, iki sekme, hem Aylık hem
-- Yıllık'ı ayrı ayrı denemek) hiçbir şey tarafından engellenmiyordu — gerçek
-- bir sandbox denemesinde bu yüzden 3 fazla aktif (ve otomatik yenilenen)
-- abonelik oluştu, elle iptal edilmek zorunda kalındı. checkout/switch-plan
-- artık tek bir atomik UPDATE...RETURNING ile bu sütunu claim ediyor; 15
-- dakikalık TTL, bir çağrı hiç tamamlanmadan (ör. sunucu hatası) kilidi
-- sonsuza kadar tutmasını önler.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS billing_checkout_lock_at TIMESTAMPTZ;

-- Fiyatlandırma artık USD/TCMB kuru değil, süper adminin platform_pricing'te
-- belirlediği SABİT TL fiyatı (bkz. platform_pricing tablosu ve
-- src/lib/platformPricing.ts) — kullanıcıları dolar kuruyla korkutmamak
-- için bilinçli karar. Mesafeli Satış Sözleşmesi'ndeki dönemsel güncelleme
-- maddesine dayanarak, her tenant'ın YENİLEME tarihinden 3 gün önce
-- platform_pricing'teki GÜNCEL plan hâlâ tenant'ınkinden farklıysa (yani
-- süper admin fiyatı gerçekten değiştirmişse) /upgrade
-- (upgradePeriod=NEXT_PERIOD, kart bilgisi istenmeden) ile mevcut döneme
-- dokunmadan bir SONRAKİ tahsilata uygulanır (bkz. scripts/
-- reprice-subscriptions cron'u). billing_pricing_plan_ref, tenant'ın o an
-- bağlı olduğu iyzico fiyat planının referans kodu — checkout/callback
-- tarafından yazılır, cron bunu platform_pricing'in güncel referansıyla
-- karşılaştırıp "hâlâ eski plan mı" kontrolü için okur; fiyat
-- değişmediğinde referans da aynı kaldığından bu karşılaştırma tek başına
-- idempotent'tir — ayrı bir "zaten repriced edildi mi" bayrağına gerek
-- kalmaz (eskiden billing_repriced_for_period_end vardı, bu yüzden
-- kaldırıldı).
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS billing_pricing_plan_ref VARCHAR(100);
ALTER TABLE tenants DROP COLUMN IF EXISTS billing_repriced_for_period_end;

-- Platform genelinde tek bir SABİT TL fiyatı — tenant'a özgü değil (bkz.
-- tenants.billing_pricing_plan_ref yukarısı), tek satırlık singleton
-- (id=1 CHECK'i ile garanti edilir). Süper admin panelden fiyat
-- güncellediğinde (bkz. src/lib/platformPricing.ts updatePlatformPricing)
-- *_price burada değişir ve aynı anda YENİ bir iyzico fiyat planı
-- oluşturulup *_pricing_plan_ref buraya yazılır (iyzico'da plan fiyatı
-- yerinde değiştirilemez, her zaman yeni plan — bkz. iyzico-setup.mjs
-- notu); checkout/switch-plan/cron hepsi bu satırı okuyup güncel referansı
-- kullanır (src/lib/platformPricing.ts ensurePricingPlanRef). Yeni
-- kurulumda 1500/12000 ile tohumlanır, referanslar NULL kalır —
-- ensurePricingPlanRef ilk çağrıldığında (ilk checkout/cron çalışması)
-- kendiliğinden plan oluşturup dolduracağından süper adminin sisteme
-- çalışmadan önce elle bir kere kaydetmesi gerekmez (self-healing).
CREATE TABLE IF NOT EXISTS platform_pricing (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  monthly_price DECIMAL(10,2) NOT NULL,
  yearly_price DECIMAL(10,2) NOT NULL,
  monthly_pricing_plan_ref VARCHAR(100),
  yearly_pricing_plan_ref VARCHAR(100),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO platform_pricing (id, monthly_price, yearly_price)
VALUES (1, 1500, 12000)
ON CONFLICT (id) DO NOTHING;

-- subscription.order.failure webhook'unun kendisi BAŞARISIZLIK SEBEBİNİ hiç
-- içermiyor (docs.iyzico.com/ek-bilgiler/hata-kodlari ile birlikte resmi
-- webhook payload dokümanından doğrulandı) — ama GET /v2/subscription/
-- subscriptions/{ref} yanıtındaki ilgili order'ın paymentAttempts'inde
-- FAILED denemeler için errorCode/errorMessage AYRICA mevcut (errorMessage
-- zaten Türkçe, ör. "Kart limiti yetersiz, yetersiz bakiye" — kendi
-- kod->mesaj çeviri tablomuzu tutmaya gerek yok). billing_last_payment_error,
-- webhook bu ek sorguyla çektiği mesajı /admin/billing'de gösterebilmek
-- için saklar; bir sonraki başarılı ödemede temizlenir (bkz. webhook
-- route'u).
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS billing_last_payment_error TEXT;

-- Hukuki kanıt amaçlı — sadece bir checkbox'ı zorunlu kılmak yeterli değil,
-- "ne zaman kabul edildiği" kayıt altına alınmalı (bkz. plan, Mesafeli
-- Satış Sözleşmesi'ndeki cayma hakkı feragati ve KVKK aydınlatma
-- yükümlülüğü). privacy_policy_accepted_at: /kayit'ta kayıt anında.
-- terms_accepted_at: /admin/billing'de ilk gerçek ödeme (checkout)
-- başlatılırken — bkz. src/app/api/billing/checkout/route.ts.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS privacy_policy_accepted_at TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;

-- Webhook idempotency — iyzico (çoğu webhook sağlayıcısı gibi) aynı
-- olayı zaman aşımı/ağ hatasında birden fazla kez tekrar gönderebilir.
-- order_reference_code PRIMARY KEY olduğundan aynı fatura/tahsilat olayı
-- ikinci kez geldiğinde INSERT ON CONFLICT DO NOTHING ile sessizce
-- atlanır — bkz. src/app/api/webhooks/iyzico/route.ts (gerçek bir
-- denetimde bulunan, dönem sonunu tekrar tekrar uzatabilecek bir açık).
CREATE TABLE IF NOT EXISTS iyzico_webhook_events (
  order_reference_code VARCHAR(100) PRIMARY KEY,
  event_type VARCHAR(50) NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Gerçek bir sandbox denemesinde saptandı: /v2/subscription/checkoutform/
-- {token} yanıtı conversationId'yi HİÇ döndürmüyor (dokümante edilmemiş,
-- varsayım yanlış çıktı) — yani /api/billing/callback, checkout
-- başlatılırken gönderdiğimiz conversationId (=tenant id) üzerinden
-- tenant'ı bulamıyordu. Bunun yerine token, checkout/switch-plan
-- başlatılırken burada tenant_id ile eşleştirilip saklanır; callback
-- token'dan tenant'ı buradan bulur — iyzico'nun yanıtına hiç bağımlı değil.
CREATE TABLE IF NOT EXISTS iyzico_checkout_sessions (
  token      VARCHAR(100) PRIMARY KEY,
  tenant_id  INT NOT NULL REFERENCES tenants(id),
  plan       VARCHAR(20),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- IFN (Instant Fraud Notification, bkz. src/app/api/webhooks/iyzico-fraud/
-- [secret]/route.ts) bildirimi SADECE {paymentId, fraudStatus} taşıyor —
-- hangi tenant'a ait olduğunu bulabilmemiz için PAYMENT ID → tenant
-- eşlemesini KENDİMİZ tutmamız gerekiyor (GET /payment/detail paymentId
-- ile sorgulanınca orijinal conversationId'yi GERİ VERMİYOR, sadece bizim
-- o anki istekte gönderdiğimiz conversationId'yi yankılıyor — gerçek bir
-- sandbox çağrısıyla doğrulandı, bu yüzden ayrı bir tabloya ihtiyaç var).
-- Her başarılı tahsilatta (ilk ödeme: bkz. /api/billing/callback, yenileme:
-- bkz. /api/webhooks/iyzico) GET /v2/subscription/subscriptions/{ref}
-- yanıtındaki ilgili order'ın paymentAttempts'inden paymentId çekilip
-- buraya yazılır (best-effort — başarısız olursa ana akışı bloklamaz).
CREATE TABLE IF NOT EXISTS iyzico_payments (
  payment_id VARCHAR(50) PRIMARY KEY,
  tenant_id  INT NOT NULL REFERENCES tenants(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Faturalandırma olay günlüğü — Süper Admin'de görünürlük için (bkz.
-- src/app/super-admin/page.tsx). Öncesinde webhook/IFN/repricing olayları
-- sadece console.warn/error ile Vercel sunucu loglarına düşüyordu, panelde
-- hiç görünmüyordu. tenant_id NULL olabilir (ör. IFN bildirimi bilinmeyen
-- bir paymentId taşıyorsa, hiçbir tenant'a eşlenemez).
CREATE TABLE IF NOT EXISTS billing_events (
  id         SERIAL PRIMARY KEY,
  tenant_id  INT REFERENCES tenants(id),
  event_type VARCHAR(50) NOT NULL,
  detail     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_billing_events_created_at ON billing_events(created_at DESC);

-- Fatura bilgileri — VUK md. 231/5 gereği ilk tahsilattan itibaren 7 gün
-- içinde e-Fatura/e-Arşiv kesme zorunluluğu var (bkz. görüşme notları,
-- İşNet Nettefatura entegrasyonu planı) ama bunun için gereken hiçbir alan
-- daha önce toplanmıyordu — checkout'a giden adres bile gerçek değildi
-- (bkz. src/lib/iyzico.ts buildCustomerFromTenant, sabit "İstanbul,
-- Türkiye" placeholder'ı SADECE iyzico'nun kendi zorunlu alanı içindi,
-- fatura için kullanılamaz). billing_entity_type ('individual'|'company')
-- hangi kimlik alanının isteneceğini belirler: bireyselde billing_tax_id
-- TCKN (11 hane), şirkette VKN (10 hane) + billing_tax_office zorunlu.
-- billing_invoice_title, faturadaki resmi unvan/ad soyad — tenants.name
-- (görünen firma adı) ile AYNI olmak zorunda değil. Alıcının e-Fatura
-- mükellefi olup olmadığı burada AYRICA tutulmaz — VKN ile mükellefiyet
-- sorgulama API'siyle fatura kesilirken anlık öğrenilir.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS billing_entity_type VARCHAR(20);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS billing_tax_id VARCHAR(11);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS billing_tax_office VARCHAR(100);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS billing_invoice_title VARCHAR(200);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS billing_city VARCHAR(100);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS billing_district VARCHAR(100);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS billing_address TEXT;

-- Sipariş listesindeki Cari uzlaşma sorgusunun (bkz. src/app/api/orders/
-- route.ts computeOrderLedgerStatus çağrısı) "bu sayfadaki siparişlere ait
-- customer_id'ler kimler" alt sorgusu WHERE tenant_id=? AND order_id=ANY(...)
-- kullanıyor — customer_ledger_entries_order_siparis_unique PARÇALI bir
-- index (sadece entry_type='SIPARIS'), bu sorguda entry_type filtresi
-- olmadığından planlayıcı onu kullanamıyor (EXPLAIN ile Seq Scan olarak
-- doğrulandı). Tablo şu an küçük olduğundan fark etmiyor ama paylaşımlı
-- (tüm tenant'lar) bir tablo olduğundan büyüdükçe her sipariş listesi
-- yüklemesinde tam taramaya dönüşürdü.
CREATE INDEX IF NOT EXISTS customer_ledger_entries_tenant_order_idx
  ON customer_ledger_entries(tenant_id, order_id);

-- Rakip firma karşılaştırmasında (Firma Bilgileri ekranı) eksik bulundu —
-- mevcut contact_phone "Yetkili Cep Telefon"a karşılık geliyordu, ayrı bir
-- sabit hat alanı yoktu; web sitesi de hiç yoktu. contact_name/email/phone
-- ile AYNI yerde (Genel Ayarlar > Şirket Bilgisi) yaşıyorlar — o bölüm
-- Paylaşılan Stok eşleşmesinde karşı firmaya gösterilen, düşük riskli
-- iletişim bilgileri kategorisi; Vergi Dairesi/VKN gibi hassas alanlar
-- KASITLI OLARAK buraya eklenmedi (cross-tenant görünür olurdu).
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS landline_phone VARCHAR(30);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS website VARCHAR(200);

-- Firma Logosu / Panel Logosu / Firma Kaşesi — rakip karşılaştırmasında
-- eksik bulunan son 3 alan (bkz. görüşme notları). Vercel Blob'da PUBLIC
-- erişimli olarak saklanıyor (bkz. src/lib/companyAssets.ts) — bu görseller
-- gizli değil, zaten İş Emri çıktısında/panel header'ında doğrudan
-- gösteriliyor. logo_url: İş Emri gibi belgelerin başlığında. panel_logo_url:
-- admin panel header'ında (business_name metninin yanında/yerine).
-- stamp_url: İş Emri'ndeki "Firma Kaşesi" kutusunda.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS panel_logo_url TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stamp_url TEXT;

-- Ürün Kataloğu: aynı partinin (kod+hafta/yılı+tedarikçi) stoğu fiziksel
-- olarak birden fazla yerde (Mağaza/Depo) durabiliyor — "18 adet var ama
-- 6'sı depoda" (bkz. görüşme notları). Tedarikçi ile aynı mantıkla parti
-- benzersizliğine bir boyut daha eklendi: farklı konum = ayrı parti satırı.
ALTER TABLE products ADD COLUMN IF NOT EXISTS location VARCHAR(50);

DROP INDEX IF EXISTS products_code_batch_unique;
CREATE UNIQUE INDEX IF NOT EXISTS products_code_batch_unique ON products(tenant_id, code, production_year, production_week, COALESCE(supplier, ''), COALESCE(location, '')) WHERE production_year IS NOT NULL;
DROP INDEX IF EXISTS products_code_nodate_unique;
CREATE UNIQUE INDEX IF NOT EXISTS products_code_nodate_unique ON products(tenant_id, code, COALESCE(location, '')) WHERE production_year IS NULL;

-- Sipariş ekranındaki Stok Kodu/Ebat alanlarının hangi hizmette görüneceği
-- önceden src/app/page.tsx'te sabit, kod içine gömülü bir isim listesiyle
-- (PRODUCT_SALE_SERVICES) belirleniyordu — bir firma Hizmetler'den yeni bir
-- "3. El Lastik" gibi bir hizmet eklese ya da mevcut birini yeniden
-- adlandırsa, kod bilmeden bu alanları hiç göstermezdi (gerçek bir kullanıcı
-- raporuydu: İkinci El Lastik'te Ebat hiç çıkmıyordu). Artık veri odaklı:
-- Hizmetler ekranından işaretlenebilen bir bayrak.
--
-- IF NOT EXISTS koruması BİLEREK var: aşağıdaki UPDATE sadece bu sütun ilk
-- eklendiğinde (tek seferlik geriye dönük dolum) çalışsın istiyoruz — kolon
-- zaten varsa (ikinci ve sonraki her deploy) blok tamamen atlanır. Koruma
-- olmadan bu UPDATE her `next build`/deploy'da çalışır ve bir kullanıcının
-- Hizmetler ekranından bilerek kapattığı bir bayrağı sessizce tekrar açardı.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'services' AND column_name = 'tracks_size'
  ) THEN
    ALTER TABLE services ADD COLUMN tracks_size BOOLEAN NOT NULL DEFAULT false;
    UPDATE services SET tracks_size = true
      WHERE name IN ('Lastik Satışı', 'Jant Satışı', 'İkinci El Lastik', 'İkinci El Jant');
  END IF;
END $$;

-- Aktivite Geçmişi — "bu siparişi kim sildi, bu carinin bakiyesini kim
-- değiştirdi" sorusuna cevap vermek için (bkz. mimari değerlendirme notları).
-- customer_ledger_entries.created_by GİBİ tek bir tabloya özel, sadece
-- OLUŞTURMAYI kaydeden bir alan değil — DÜZENLEME/SİLME dahil, birden fazla
-- tablo için TEK, merkezi bir iz (bkz. src/lib/auditLog.ts logBillingEvent
-- ile aynı best-effort felsefe: bu loglama başarısız olursa asıl işlemi
-- ASLA bloklamaz). username DENORMALIZE edilir (user_id'ye ek olarak) —
-- kullanıcı hesabı sonradan silinse bile geçmiş kaydın "kim" bilgisi
-- kaybolmasın diye (bkz. ON DELETE SET NULL, user_id NULL olabilir ama
-- username hep kalır).
CREATE TABLE IF NOT EXISTS audit_log (
  id         SERIAL PRIMARY KEY,
  tenant_id  INT NOT NULL REFERENCES tenants(id),
  user_id    INT REFERENCES users(id) ON DELETE SET NULL,
  username   VARCHAR(150) NOT NULL,
  action     VARCHAR(50) NOT NULL,
  table_name VARCHAR(50) NOT NULL,
  record_id  INT,
  detail     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_log_tenant_created_idx ON audit_log(tenant_id, created_at DESC);

-- Barkod — Ürün Kodu'ndan ayrı, okuyucuyla taranabilir bir alan (bkz. "Ürün
-- Kataloğu Taslağı" — sadece bu tek alan, taslağın geri kalanı hâlâ onay
-- bekliyor). Ürün Kodu firma içinde tutarlı bir kodlama şeması izleyebilir
-- (ör. "PRL-CP7-2055516"), gerçek üretici barkodu bundan tamamen bağımsız
-- bir GTIN/EAN'dır — okuyucuyla hızlı stok girişi/satış için ayrı tutulur.
-- Opsiyonel olduğundan (mevcut ürünlerin hiçbirinde yok, geriye dönük
-- doldurma imkansız) benzersizlik kısıtı SADECE dolu değerler için geçerli
-- (partial index, WHERE barcode IS NOT NULL) — aksi halde tüm boş ürünler
-- birbirine "aynı barkod" çakışması verirdi.
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode VARCHAR(64);
CREATE UNIQUE INDEX IF NOT EXISTS products_barcode_unique ON products(tenant_id, barcode) WHERE barcode IS NOT NULL;

-- Ürün Kataloğu Taslağı'nın kalan "Yüksek" öncelikli alanları — müşteri
-- taslağı onayladı (bkz. plan). Hepsi opsiyonel/nullable, mevcut ürünler
-- NULL kalır ve bugünkü davranış (Mevsim/Üretim Haftası her zaman görünür,
-- Diş Derinliği hiç görünmez) NULL için korunur — geriye dönük bozulma yok.
--
-- product_type: Lastik/Jant/İkinci El Lastik/İkinci El Jant/Aksesuar —
-- mevcut Hizmetler listesindeki (bkz. services.tracks_size) servis
-- isimleriyle birebir aynı, personel zaten bu isimleri biliyor.
--
-- width_mm/profile_pct/rim_diameter: Ebat'ın (size_desc) yapılandırılmış
-- bileşenleri — size_desc'in YERİNE değil, YANINA. size_desc 23 dosyada
-- (sipariş ekranları, Paylaşılan Stok, dışa/içe aktarma, /api/products/
-- sizes arama) kullanıldığından TEK yetkili görüntüleme/arama alanı olarak
-- kalıyor; bu üç alan sadece formda doluyken size_desc'i otomatik
-- "205 / 55 / R16" biçiminde oluşturmak için var (bkz. src/app/admin/
-- products/page.tsx).
--
-- tread_depth_mm: İkinci El Lastik'e özel, Kondisyon'un (Çok İyi/İyi)
-- hesaplandığı ham değer — Kondisyon'un kendisi DB'de SAKLANMAZ, saf bir
-- fonksiyondan (bkz. src/lib/productCondition.ts computeCondition)
-- anlık hesaplanır, çünkü taslak "elle girilmez, otomatik hesaplanır" diyor.
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type VARCHAR(30);
ALTER TABLE products ADD COLUMN IF NOT EXISTS width_mm SMALLINT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS profile_pct SMALLINT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS rim_diameter VARCHAR(10);
ALTER TABLE products ADD COLUMN IF NOT EXISTS tread_depth_mm DECIMAL(3,1);

-- Ürün Kataloğu Taslağı'nın Orta/Düşük öncelikli alanları (Faz 2) — yine
-- hepsi nullable, mevcut ürünler NULL kalır. model_name/min_stock_threshold
-- Ürün Tipi'nden bağımsız her zaman anlamlıdır; load_speed_index ve
-- eu_* (AB Lastik Etiketi) sadece Lastik/İkinci El Lastik'te, rim_size/pcd/
-- offset_et sadece Jant/İkinci El Jant'ta forma çıkar (bkz. admin/products/
-- page.tsx isTireType/isRimType). eu_fuel_class/eu_wet_grip_class A-G
-- tutulur (A-E'ye daraltan güncel yönetmelikten önceki fiziksel etiketli
-- stok da girilebilsin diye). min_stock_threshold, product_type gibi PARTİ
-- satırına yazılır ve grup listesinde MAX() ile aggregate edilir — ayrı bir
-- "kod ayarları" tablosu yok, mevcut desenle tutarlı.
ALTER TABLE products ADD COLUMN IF NOT EXISTS model_name VARCHAR(80);
ALTER TABLE products ADD COLUMN IF NOT EXISTS load_speed_index VARCHAR(20);
ALTER TABLE products ADD COLUMN IF NOT EXISTS eu_fuel_class VARCHAR(2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS eu_wet_grip_class VARCHAR(2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS eu_noise_db SMALLINT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS eu_noise_class SMALLINT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS rim_size VARCHAR(20);
ALTER TABLE products ADD COLUMN IF NOT EXISTS pcd VARCHAR(20);
ALTER TABLE products ADD COLUMN IF NOT EXISTS offset_et VARCHAR(10);
ALTER TABLE products ADD COLUMN IF NOT EXISTS min_stock_threshold SMALLINT;

-- Panele ilk girişte gösterilen kısa tanıtım turu (bkz. src/components/
-- OnboardingTour.tsx, src/lib/onboardingTour.ts) — tenants değil users'a
-- ait: aynı firmaya SONRADAN eklenen personel ya da ikinci bir kullanıcı
-- "az önce kayıt oldunuz" turunu görmemeli, bu yüzden per-tenant değil
-- per-user bir alan. Kimin görmesi gerektiği (yalnızca kendi kendine kayıt
-- olmuş firmanın birincil Yöneticisi) shouldShowOnboardingTour() içinde bu
-- kolonla birlikte is_primary_admin ve tenants.trial_ends_at kullanılarak
-- belirlenir — bkz. o dosyadaki not. Atlama da tamamlama da (ikisi de
-- "bir daha gösterme" anlamına gelir) burayı doldurur.
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_tour_completed_at TIMESTAMPTZ;
