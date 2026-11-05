# e-Fatura / e-Arşiv Modülü — Tasarım (Paraşüt entegrasyonu)

Durum: **tasarım, kararlar alındı** (2026-10-30, §12). Paraşüt API erişimi henüz istenmedi; tasarım erişim alınmış varsayılarak yazıldı. Ücretli ek özellik (§13); ilk açılacak firma Ustalas.
Teknik kaynak: [parasut-api-referans.md](parasut-api-referans.md) (resmi swagger'dan çıkarıldı; her bilgi kaynağıyla işaretli).

---

## 1. Amaç ve kapsam

Lastikçi, Elevire'deki bir siparişten tek tuşla **resmi fatura** keser: müşteri e-Fatura mükellefiyse e-Fatura, değilse e-Arşiv. Fatura lastikçinin **kendi Paraşüt hesabından, kendi kontörüyle** kesilir. PDF Elevire'de saklanır, WhatsApp/yazdır ile müşteriye gider.

Bugün bu iş elle yapılıyor: sipariş "Fatura Edildi." ödeme tipiyle kapatılıyor, fatura numarası Ödeme Notu'na yazılıyor. Modül bu alışkanlığı bozmaz; "Fatura Edildi." elle fatura kesenler için kalır.

**Kapsam içi (Faz 1–3):** Paraşüt bağlantısı, siparişten tekli fatura, PDF, durum takibi, e-Arşiv iptali, tahsilatın Paraşüt'e işlenmesi, kurumsal müşteriye aylık toplu fatura (ekstreden).
**Kapsam dışı:** gelen faturalar (alış), e-İrsaliye (API'de yok), e-SMM, Paraşüt stoğunun senkronu (stok sahibi Elevire'dir), ihracat faturası.

---

## 2. Mimari kararlar

| Karar | Seçim | Neden |
|---|---|---|
| Sağlayıcı soyutlaması | `src/lib/einvoice/` altında `EInvoiceProvider` arayüzü; ilk uygulama `parasut.ts` | İleride İşNet vb. eklenebilsin (Yeyu kendi faturasını İşNet'le kesiyor). Sipariş/ekran kodu Paraşüt'ü bilmez. |
| Kimlik doğrulama | OAuth `authorization_code` — her firma "Paraşüt'e Bağlan" ile kendi hesabını onaylar | Lastikçinin Paraşüt şifresini saklamayız. `password` akışı yalnızca Paraşüt partner client vermezse yedek (bkz. §11). |
| Gizli bilgiler | Token'lar AES-256-GCM ile şifreli (`src/lib/secretBox.ts`, anahtar `INTEGRATION_ENC_KEY`) | WhatsApp token'ı bugün düz metin; bu modülde aynı hatayı tekrarlamıyoruz. Sonra WhatsApp da buna taşınabilir. |
| Asenkron iş | **İstemci güdümlü yoklama** + günlük cron süpürmesi | Paraşüt'te webhook yok, e-belge arka planda oluşuyor (job id 15 dk geçerli). Vercel Hobby'de cron günde bir; uzun süren fonksiyon CPU yakar. Ekran 3 sn'de bir bizim ucumuza sorar, her soru Paraşüt'e tek istek. |
| Hız sınırı | Firma başına 10 istek / 10 sn, DB'de atomik sayaç | Sunucusuz örnekler arasında paylaşılmalı. Toplu fatura bu sınırla sıraya girer. |
| Tekrar (idempotency) | Bizim tarafta `invoices` satırı **önce** açılır; her adım sonrası dış id yazılır; tekrar denemede eksik adımdan devam edilir | Paraşüt'te idempotency anahtarı yok. Çift fatura = gerçek vergi sorunu. |
| Fiyatlar | Sipariş tutarları **KDV dahil** kabul edilir; net fiyat geri hesaplanır | `order_services.unit_price` satır toplamı, KDV alanı yok; Paraşüt `unit_price` KDV hariç istiyor. **Kullanıcı onayı gerekli (§12).** |
| Fatura ↔ sipariş | Çoka-çok (`invoice_orders`) | Tekli fatura 1 sipariş; aylık filo faturası N sipariş. Baştan doğru kurulursa Faz 3'te şema değişmez. |
| PDF | **Saklanmaz** — her açılışta sağlayıcıdan taze alınır ve bizim ucumuzdan akıtılır; müşteriye bizim imzalı linkimiz verilir | Paraşüt PDF linki 1 saat geçerli ve "paylaşmayın" diyor. Mevcut Vercel Blob deposu herkese açık (özel dosya reddediyor — 2026-10-30 denendi); TCKN/adres içeren faturayı açık linkte tutmayız. Yasal arşiv Paraşüt'te. |

React Native hazırlığı: tüm akış JSON API uçlarından ibaret; yoklama da aynı uçla mobilde çalışır. OAuth bağlantısı yalnızca web Ayarlar'dan yapılır (mobilde gerek yok).

---

## 3. Veri modeli (`database/schema.sql`, idempotent ekler)

### 3.1 Yeni tablolar

```sql
-- Firma başına tek entegrasyon bağlantısı
CREATE TABLE IF NOT EXISTS einvoice_connections (
  tenant_id            INT PRIMARY KEY REFERENCES tenants(id),
  provider             VARCHAR(20) NOT NULL DEFAULT 'parasut',
  external_company_id  VARCHAR(30) NOT NULL,          -- Paraşüt firma no
  company_name         VARCHAR(200),
  company_tax_number   VARCHAR(11),
  access_token_enc     TEXT NOT NULL,
  refresh_token_enc    TEXT NOT NULL,
  token_expires_at     TIMESTAMPTZ NOT NULL,
  e_invoicing_activated_at TIMESTAMPTZ,               -- bundan önceki tarihe fatura kesilemez
  status               VARCHAR(12) NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active','reauth','disabled')),
  -- ayarlar
  invoice_series       VARCHAR(10),                   -- ör. "ELV" — Paraşüt'te tekrar kontrolü için
  default_vat_rate     SMALLINT NOT NULL DEFAULT 20 CHECK (default_vat_rate IN (0,1,10,20)),
  record_payments      BOOLEAN NOT NULL DEFAULT true, -- tahsilatı Paraşüt'e işle
  external_tag_id      VARCHAR(30),                   -- "Elevire" etiketi
  -- hız sınırı penceresi
  rl_window_start      TIMESTAMPTZ,
  rl_count             SMALLINT NOT NULL DEFAULT 0,
  last_error           TEXT,
  connected_by         INT REFERENCES users(id),
  connected_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoices (
  id                 SERIAL PRIMARY KEY,
  tenant_id          INT NOT NULL REFERENCES tenants(id),
  customer_id        INT,                              -- composite FK (customers.id, tenant_id) SET NULL
  doc_type           VARCHAR(10) CHECK (doc_type IN ('e_arsiv','e_fatura')),  -- mükellef sorgusundan sonra dolar
  scenario           VARCHAR(10) CHECK (scenario IN ('basic','commercial')),
  status             VARCHAR(12) NOT NULL DEFAULT 'HAZIRLANIYOR'
                     CHECK (status IN ('HAZIRLANIYOR','ISLENIYOR','RESMILESTI','HATA','IPTAL','REDDEDILDI')),
  step               VARCHAR(16) NOT NULL DEFAULT 'contact',  -- contact|invoice|formalize|poll|pdf|payment|done
  issue_date         DATE NOT NULL,
  -- alıcı anlık görüntüsü (müşteri sonradan değişse de fatura değişmez)
  buyer_name         VARCHAR(200) NOT NULL,
  buyer_tax_number   VARCHAR(11),                      -- VKN(10) / TCKN(11); bireyselde boşsa 11111111111
  buyer_tax_office   VARCHAR(100),
  buyer_address      TEXT,
  buyer_city         VARCHAR(50),
  buyer_district     VARCHAR(50),
  buyer_email        VARCHAR(150),
  buyer_alias        VARCHAR(200),                     -- e-Fatura etiketi (urn:mail:...)
  plate_note         TEXT,                             -- "Plaka: 34 ABC 123" → fatura notu
  -- tutarlar (bizim hesabımız + Paraşüt'ün döndürdüğü)
  net_total          DECIMAL(12,2),
  vat_total          DECIMAL(12,2),
  gross_total        DECIMAL(12,2) NOT NULL,           -- müşterinin ödediği, KDV dahil
  provider_gross_total DECIMAL(12,2),                  -- Paraşüt net_total; kuruş farkı izlenir
  lines              JSONB NOT NULL,                   -- gönderilen satırların anlık görüntüsü
  -- dış kimlikler (adım adım yazılır)
  ext_contact_id     VARCHAR(30),
  ext_invoice_id     VARCHAR(30),
  ext_job_id         VARCHAR(64),
  ext_job_started_at TIMESTAMPTZ,
  ext_document_id    VARCHAR(30),
  gib_invoice_no     VARCHAR(20),                      -- ör. ELV2026000000123
  ettn               UUID,
  cancellable_until  TIMESTAMPTZ,                      -- e-Arşiv iptal penceresi
  response_type      VARCHAR(10),                      -- e-Fatura ticari: accepted|rejected|refunded
  pdf_blob_path      TEXT,
  error_message      TEXT,
  attempts           SMALLINT NOT NULL DEFAULT 0,
  created_by         INT REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invoices_tenant_created_idx ON invoices(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS invoices_tenant_open_idx ON invoices(tenant_id)
  WHERE status IN ('HAZIRLANIYOR','ISLENIYOR');

-- Bir sipariş yalnızca bir geçerli faturada olabilir
CREATE TABLE IF NOT EXISTS invoice_orders (
  invoice_id INT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  order_id   INT NOT NULL,
  tenant_id  INT NOT NULL,
  active     BOOLEAN NOT NULL DEFAULT true,   -- fatura IPTAL/REDDEDILDI/HATA(vazgeçildi) olunca false
  PRIMARY KEY (invoice_id, order_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS invoice_orders_active_unique
  ON invoice_orders(tenant_id, order_id) WHERE active;

-- Elevire kalemi → Paraşüt ürünü eşlemesi (tembel oluşturma)
CREATE TABLE IF NOT EXISTS einvoice_product_map (
  tenant_id   INT NOT NULL,
  local_key   VARCHAR(80) NOT NULL,      -- 'service:12' | 'tire:PIRELLI235'
  vat_rate    SMALLINT NOT NULL,
  ext_product_id VARCHAR(30) NOT NULL,
  PRIMARY KEY (tenant_id, local_key, vat_rate)
);
```

### 3.2 Mevcut tablolara ekler

| Tablo | Kolon | Not |
|---|---|---|
| `customers` | `tax_office`, `address`, `city`, `district`, `email` | Kurumsal müşteride fatura için gerekli; bireyselde isteğe bağlı. `tax_no` VKN/TCKN'yi zaten tutuyor. |
| `customers` | `ext_contact_id` | Paraşüt müşteri id (firma başına bir bağlantı olduğu için tek kolon yeter). |
| `customers` | `einvoice_alias` | Birden çok etiketi olan mükellefte seçilen etiket. |
| `services` | `vat_rate SMALLINT NULL` | NULL = bağlantının varsayılan oranı. Lastik ve işçilik %20; istisna olursa hizmet bazında değişir. |
| `kasalar` | `ext_account_id` | Paraşüt kasa/banka hesabı eşlemesi (tahsilat için). |

`src/lib/tenantDeletion.ts` silme sırasına: `invoice_orders`, `invoices`, `einvoice_product_map`, `einvoice_connections` (test zaten eksikliği yakalar).

---

## 4. Bağlantı akışı (Ayarlar → Entegrasyonlar → e-Fatura)

1. Admin "Paraşüt'e Bağlan"a basar → `GET /api/einvoice/connect` → `https://api.parasut.com/oauth/authorize?client_id=…&redirect_uri=https://app…/api/einvoice/callback&response_type=code&state=<imzalı JWT: tenant_id, user_id, nonce, 10 dk>`.
2. Paraşüt'te giriş + onay → `GET /api/einvoice/callback?code=…&state=…` → state doğrulanır → token alınır.
3. `GET /me?include=companies,user_roles`:
   - Birden çok firma varsa ekranda seçtirilir.
   - Rol kontrolü: `sales_invoices == "rw"` değilse bağlantı reddedilir ("Bu Paraşüt kullanıcısının fatura yazma yetkisi yok").
   - `has_active_subscription`, `e_invoicing_activated_at` saklanır. e-Fatura'ya geçmemiş firma: "Paraşüt hesabınızda e-Fatura/e-Arşiv aktif değil" uyarısı, bağlantı kurulur ama fatura kesilemez.
4. Kurulum sihirbazı (tek ekran):
   - Fatura serisi (varsayılan firma kodundan üç harf; tekrar kontrolü için),
   - Varsayılan KDV oranı,
   - Kasa eşlemesi: `GET /accounts` listesi; her Elevire kasası bir Paraşüt hesabına (boş = tahsilat işlenmez),
   - "Tahsilatları Paraşüt'e işle" anahtarı,
   - "Elevire" etiketi oluşturulur (muhasebeci Paraşüt'te filtreleyebilsin).
5. Bağlantıyı kes: token'lar silinir, `status='disabled'`; kesilmiş faturalar ve PDF'ler kalır.

**Token yenileme** (`getAccessToken(tenantId)`): `token_expires_at < now()+2dk` ise transaction içinde `SELECT … FOR UPDATE` ile satır kilitlenir, tekrar kontrol edilir (başka istek yenilemiş olabilir), yenilenir, **yeni refresh token** yazılır. 401 gelirse bir kez yenile + tekrar dene; yenileme de 401/400 ise `status='reauth'` → ekranda "Paraşüt bağlantısını yenileyin" şeridi.

---

## 5. Fatura kesme akışı

### 5.1 Ön kontrol (istek atmadan, ekranda)

- Bağlantı `active`, sipariş(ler) bu firmanın, hiçbiri aktif bir faturada değil.
- Satır var, toplam > 0.
- Tarih ≥ `e_invoicing_activated_at`; ileri tarih yok; e-Arşiv için en fazla 7 gün geriye (GİB kuralı, bkz. §12 doğrulanacak).
- Alıcı:
  - Kurumsal (`is_corporate` veya 10 haneli `tax_no`): unvan, VKN, vergi dairesi, il/ilçe/adres zorunlu.
  - Bireysel: ad ve **TC kimlik no zorunlu** (11 hane + algoritma kontrolü) ya da "TC vermek istemiyor" → `11111111111` (§12.5); il/ilçe yoksa firmanın kendi il/ilçesi (Paraşüt `/me` adresinden).
- Sipariş `TAMAMLANDI` (§12.4).
- Eksik varsa "Fatura Bilgileri" penceresi açılır; girilenler müşteri kaydına da yazılır (bir sonrakinde sorulmaz).

### 5.2 Sunucu adımları (`POST /api/invoices`)

`invoices` satırı **önce** açılır (`HAZIRLANIYOR`, `step='contact'`), `invoice_orders` aktif kilit alınır (unique index → aynı siparişe ikinci fatura başlatılamaz). Sonra adımlar sırayla; her adımdan sonra dış id ve `step` yazılır. Bir adım hata verirse `status='HATA'`, `error_message`, kullanıcı "Tekrar Dene" ile **kaldığı adımdan** devam eder.

| Adım | Paraşüt çağrısı | Not |
|---|---|---|
| contact | `customers.ext_contact_id` varsa `PUT /contacts/{id}` (bilgi değiştiyse), yoksa `GET /contacts?filter[tax_number]=` → yoksa `POST /contacts` | Bireysel ve vergi nosuz müşteride ada göre arama yapılmaz, yeni kişi açılır (yanlış eşleşme riskini almayız). |
| invoice | Önce `GET /sales_invoices?filter[invoice_series]=S&filter[invoice_id]=N` (yarım kalmış deneme var mı) → yoksa `POST /sales_invoices` | `invoice_id` = bizim `invoices.id`; tekrar denemede çift fatura oluşmaz. Satırlar §6'ya göre. `order_no`+`order_date` birlikte (Sipariş No / sipariş tarihi). Plaka `invoice_note`'a. `shipment_included:false` (Paraşüt stoğuna dokunma). |
| formalize | `GET /sales_invoices/{id}?include=active_e_document` (zaten resmileşmiş mi) → `GET /e_invoice_inboxes?filter[vkn]=` → mükellefse `POST /e_invoices` (`relationships.invoice`, `scenario`, `to`), değilse `POST /e_archives` (`relationships.sales_invoice`) | Dönen job id + zaman yazılır, `status='ISLENIYOR'`, `step='poll'`. Yanıt hemen döner. |
| poll | `GET /trackable_jobs/{id}` | İstemci 3 sn'de bir `GET /api/invoices/:id/status` çağırır → en fazla 1 Paraşüt isteği. `done` → `active_e_document` okunur (GİB no, ETTN, `cancellable_until`). `error` → mesajlar Türkçe gelir, aynen gösterilir. 15 dk geçtiyse job'a değil `active_e_document`'a bakılır. |
| pdf | `GET /e_archives|e_invoices/{docId}/pdf` | Yalnızca "hazır mı" kontrolü: 204 → sonraki yoklamada tekrar, 200 → adım biter. PDF saklanmaz; görüntülemede yeniden istenir (§2). |
| payment | `record_payments` açıksa ve sipariş ödendiyse: her `order_payments` satırı için, kasası eşlenmişse `POST /sales_invoices/{id}/payments` | Cari ile kapanan kısım Paraşüt'te açık alacak kalır (doğrusu bu). Hata faturayı bozmaz; "tahsilat işlenemedi" notu düşer, tekrar denenebilir. |
| done | — | `status='RESMILESTI'`. Audit: `invoice.issue`. |

**Neden tek istekte bitirmiyoruz:** e-belge Paraşüt'te saniyeler–dakikalar sürüyor; fonksiyonu bekletmek CPU ve zaman aşımı riski. Adımlar kısa, her biri ayrı istek.

**Güvenlik ağı:** günlük cron (`/api/cron/einvoice-sweep`, mevcut cron dosyasına eklenir) `ISLENIYOR` kalmış ve 10 dk'dan eski faturaları `active_e_document` ile sonuçlandırır, PDF'i çeker. Fatura listesi açıldığında da açık kalan en fazla 5 fatura için aynı kontrol yapılır.

### 5.3 Hız sınırı

`paraSutFetch()` her istekten önce `UPDATE einvoice_connections SET rl_count = CASE WHEN rl_window_start < now()-'10s' THEN 1 ELSE rl_count+1 END, rl_window_start = CASE … END WHERE tenant_id=$1 RETURNING rl_count` → 10'u aşarsa kalan süre kadar bekler (en fazla 2 sn) ya da "Paraşüt meşgul, birazdan tekrar deneyin" (429 benzeri, istemci yeniden dener). Paraşüt'ün kendi 429'u belgelenmemiş; 429/5xx gelirse aynı yol.

---

## 6. Tutar ve KDV hesabı (`src/lib/einvoice/amounts.ts`, saf fonksiyon + test)

Girdi: sipariş satırları (KDV dahil satır toplamı, adet, hizmet KDV oranı) + sipariş indirimi (`total_amount - paid_amount`, kurumsal indirim dahil).

1. Satır net birim fiyat = `satır_toplamı / adet / (1 + oran/100)`, 4 ondalık (Paraşüt hesaplarken yuvarlar).
2. İndirim: sipariş seviyesinde → fatura `invoice_discount_type='amount'`, tutar KDV hariç'e çevrilir. Birden çok KDV oranı varsa indirim satırlara oranla dağıtılır (satır `discount_type='amount'`), aksi halde fatura indirimi.
3. Paraşüt'ün döndürdüğü `net_total` (Paraşüt'te "Genel Toplam") ile bizim `gross_total` karşılaştırılır:
   - fark ≤ 0,05 TL: kabul, `provider_gross_total` yazılır, faturada farkı gösteririz;
   - fazlaysa resmileştirmeye **geçilmez**, `HATA: tutar uyuşmuyor` (taslak faturayı Paraşüt'te siler: `DELETE /sales_invoices/{id}`).
4. Ürün eşlemesi: hizmet satırı → `service:<id>`; Lastik Satışı satırı → `tire:<stock_code>` (yoksa ebat/marka adından). Paraşüt ürünü yoksa `POST /products` (`inventory_tracking:false`) ve `einvoice_product_map`'e yazılır. Satır açıklaması: "205/55R16 Michelin Primacy 4 (DOT 28/25)" gibi; 120 karakterle kısaltılır.

Para hesabı JS float ile yapılmaz; kuruş tamsayıları ya da mevcut decimal yardımcıları kullanılır.

---

## 7. İptal, red, iade

| Durum | Ne yapılır |
|---|---|
| e-Arşiv, `cancellable_until` geçmedi | "Faturayı İptal Et" → `DELETE /sales_invoices/{id}/cancel` (Paraşüt'ün bunu GİB'de de iptal ettiği **doğrulanacak**, §11). Başarılıysa `IPTAL`, `invoice_orders.active=false` → sipariş tekrar faturalanabilir. |
| e-Arşiv, süre geçti | Buton yok; "7 günü geçen e-Arşiv iptal edilemez, iade faturası/gider pusulası Paraşüt'ten düzenlenir" açıklaması + Paraşüt'te faturayı açan link (`app_url`). |
| e-Fatura ticari | Alıcı reddedebilir. Günlük cron + fatura detayı açılınca `GET /e_invoices/{id}` → `response_type='rejected'` ise `REDDEDILDI`, sipariş serbest kalır, ekranda uyarı. |
| e-Fatura temel / iade | Uygulamadan iptal yok (Paraşüt API'si de vermiyor); Paraşüt paneline yönlendirme. |
| HATA'da vazgeç | Paraşüt'te resmileşmemiş taslak varsa silinir, fatura `IPTAL` (iç), sipariş serbest. |

**Sipariş kilidi:** aktif ve `RESMILESTI` faturası olan siparişte `PUT /api/orders/:id` satır/tutar değişikliği ve `DELETE` → 409 "Bu siparişin resmi faturası var; önce faturayı iptal edin". Ödeme tipi/not gibi tutarı etkilemeyen alanlar serbest. `HAZIRLANIYOR/ISLENIYOR` iken de kilitli.

---

## 8. Ekranlar

1. **Ayarlar → Entegrasyonlar → e-Fatura** (admin): bağlan/kes, firma bilgisi, seri, KDV, kasa eşlemesi, bağlantı durumu, son hata.
2. **Sipariş detayı:** "Fatura Kes" düğmesi (izin + bağlantı varsa). Faturası varsa kart: tür (e-Arşiv/e-Fatura), GİB no, tarih, durum rozeti, PDF, Yazdır, WhatsApp, İptal (süre içindeyse). İşlenirken ilerleme: "Müşteri hazırlanıyor → Fatura oluşturuldu → GİB'e gönderiliyor → PDF hazır".
3. **Ödeme Al & Kapat:** "Kapatınca fatura kes" onay kutusu (bağlantı varsa; varsayılan işaretsiz, §12.3). Kapatma başarılı olunca fatura akışı başlar — kapatmayı asla bekletmez/bozmaz.
4. **Sipariş listesi:** "Fatura" sütunu/rozeti (e-A / e-F / işleniyor / hata) + filtre "Faturası kesilmemiş tamamlanan siparişler".
5. **Faturalar sayfası** (`/admin/invoices`): liste (tarih, no, alıcı, tür, tutar, durum), arama, tarih filtresi, Excel; HATA'dakiler üstte "Tekrar Dene".
6. **Müşteri formu / firma sayfası:** Fatura Bilgileri bölümü (vergi dairesi, adres, il/ilçe, e-posta); "Mükellef mi?" sorgu düğmesi (e-Fatura etiketi gösterir, birden fazlaysa seçtirir).
7. **Ekstre (Faz 3):** "Bu ayı faturala" → seçili ayın faturasız TAMAMLANDI siparişleri tek fatura (satırlar araç/plaka bazında gruplanır).
8. **Kullanım Kılavuzu:** yeni bölüm.

WhatsApp gönderimi: mevcut teklif/ekstre gönderimindeki gibi `wa.me` metni + **bizim** imzalı PDF linkimiz (`/api/public/invoice-pdf/<token>`, 30 gün; her açılışta sağlayıcıdan alıp akıtır).

---

## 9. API uçları (bizim)

| Method | Uç | İzin |
|---|---|---|
| GET | `/api/einvoice/connect` → yönlendirme | admin |
| GET | `/api/einvoice/callback` | admin (state ile) |
| GET/PATCH/DELETE | `/api/einvoice/connection` (ayarlar, kasa eşlemesi, bağlantı kes) | admin |
| GET | `/api/einvoice/accounts` (Paraşüt kasa/banka listesi) | admin |
| GET | `/api/einvoice/inbox?vkn=` (mükellef sorgusu) | `invoices.issue` |
| GET | `/api/invoices` (liste, filtre, sayfalı) | `invoices.view` |
| POST | `/api/invoices` `{ order_ids[], issue_date, buyer{…}? }` | `invoices.issue` |
| GET | `/api/invoices/:id` · `/api/invoices/:id/status` (yoklama, bir adım ilerletir) | `invoices.view` |
| POST | `/api/invoices/:id/retry` | `invoices.issue` |
| POST | `/api/invoices/:id/cancel` | `invoices.cancel` |
| GET | `/api/invoices/:id/pdf` | `invoices.view` |
| GET | `/api/public/invoice-pdf/:token` | herkese açık, imzalı |
| GET | `/api/cron/einvoice-sweep` | CRON_SECRET |

İzinler (`src/lib/permissions.ts`): `invoices: ["view", "issue", "cancel"]`; sayfa `/admin/invoices` → `invoices`. Bağlantı ayarları admin'e özel. Audit: `einvoice.connect/disconnect`, `invoice.issue/retry/cancel`.

Sorgular `src/lib/queries.ts` + AFFECTS'e eklenir (fatura kesilince sipariş listesi/detay da tazelenir).

---

## 10. Fazlar

| Faz | İçerik | Bağımlılık |
|---|---|---|
| **0 — Hazırlık** (erişimsiz yapılabilir) | Şema; ek özellik hakkı + Süper Admin "Hediye Et" + kapı (§13.1, 13.3, 13.4); müşteri fatura bilgileri formu; hizmet KDV oranı; `secretBox`; tutar/KDV hesabı + birim testleri; sağlayıcı arayüzü ve **sahte (mock) sağlayıcı** (dev'de uçtan uca akış denenebilsin); sipariş kilidi | — |
| **1 — Tekli fatura** | OAuth bağlantı + kurulum; contact/invoice/formalize/poll/pdf adımları; sipariş detayı kartı; Ödeme Al'da kutucuk; Faturalar sayfası; cron süpürme | Paraşüt client_id + test hesabı |
| **2 — Tahsilat ve iptal** | Kasa eşlemesi + tahsilat işleme; e-Arşiv iptal; e-Fatura red takibi; WhatsApp PDF linki; liste filtreleri | Faz 1 |
| **Satış** | iyzico tek seferlik satın alma (§13.2), fiyat ekranı, tanıtım kartı | Faz 0 (Paraşüt'ten bağımsız; modül satışa açılmadan önce) |
| **3 — Filo** | Ekstreden aylık toplu fatura; seçili siparişleri tek faturada birleştirme | Faz 2 |

Faz 0 bitince dev'de mock sağlayıcıyla tüm ekranlar ve akış çalışır; erişim gelince yalnızca `parasut.ts` gerçek isteklerle doldurulup Paraşüt test hesabında denenir.

**Durum 2026-11-05:** Faz 1 yazıldı — `parasut.ts`, OAuth + PKCE bağlantısı (Paraşüt'ün yeni Keycloak sistemi), günlük bakım cron'u; WhatsApp PDF linki (Faz 2) yapıldı. Staging'de bağlanma, kişi/ürün/fatura oluşturma doğrulandı; resmileştirme Paraşüt staging'de kapalı (e-Belge entegrasyonu), açılması bekleniyor. Kullanıcı kararı: Elevire tek tıkla sonuna kadar götürür (taslakta bırakma yok). Kalan: kasa eşleme + tahsilat (Ustalas'a soruluyor), aylık filo faturası (Faz 3), iyzico satın alma (şimdilik elle).

**Durum 2026-10-30:** Faz 0 tamam ve Faz 1'in sağlayıcıdan bağımsız kısmı da yapıldı (motor, uçlar, sipariş kartı, Fatura Kes penceresi, Faturalar sayfası, "Kapatınca fatura kes"). Kalan: `parasut.ts` + OAuth bağlantısı + günlük süpürme cron'u (Faz 1), kasa eşleme ekranı, WhatsApp PDF linki, red takibi (Faz 2), aylık filo faturası (Faz 3), iyzico satın alma (Satış). Ayrıntı: lastik-servis-projesi.md Bölüm 27.

---

## 11. Paraşüt'e sorulacaklar (destek@parasut.com)

E-postada sorulması gerekenler (tam liste: referans §15):

1. API hangi pakette açık, ek ücret var mı? Kontör API'de de belge başı 1 mi?
2. **Partner/ISV:** tek `client_id` ile, birbirinden bağımsız çok sayıda Paraşüt müşterisi `authorization_code` ile bağlanabilir mi? (Bu olmazsa tasarımın bağlantı kısmı değişir.)
3. Yönlendirme adresi kaydı: prod + dev; `state` geri dönüyor mu?
4. Test (sandbox) ortamı ve kimlik bilgileri; test e-belgeleri GİB test ortamına mı gidiyor?
5. Hız sınırı token başına mı, client başına mı? Aşılınca hangi yanıt?
6. Refresh token ömrü; kullanıcı şifre değiştirince ne olur; iptal (revoke) ucu var mı?
7. `DELETE /sales_invoices/{id}/cancel` resmileşmiş e-Arşivi GİB'de de iptal ediyor mu?
8. Ürünsüz (serbest metin) fatura satırı resmileştirmede kabul ediliyor mu?
9. Aynı `invoice_series`+`invoice_id` ile ikinci fatura reddediliyor mu?
10. e-Arşiv'i Paraşüt müşteriye otomatik e-postalıyor mu, kapatılabilir mi?
11. Webhook ucu var mı (topluluk kütüphanelerinde geçiyor, resmi belgede yok)?
12. Birden çok e-Fatura etiketi olan mükellefte `to` boş bırakılırsa varsayılanı seçiyorlar mı?

---

## 12. Kullanıcı kararları (2026-10-30)

1. **Sipariş tutarları her zaman KDV dahil.** Kodda KDV hariç hesap yalnızca Teklifler'de var; teklif siparişe dönüşürken KDV eklenmiş hâle çevriliyor (`orderLinePrices`, `src/lib/quotes.ts`). Faturada net tutar `computeQuoteTotals`'ın "dahil" yoluyla aynı şekilde ayrıştırılır (ortak yardımcıya taşınır).
2. **KDV varsayılan %20.** Hizmet bazında oran alanı (`services.vat_rate`) yine eklenir ama boş = %20; ekranda yalnızca Hizmetler'de gelişmiş alan olarak durur.
3. **Ödeme Al & Kapat'taki "Kapatınca fatura kes" kutusu varsayılan işaretsiz.** Firma ayarı yok (gerekirse sonra).
4. **Şimdilik yalnızca TAMAMLANDI siparişe fatura.** Cari (parası alınmamış) siparişe fatura sonradan istenebilir; veri modeli buna engel değil (sipariş durumu kontrolü tek yerde, `canInvoiceOrder`).
5. **Bireysel müşteride TC kimlik no istenir; baştan "TC vermek istemiyor" seçeneğiyle.** Ekran 11 haneyi ve TCKN algoritmasını doğrular. Seçenek işaretlenirse GİB'in nihai tüketici yer tutucusu `11111111111` gönderilir (algoritma kontrolü bu değer için atlanır). Seçim müşteri kaydına yazılmaz — her faturada yeniden sorulur, böylece sonradan TC veren müşteri kendiliğinden doğru faturalanır. Fatura satırında `buyer_tax_number = '11111111111'` olarak saklanır.
6. **Ücretli ek özellik, tek seferlik ödeme**; aylık/yıllık planlara dahil değil, abonelik sürdükçe kullanılır. **Deneme süresinde yok** — yalnızca aylık/yıllık abone olan firma satın alır ve kullanır. Ustalas'a Süper Admin'den hediye olarak açılacak. → §13.

## 13. Ek özellik: tek seferlik satın alma (kullanıcı kararı 2026-10-30)

**Model:** e-Fatura modülü aylık/yıllık plana dahil değil. Firma **bir kez** öder; **aboneliği sürdükçe** kullanır. Tekrarlayan ücret yok, abonelik fiyatı değişmez.

### 13.1 Hak (entitlement)

```sql
-- Genel ek özellik tablosu: ileride başka modüller de aynı yoldan satılır.
CREATE TABLE IF NOT EXISTS tenant_addons (
  tenant_id      INT NOT NULL REFERENCES tenants(id),
  addon          VARCHAR(30) NOT NULL,              -- 'einvoice'
  source         VARCHAR(10) NOT NULL CHECK (source IN ('purchase','grant')),
  price_paid     DECIMAL(10,2),                     -- satın almada ödenen (grant'ta NULL)
  iyzico_payment_id VARCHAR(50),                    -- iade/IFN eşlemesi için
  granted_by     INT REFERENCES users(id),          -- grant'ta Süper Admin
  note           TEXT,
  revoked_at     TIMESTAMPTZ,                       -- iade/fraud/elle geri alma
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, addon)
);
-- Satılık ek özelliklerin fiyatı (sabit TL, Süper Admin belirler; platform_pricing ile aynı ilke)
CREATE TABLE IF NOT EXISTS addon_pricing (
  addon      VARCHAR(30) PRIMARY KEY,
  price      DECIMAL(10,2) NOT NULL CHECK (price > 0),
  is_on_sale BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Kullanım kuralı** (`hasAddon(tenant, 'einvoice')`, `src/lib/addons.ts`, saf + test):
`tenant_addons` satırı var **ve** `revoked_at IS NULL` **ve** firma **ücretli aboneliğe sahip**: `billing_status = 'active'` ve `!isBillingLocked(tenant)` (iptal edilmiş ama ödenmiş dönemi süren abonelik dahil) **ya da** `billing_status = 'exempt'`.

- **Deneme süresinde modül yok (kullanıcı kararı 2026-10-30):** `trialing` firma satın alamaz, kartta "Aylık veya yıllık abone olduktan sonra satın alabilirsiniz" yazar ve abonelik düğmesine yönlendirir. Satın alma ucu da (`/api/billing/addons/checkout`) sunucuda aynı kontrolü yapar (409 `subscription_required`).
- Abonelik biterse modül **uyur**; firma yeniden abone olunca tekrar ödemeden açılır (hak silinmez).
- **Ustalas** (`exempt`): Süper Admin "Hediye Et / Elle Aç" ile `source='grant'` satırı ekler — ödeme yok. Hediye de kullanım kuralına tabidir (deneme süresindeki bir firmaya hediye edilse bile abone olana kadar çalışmaz).

### 13.2 Satın alma akışı (iyzico tek seferlik ödeme)

Mevcut abonelik `/v2/subscription/checkoutform` kullanıyor; tek seferlik ödeme için iyzico'nun **normal Checkout Form**'u (`/payment/iyzipos/checkoutform/initialize/auth/ecom` + `…/auth/ecom/detail`) kullanılır. Aynı API anahtarları, aynı `iyzicoRequest` imzalama.

1. `/admin/billing` → "Ek Özellikler" kartı: e-Fatura modülü, fiyat (`addon_pricing`), "Satın Al" (yalnızca firma sahibi admin, yalnızca ücretli abonelikte — §13.1; `is_on_sale` değilse kart görünmez).
2. Fatura Bilgileri (VUK 231/5) abonelikteki gibi önce zorunlu — mevcut `/api/billing/invoice-info` aynen.
3. `POST /api/billing/addons/checkout {addon}` → `iyzico_checkout_sessions`'a satır (`plan` yerine yeni `purpose='addon:einvoice'` kolonu), `basketItems` tek kalem, `conversationId` = session id, fiyat **sunucuda** `addon_pricing`'den.
4. iyzico callback → `POST /api/billing/addons/callback` → `retrieve` → `paymentStatus=SUCCESS` ve tutar `addon_pricing.price` ile eşitse transaction içinde `tenant_addons` INSERT … ON CONFLICT DO NOTHING (tekrar teslim/çift tıklamaya karşı idempotent) + `billing_events: addon.purchase`.
5. **Yetim ödeme:** mevcut tutarlılık kontrolü (iyzico'da ödendi, callback DB'ye yazmadı) `purpose='addon:*'` oturumlarını da tarar ve hakkı yazar.
6. **IFN (fraud) / iade:** `iyzico_payment_id` ile eşlenir → `revoked_at` + `billing_events`. İade elle (iyzico panelinden) yapılırsa Süper Admin "Geri Al" ile `revoked_at` yazar.
7. Yeyu'nun kendi faturası: tek seferlik satış için de VUK 7 gün kuralı geçerli; abonelik tahsilatlarında nasıl kesiliyorsa (İşNet) aynı yoldan, Süper Admin'deki faturalandırma olaylarında listelenir.

### 13.3 Kapı davranışı

- Hak yokken: menüde Faturalar ve Ayarlar'daki e-Fatura bölümü yerine **tanıtım kartı** ("Siparişten tek tuşla e-Fatura/e-Arşiv — Satın Al"); sipariş ekranında "Fatura Kes" görünmez. `/api/einvoice/*`, `/api/invoices*` → 403 `addon_required`.
- Hak uyuduğunda (abonelik kilidi) zaten tüm panel kilitli — ek bir şey gerekmez; açık (`ISLENIYOR`) faturaları cron yine sonuçlandırır.
- Hak geri alınırsa (`revoked_at`): yeni fatura kesilemez; kesilmiş faturalar ve PDF'ler görüntülenebilir kalır (yasal saklama). Paraşüt bağlantısı silinmez.
- `hasAddon` sonucu `/api/auth/me` yanıtına `addons: ['einvoice']` olarak eklenir (menü ve ekranlar ek istek atmasın; mobilde de aynı).

### 13.4 Süper Admin

- Firma detayı → "Ek Özellikler": durum (yok / satın alındı tarih+tutar / hediye / geri alındı), "Hediye Et", "Geri Al".
- Fiyatlandırma ekranı → ek özellik fiyatı ve satışta mı anahtarı.
- Firma silme sırasına `tenant_addons` (`src/lib/tenantDeletion.ts`).

Kontör ve Paraşüt aboneliği lastikçinin kendi Paraşüt hesabından ödenir; bizim tek seferlik ücretimizden ayrıdır — satın alma kartında açıkça yazılır.
