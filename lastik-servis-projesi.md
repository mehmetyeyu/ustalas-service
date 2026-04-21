# Lastik Servis Yönetim Sistemi — Proje Spesifikasyonu

## Genel Bakış

Lastik, rot ve balans hizmeti veren bir oto servis firması için web tabanlı müşteri ve sipariş yönetim uygulaması.

---

## Teknoloji Yığını

| Katman | Teknoloji |
|---|---|
| Framework | **Next.js 14** (App Router) — frontend + backend tek projede |
| Stil | Tailwind CSS |
| Veritabanı | **PostgreSQL** (Neon serverless) |
| Sorgu | `pg` paketi (connection pool) |
| Auth | JWT tabanlı kimlik doğrulama (`jsonwebtoken` + httpOnly cookie) |
| Şifreleme | bcryptjs |
| Grafikler | Recharts |
| Excel | `xlsx` (import/export) |

---

## Roller

| Rol | Açıklama |
|---|---|
| **Karşılama Görevlisi** | Giriş gerektirmez. Sadece sipariş oluşturma ekranına erişir. |
| **Yönetici** | Kullanıcı adı + şifre ile giriş yapar. Tüm panele erişir. |

---

## Modüller

### 1. Sipariş Oluşturma Ekranı (Karşılama Görevlisi)

**Erişim:** Şifresiz — iç ağda açık tutulan basit bir sayfa (`/`).

**Alanlar:**
- Araç Plakası (zorunlu, otomatik büyük harf)
- Müşteri Adı (opsiyonel)
- Müşteri Telefonu (opsiyonel)
- Hizmet Seçimi (çoklu seçim, en az biri zorunlu)
- Notlar (serbest metin, opsiyonel)

**Hizmet Listesi (önceden tanımlı fiyatlarla):**

| Hizmet Adı | Varsayılan Fiyat |
|---|---|
| Rot Ayarı | 500 ₺ |
| Balans Ayarı | 300 ₺ |
| Rot + Balans | 750 ₺ |
| Lastik Değişimi (tek) | 150 ₺ |
| Lastik Değişimi (4'lü) | 500 ₺ |
| Sök-Tak | 100 ₺ |
| Lastik Tamiri | 200 ₺ |

> Hizmetler ve fiyatlar yönetici panelinden düzenlenebilir.

**Davranış:**
- Birden fazla hizmet seçilebilir; canlı toplam hesaplanır.
- Kaydet butonuna basınca sipariş `BEKLEMEDE` statüsüyle kaydedilir.
- Başarılı kayıt sonrası ekran sıfırlanır ve onay mesajı gösterilir.

---

### 2. Yönetici Girişi

- `/admin/login` rotasında kullanıcı adı + şifre formu.
- Başarılı girişte JWT token httpOnly cookie olarak saklanır.
- Tüm yönetici sayfaları middleware ile korumalıdır.

---

### 3. Yönetici Paneli — Sipariş Listesi

**Görünüm:**
- Tüm siparişler en yeniden eskiye sıralı.
- Her satırda: `#`, Plaka, Hizmetler, Tarih/Saat, Tutar, Statü, İşlemler.
- İndirim uygulanan siparişlerde tutar sütununda orijinal fiyat üzeri çizili, alınan tutar turuncu renkte gösterilir.

**Filtreler:**
- Tarihe göre (Bugün / Bu Hafta / Bu Ay / Özel Aralık)
- Statüye göre (Beklemede / Tamamlandı)
- Plakaya göre arama

**İşlemler:**
- "Detay →" linki ile sipariş detay sayfasına gidilir.
- "Sil" butonu ile sipariş kalıcı olarak silinir (onay kutusu gösterilir).

---

### 4. Sipariş Detayı

- Plaka, sipariş no ve statü badge.
- Müşteri bilgileri (varsa).
- Hizmet listesi ve birim fiyatlar; altında toplam.
- İndirim uygulandıysa "Alınan (indirimli)" satırı turuncu olarak gösterilir.
- Notlar (varsa sarı uyarı kutusu).
- Oluşturulma tarihi ve ödeme bilgileri.

---

### 5. Ödeme & Sipariş Kapatma

**Ödeme Tipleri:**
- Nakit
- Kredi Kartı
- Havale / EFT

**Akış:**
1. Yönetici siparişi açar, "Ödeme Al & Kapat" butonuna basar.
2. Modal açılır; sistem fiyatı bilgi olarak gösterilir.
3. **Alınan Tutar** alanı sistem fiyatıyla doldurulmuş gelir, istenirse düzenlenir (indirim).
4. İndirim girildiğinde modal içinde indirim tutarı küçük yazıyla gösterilir.
5. Ödeme tipi seçilip onaylanır.
6. Sipariş `TAMAMLANDI` statüsüne geçer; `payment_type`, `payment_date` ve `paid_amount` kaydedilir.

> `paid_amount` boş bırakılırsa `total_amount` otomatik kullanılır.

---

### 6. İstatistik & Raporlama Sayfası

**Zaman Filtresi:** Ay/Yıl seçici (varsayılan: mevcut ay)

Tüm finansal hesaplamalar `paid_amount` (gerçekte alınan tutar) üzerinden yapılır; `paid_amount` NULL ise `total_amount` kullanılır. Filtre her yerde `payment_date` bazlıdır.

#### a) Aylık Gelir Grafiği
- X: Ayın günleri, Y: Günlük toplam gelir (₺)

#### b) En Çok Verilen Hizmetler
- Her hizmetin o ay kaç kez verildiği ve yüzdelik dağılımı.

#### c) Özet Kartlar
- Toplam Sipariş Sayısı
- Toplam Gelir (₺) — alınan tutarlardan
- Nakit / Kredi Kartı / Havale dağılımı — alınan tutarlardan
- Tamamlanan vs. Bekleyen sipariş sayısı

---

### 7. Hizmet & Fiyat Yönetimi

- Mevcut hizmetleri listeleme.
- Yeni hizmet ekleme.
- Hizmet fiyatını düzenleme.
- Hizmet silme (soft delete — `is_active = 0`).

---

### 8. Depolama Modülü

**Sayfa:** `/admin/storage`

#### Tablo

- En yeni kayıt üstte, tüm kayıtlar sayfalı listelenir (sayfa başı 20).
- Sütunlar: Depo No, Plaka, Müşteri, Telefon, Ebat, Marka, Diş Derinliği, Adet, Mevsim, Açıklama.
- **Sütun görünürlüğü:** "Sütunlar" butonu ile her sütun gizlenip gösterilebilir; tercihler `localStorage`'da saklanır.
- **Aksiyonlar sütunu:** Desktop'ta metin butonları, mobilde üç nokta (⋮) ikonu + dropdown olarak görünür; her zaman sağda sabit (sticky).

#### Arama & Filtre

- Plaka veya müşteri adına göre anlık arama.

#### Kayıt İşlemleri

- **Yeni Kayıt:** Modal form — tüm alanlar; Depo No boş bırakılırsa otomatik atanır.
- **Düzenle:** Mevcut veriyle dolu modal; güncelleme anlık listeye yansır.
- **Sil:** Onay sonrası kalıcı silme.

#### Form Alanları

| Alan | Tip | Not |
|---|---|---|
| Depo No | Sayı | Boş bırakılırsa otomatik |
| Plaka | Metin | Zorunlu, otomatik büyük harf |
| Müşteri Adı | Metin | — |
| Telefon | Metin | — |
| Ebat | Combobox | 80+ yaygın ebat listesi + serbest giriş |
| Marka | Combobox | 19 marka listesi + serbest giriş |
| Diş Derinliği | Metin | Örn: `5-5-5-5` |
| Adet | Sayı | Varsayılan: 4 |
| Mevsim | Çoklu checkbox | Kışlık / Yazlık / Dört Mevsim — birden fazla seçilebilir |
| Açıklama | Metin | — |
| İşlem Tarihi | Tarih | Varsayılan: bugün |

#### Duplicate Önleme

- `(plate, mevsim)` DB unique constraint — aynı plaka + mevsim çifti tekrar girilemez.
- Plakasız kayıt kabul edilmez (form ve import).

#### Excel Import

- `.xlsx` dosyası yüklenerek toplu veri aktarımı yapılabilir.
- "Depolama Listesi" sheet'i okunur.
- Çakışan `(plate, mevsim)` kayıtlar güncellenir (upsert).
- Plakasız satırlar atlanır; sonuçta kaç kayıt aktarıldığı / atlandığı bildirilir.

#### Excel Export (Yedekleme)

- "Dışa Aktar" butonu ile tüm kayıtlar `depolama-YYYY-MM-DD.xlsx` olarak indirilir.

#### Etiket Yazdırma

- Her satırdaki "Etiket" butonu yeni pencerede A4 yatay sayfa açar.
- Sayfa ikiye bölünmüş, her yarı A5 boyutunda birer etiket — biri lastik çantasına, biri müşteriye.
- İçerik: Plaka (büyük, çerçeveli), Sıra No, Müşteri, Telefon, Ebat, Marka, Diş Derinliği, Adet, Mevsim, İşlem Tarihi.
- Pencere açılınca otomatik yazdır dialog'u tetiklenir.

---

## Ortam Değişkenleri (.env.local)

```env
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
JWT_SECRET=cok_gizli_bir_anahtar_buraya
JWT_EXPIRES_IN=8h
```

---

## Veritabanı Şeması (PostgreSQL)

```sql
-- Hizmetler
CREATE TABLE IF NOT EXISTS services (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  price      DECIMAL(10,2) NOT NULL,
  is_active  SMALLINT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Siparişler
CREATE TABLE IF NOT EXISTS orders (
  id             SERIAL PRIMARY KEY,
  plate          VARCHAR(20) NOT NULL,
  customer_name  VARCHAR(100),
  customer_phone VARCHAR(20),
  notes          TEXT,
  total_amount   DECIMAL(10,2),           -- hizmetlerin sistem fiyatı toplamı
  paid_amount    DECIMAL(10,2),           -- fiilen alınan tutar (indirim varsa farklı olabilir)
  status         VARCHAR(20) DEFAULT 'BEKLEMEDE' CHECK (status IN ('BEKLEMEDE', 'TAMAMLANDI')),
  payment_type   VARCHAR(20) CHECK (payment_type IN ('NAKIT', 'KREDI_KARTI', 'HAVALE')),
  payment_date   TIMESTAMP NULL,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sipariş <-> Hizmet ilişkisi
CREATE TABLE IF NOT EXISTS order_services (
  id         SERIAL PRIMARY KEY,
  order_id   INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  service_id INT NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  unit_price DECIMAL(10,2) NOT NULL
);

-- Depolama
CREATE TABLE IF NOT EXISTS storage (
  id            SERIAL PRIMARY KEY,
  depo_no       INT,
  plate         VARCHAR(20),
  customer_name VARCHAR(100),
  phone         VARCHAR(30),
  ebat          VARCHAR(50),
  marka         VARCHAR(100),
  dis_derinligi VARCHAR(50),
  adet          INT DEFAULT 4,
  mevsim        VARCHAR(30),
  aciklama      TEXT,
  islem_tarihi  DATE DEFAULT CURRENT_DATE,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT storage_plate_mevsim_unique UNIQUE (plate, mevsim)
);

-- Kullanıcılar (yöneticiler)
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(20) DEFAULT 'admin',
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

> Mevcut veritabanına `paid_amount` eklemek için migration:
> ```sql
> ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_amount DECIMAL(10,2);
> ```

---

## API Rotaları

| Method | Endpoint | Açıklama |
|---|---|---|
| GET | `/api/orders` | Sipariş listesi (filtreler: status, plate, dateFrom, dateTo) |
| POST | `/api/orders` | Yeni sipariş oluştur |
| GET | `/api/orders/:id` | Sipariş detayı |
| PATCH | `/api/orders/:id` | Siparişi kapat (payment_type, paid_amount) |
| DELETE | `/api/orders/:id` | Siparişi sil (order_services cascade) |
| GET | `/api/services` | Aktif hizmet listesi |
| POST | `/api/services` | Yeni hizmet ekle |
| PATCH | `/api/services/:id` | Hizmet güncelle |
| DELETE | `/api/services/:id` | Hizmet sil (soft delete) |
| GET | `/api/reports` | Aylık rapor (year, month parametreleri) |
| POST | `/api/auth/login` | Yönetici girişi |
| POST | `/api/auth/logout` | Çıkış |
| GET | `/api/storage` | Depolama listesi (page, limit, search) |
| POST | `/api/storage` | Yeni depolama kaydı |
| PATCH | `/api/storage/:id` | Kaydı güncelle |
| DELETE | `/api/storage/:id` | Kaydı sil |
| POST | `/api/storage/import` | Excel'den toplu import |
| GET | `/api/storage/export` | Tüm kayıtları Excel olarak indir |

---

## Sayfa / Rota Yapısı

```
/                     → Sipariş oluşturma ekranı (şifresiz)
/admin/login          → Yönetici girişi
/admin/orders         → Sipariş listesi (korumalı)
/admin/orders/:id     → Sipariş detayı (korumalı)
/admin/reports        → İstatistik & raporlama (korumalı)
/admin/services       → Hizmet & fiyat yönetimi (korumalı)
/admin/storage        → Depolama yönetimi (korumalı)
```

---

## Güvenlik Notları

- Karşılama ekranı (`/`) sadece iç ağdan erişilebilir olmalı.
- Yönetici şifreleri bcrypt ile hashlenmiştir.
- JWT token süresi 8 saat (vardiya süresi).
- Admin rotaları Next.js middleware ile korumalıdır.
