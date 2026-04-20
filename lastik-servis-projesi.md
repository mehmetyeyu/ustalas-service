# Lastik Servis Yönetim Sistemi — Proje Spesifikasyonu

## Genel Bakış

Lastik, rot ve balans hizmeti veren bir oto servis firması için web tabanlı müşteri ve sipariş yönetim uygulaması.

---

## Teknoloji Yığını

| Katman | Teknoloji |
|---|---|
| Framework | **Next.js 14** (App Router) — frontend + backend tek projede |
| Stil | Tailwind CSS |
| Veritabanı | **MySQL** (Natro hosting üzerindeki mevcut DB) |
| ORM / Sorgu | `mysql2` paketi (veya Prisma ile MySQL adaptörü) |
| Auth | JWT tabanlı kimlik doğrulama (`jsonwebtoken` + httpOnly cookie) |
| Şifreleme | bcryptjs |
| Grafikler | Recharts |

> **Kurulum komutu:** `npx create-next-app@latest lastik-servis --typescript --tailwind --app`
> Ardından: `npm install mysql2 jsonwebtoken bcryptjs recharts`

---

## Roller

| Rol | Açıklama |
|---|---|
| **Karşılama Görevlisi** | Giriş gerektirmez. Sadece sipariş oluşturma ekranına erişir. |
| **Yönetici** | Kullanıcı adı + şifre ile giriş yapar. Tüm panele erişir. |

---

## Modüller

### 1. Sipariş Oluşturma Ekranı (Karşılama Görevlisi)

**Erişim:** Şifresiz — iç ağda açık tutulan basit bir sayfa.

**Alanlar:**
- Araç Plakası (zorunlu, metin alanı — örn. `34 ABC 123`)
- Müşteri Adı (opsiyonel)
- Müşteri Telefonu (opsiyonel)
- Hizmet Seçimi (çoklu seçim — aşağıya bakınız)
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

> Hizmetler ve fiyatlar yönetici panelinden düzenlenebilir olmalıdır.

**Davranış:**
- Birden fazla hizmet seçilebilir.
- Kaydet butonuna basınca sipariş `BEKLEMEDE` statüsüyle sisteme kaydedilir.
- Başarılı kayıt sonrası ekran sıfırlanır ve onay mesajı gösterilir.

---

### 2. Yönetici Girişi

- `/admin/login` rotasında basit kullanıcı adı + şifre formu.
- Başarılı girişte JWT token ile oturum açılır (localStorage veya httpOnly cookie).
- Tüm yönetici sayfaları korumalı rotalar olmalıdır.

---

### 3. Yönetici Paneli — Sipariş Listesi

**Görünüm:**
- Tüm siparişlerin listesi, en yeniden eskiye sıralı.
- Her satırda: Plaka, Hizmetler, Tarih/Saat, Toplam Tutar, Statü, İşlemler.

**Filtreler:**
- Tarihe göre filtre (bugün / bu hafta / bu ay / tarih aralığı)
- Statüye göre filtre (Beklemede / Tamamlandı)
- Plakaya göre arama

**Sipariş Detayı:**
- Tıklandığında modal veya detay sayfası açılır.
- Seçilen hizmetler, notlar, müşteri bilgileri görünür.

---

### 4. Ödeme & Sipariş Kapatma

**Ödeme Tipleri:**
- Nakit
- Kredi Kartı
- Havale / EFT

**Akış:**
1. Yönetici siparişi açar.
2. "Ödeme Al & Kapat" butonuna basar.
3. Ödeme tipini seçer, tutarı onaylar.
4. Sipariş `TAMAMLANDI` statüsüne geçer, ödeme tipi ve tarihi kaydedilir.

---

### 5. İstatistik & Raporlama Sayfası

**Zaman Filtresi:** Ay/Yıl seçici (varsayılan: mevcut ay)

**Gösterilecek Veriler:**

#### a) Aylık Gelir Grafiği (Bar veya Line Chart)
- X ekseni: Ayın günleri
- Y ekseni: Günlük toplam gelir (₺)

#### b) En Çok Verilen Hizmetler (Pie veya Bar Chart)
- Her hizmetin o ay kaç kez verildiği
- Yüzdelik dağılım

#### c) Özet Kartlar (sayfa üstünde)
- Toplam Sipariş Sayısı
- Toplam Gelir (₺)
- Nakit / Kredi Kartı / Havale dağılımı
- Tamamlanan vs. Bekleyen sipariş sayısı

---

## Ortam Değişkenleri (.env.local)

```env
# Natro MySQL bağlantı bilgileri
DB_HOST=your_natro_mysql_host
DB_PORT=3306
DB_NAME=your_database_name
DB_USER=your_db_user
DB_PASSWORD=your_db_password

# JWT
JWT_SECRET=cok_gizli_bir_anahtar_buraya
JWT_EXPIRES_IN=8h
```

---

## Veritabanı Şeması (MySQL)

```sql
-- Hizmetler
CREATE TABLE services (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  price      DECIMAL(10,2) NOT NULL,
  is_active  TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Siparişler
CREATE TABLE orders (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  plate          VARCHAR(20) NOT NULL,
  customer_name  VARCHAR(100),
  customer_phone VARCHAR(20),
  notes          TEXT,
  total_amount   DECIMAL(10,2),
  status         ENUM('BEKLEMEDE','TAMAMLANDI') DEFAULT 'BEKLEMEDE',
  payment_type   ENUM('NAKIT','KREDI_KARTI','HAVALE') NULL,
  payment_date   DATETIME NULL,
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Sipariş <-> Hizmet iliskisi
CREATE TABLE order_services (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  order_id   INT NOT NULL,
  service_id INT NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (order_id)   REFERENCES orders(id),
  FOREIGN KEY (service_id) REFERENCES services(id)
);

-- Kullanicilar (yoneticiler)
CREATE TABLE users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(20) DEFAULT 'admin',
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Varsayilan hizmetler
INSERT INTO services (name, price) VALUES
  ('Rot Ayari', 500.00),
  ('Balans Ayari', 300.00),
  ('Rot + Balans', 750.00),
  ('Lastik Degisimi (Tek)', 150.00),
  ('Lastik Degisimi (4lu)', 500.00),
  ('Sok-Tak', 100.00),
  ('Lastik Tamiri', 200.00);
```

---

## Sayfa / Rota Yapısı

```
/                     → Sipariş oluşturma ekranı (şifresiz)
/admin/login          → Yönetici girişi
/admin/orders         → Sipariş listesi (korumalı)
/admin/orders/:id     → Sipariş detayı (korumalı)
/admin/reports        → İstatistik & raporlama (korumalı)
/admin/services       → Hizmet & fiyat yönetimi (korumalı)
```

---

## Güvenlik Notları

- Karşılama ekranı (`/`) sadece iç ağdan (LAN) erişilebilir olmalı veya en azından internet'e açık olmamalı.
- Yönetici şifreleri bcrypt ile hashlenmeli.
- JWT token süresi 8 saat olarak ayarlanabilir (vardiya süresi).
- Admin rotaları middleware ile korunmalı.

---

## Geliştirme Öncelikleri (Aşamalar)

### Faz 1 — Temel İşlevsellik
1. Veritabanı şeması ve migration'lar
2. Sipariş oluşturma ekranı (frontend + API)
3. Yönetici girişi (auth)
4. Sipariş listeleme ve detay ekranı
5. Ödeme alma & sipariş kapatma

### Faz 2 — Raporlama
6. Aylık gelir grafiği
7. Hizmet dağılımı grafiği
8. Özet kartlar

### Faz 3 — Yönetim
9. Hizmet & fiyat yönetim ekranı
10. Çoklu yönetici kullanıcısı desteği

---

## Ek Notlar

- Uygulama Türkçe arayüz ile geliştirilmeli.
- Tüm para birimleri Türk Lirası (₺) olarak gösterilmeli.
- Tarih/saat formatı: `DD.MM.YYYY HH:mm` (Türkiye saat dilimi — Europe/Istanbul).
- Mobil uyumluluk: Karşılama ekranı tablet/telefon'dan da rahatça kullanılabilmeli.
