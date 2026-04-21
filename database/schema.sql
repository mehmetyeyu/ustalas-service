-- Lastik Servis Yönetim Sistemi — Veritabanı Şeması
-- PostgreSQL (Neon)

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
  total_amount   DECIMAL(10,2),
  paid_amount    DECIMAL(10,2),
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

-- Kullanıcılar (yöneticiler)
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(20) DEFAULT 'admin',
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Varsayılan hizmetler
INSERT INTO services (name, price) VALUES
  ('Rot Ayarı', 500.00),
  ('Balans Ayarı', 300.00),
  ('Rot + Balans', 750.00),
  ('Lastik Değişimi (Tek)', 150.00),
  ('Lastik Değişimi (4''lü)', 500.00),
  ('Sök-Tak', 100.00),
  ('Lastik Tamiri', 200.00)
ON CONFLICT DO NOTHING;

-- Varsayılan admin kullanıcısı
-- Şifre: admin123  (bcrypt hash — uygulamayı başlatmadan önce değiştiriniz!)
-- Yeni hash oluşturmak için: node -e "const b=require('bcryptjs'); b.hash('YeniSifre',10).then(h=>console.log(h))"
INSERT INTO users (username, password_hash, role) VALUES
  ('admin', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin')
ON CONFLICT DO NOTHING;
