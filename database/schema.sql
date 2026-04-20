-- Lastik Servis Yönetim Sistemi — Veritabanı Şeması
-- MySQL 5.7+ / 8.0

-- Hizmetler
CREATE TABLE IF NOT EXISTS services (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  price      DECIMAL(10,2) NOT NULL,
  is_active  TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Siparişler
CREATE TABLE IF NOT EXISTS orders (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  plate          VARCHAR(20) NOT NULL,
  customer_name  VARCHAR(100),
  customer_phone VARCHAR(20),
  notes          TEXT,
  total_amount   DECIMAL(10,2),
  status         ENUM('BEKLEMEDE','TAMAMLANDI') DEFAULT 'BEKLEMEDE',
  payment_type   ENUM('NAKIT','KREDI_KARTI','HAVALE') NULL,
  payment_date   TIMESTAMP NULL,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sipariş <-> Hizmet ilişkisi
CREATE TABLE IF NOT EXISTS order_services (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  order_id   INT NOT NULL,
  service_id INT NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (order_id)   REFERENCES orders(id)   ON DELETE CASCADE,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Kullanıcılar (yöneticiler)
CREATE TABLE IF NOT EXISTS users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(20) DEFAULT 'admin',
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Varsayılan hizmetler
INSERT IGNORE INTO services (name, price) VALUES
  ('Rot Ayarı', 500.00),
  ('Balans Ayarı', 300.00),
  ('Rot + Balans', 750.00),
  ('Lastik Değişimi (Tek)', 150.00),
  ('Lastik Değişimi (4\'lü)', 500.00),
  ('Sök-Tak', 100.00),
  ('Lastik Tamiri', 200.00);

-- Varsayılan admin kullanıcısı
-- Şifre: admin123  (bcrypt hash — uygulamayı başlatmadan önce değiştiriniz!)
-- Yeni hash oluşturmak için: node -e "const b=require('bcryptjs'); b.hash('YeniSifre',10).then(h=>console.log(h))"
INSERT IGNORE INTO users (username, password_hash, role) VALUES
  ('admin', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin');
