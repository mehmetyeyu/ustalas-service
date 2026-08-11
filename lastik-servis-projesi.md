# Lastik Servis Yönetim Sistemi — Proje Spesifikasyonu

## Genel Bakış

Lastik, rot ve balans hizmeti veren bir oto servis firması için web tabanlı müşteri, sipariş, stok ve depolama yönetim uygulaması.

---

## Teknoloji Yığını

| Katman | Teknoloji |
|---|---|
| Framework | **Next.js 14** (App Router) — frontend + backend tek projede |
| Stil | Tailwind CSS |
| Veritabanı | **PostgreSQL** (Neon serverless) |
| Sorgu | `@neondatabase/serverless` (`Pool` — WebSocket tabanlı, transaction destekli) |
| Auth | JWT tabanlı kimlik doğrulama (`jose` + httpOnly cookie) |
| Şifreleme | bcryptjs |
| Grafikler | Recharts |
| Excel | `xlsx` (import/export) |

---

## Roller

| Rol | `role` değeri | Açıklama |
|---|---|---|
| **Karşılama Görevlisi** | `staff` | Giriş yapar — sadece sipariş oluşturma ekranına (`/`) erişir. |
| **Yönetici** | `admin` | Kullanıcı adı + şifre ile giriş yapar. Tüm panele (`/admin/*`) erişir. |

> `/` dahil tüm sayfalar `middleware.ts` ile korunur — geçerli bir oturum (JWT cookie) olmadan hiçbir sayfa (login hariç) açılmaz. `/admin/*` ayrıca `role = 'admin'` şartı arar.

Kullanıcı oluşturma ve rol atama artık `/admin/users` ekranından (yönetici) yapılır — bkz. Bölüm 11.

---

## Modüller

### 1. Sipariş Oluşturma Ekranı (Karşılama Görevlisi)

**Erişim:** `/` — oturum açmış herkes (admin olması gerekmez).

**Alanlar:**
- Araç Plakası (zorunlu, otomatik büyük harf, boşluklar temizlenir)
- Müşteri Adı (opsiyonel, `customers` dizininden otomatik tamamlanır; seçilince telefon biliniyorsa otomatik dolar)
- Müşteri Telefonu (opsiyonel)
- **İşlem Satırları** (en az bir tanesi zorunlu) — her satırda:
  - **Yapılan İşlem** — `services` tablosundan dinamik beslenir veya serbest yazılır.
  - **Tedarikçi** — normal işlemlerde `suppliers` dizininden serbest seçilir/yazılır, varsayılan **"Servis İşçiliği"**. **Lastik Satışı / Jant Satışı / İkinci El Lastik / İkinci El Jant** işlemlerinde varsayılan boş gelir (gerçek bir tedarikçi seçilmesi beklenir).
  - **Stok Kodu** — yalnızca ürün/parça satışı işlemlerinde (yukarıdaki 4 işlem) gösterilir; işçilik işlemlerinde sütun tamamen gizlidir. **Sadece "Lastik Satışı"nda** bu alan Ürün Kataloğu'ndaki stoğa bağlı bir seçicidir (bkz. aşağı); diğer 3 üründe serbest metindir.
  - **Ebat** — yalnızca "Lastik Satışı" satırında gösterilir (diğer işlemlerde sütun gizli); seçilen partiden otomatik dolar.
  - Adet (varsayılan 1)
  - **Tutar (₺)** — satırın toplam tutarıdır (adet dahil, birim fiyat değil); Yapılan İşlem mevcut bir hizmetle eşleşirse otomatik doldurulur.
  - Maliyet (₺) (varsayılan 0)
  - **Kar (₺)** — Tutar − Maliyet, salt okunur, canlı hesaplanır.
  - "+ Satır Ekle" ile yeni satır eklenir, birden fazla satırdaysa "Sil" ile kaldırılır.
- Notlar (serbest metin, sipariş geneli, opsiyonel)

**"Lastik Satışı" ile stok bağlantısı:**
1. Tedarikçi seçilir — **tüm tedarikçiler** listelenir (Ürün Kataloğu'nda stoğu olsun olmasın); stoğu olmayan bir tedarikçi seçilirse Stok Kodu/parti önerisi boş gelir, elle girilebilir ama gerçek bir stok bağlantısı (ve dolayısıyla stok düşümü) kurulmaz.
2. Stok Kodu yazılır/seçilir — o tedarikçide stoğu olan ürün kodları önerilir (`/api/products/stock-codes`).
3. Kod seçilince altında **Üretim Haftası/Yılı** seçici belirir — o kod+tedarikçiye ait, stoğu olan partiler listelenir (`/api/products/stock-batches`, "10/26 — Stok: 9" biçiminde).
4. Parti seçilince **Ebat** otomatik dolar; **Tutar/Maliyet** o partinin (miktar ağırlıklı ortalama) Satış/Alış fiyatı × Adet olarak otomatik hesaplanır — elle değiştirilebilir, Adet değişirse otomatik yeniden hesaplanır.
5. Adet, seçilen partinin mevcut stoğunu aşarsa alan kırmızı çerçeveli uyarır; sipariş kaydedilirken sunucu da aynı kontrolü yapar (yetersiz stokta 400 döner, sipariş oluşmaz).
6. Sipariş kaydedilince (`POST /api/orders`) seçilen partinin `products.stock_qty`'sinden Adet kadar düşülür (`order_services.product_id` ile bağlantı kurulur). Satır silinirse/miktarı azaltılırsa stok geri eklenir; sipariş tamamen silinirse tüm bağlı satırların stoğu geri eklenir (bkz. `src/lib/productStock.ts`).

**Hizmet/fiyat eşleştirme:**
- Yapılan İşlem adı mevcut `services` kaydıyla eşleşirse ve o hizmete fiyat tanımlıysa Tutar otomatik gelir — ama yalnızca satırda **henüz bir tutar yokken**; İşlem alanında arama yapıp aynı hizmeti yeniden seçmek zaten girilmiş bir tutarı ezmez.
- Eşleşmeyen bir isim girilirse, sipariş kaydedilirken o isimle otomatik yeni bir `services` kaydı (fiyatsız) açılır (`src/lib/serviceCatalog.ts`) — hem bu ekran hem Sipariş Listesi'ndeki Excel içe aktarma aynı mantığı kullanır.

**Davranış:**
- Canlı toplam (tüm satırların Tutar'ları toplamı) gösterilir.
- Kaydet butonuna basınca sipariş `BEKLEMEDE` statüsüyle, ödeme tipi boş olarak kaydedilir — ödeme/fatura bilgisini yönetici sonradan girer.
- Başarılı kayıt sonrası ekran sıfırlanır ve onay mesajı gösterilir.

---

### 2. Yönetici Girişi

- `/admin/login` rotasında kullanıcı adı + şifre formu.
- Başarılı girişte JWT token httpOnly cookie olarak saklanır (varsayılan geçerlilik 8 saat).
- Tüm yönetici sayfaları ve tüm API uçları (bkz. Güvenlik Notları) korumalıdır.

---

### 3. Yönetici Paneli — Sipariş Listesi

**Görünüm:**
- Satır bazlı tablo: her sipariş satırı (`order_services` kalemi) kendi tablo satırında gösterilir — birden fazla işlemi olan bir sipariş birden fazla tablo satırı kaplar, kaynak Excel'deki gibi.
- Varsayılan sıralama en yeniden eskiye; her sütun başlığına tıklanarak sıralama değiştirilebilir (Sipariş No, Tarih, Müşteri, Plaka, Yapılan İşlem, Tedarikçi, Stok Kodu, Ebat, Adet, Tutar, Maliyet, Kar, Ödeme Şekli, Açıklama, Statü) — sıralama sunucuda uygulanır.
- Sütun görünürlüğü özelleştirilebilir (`localStorage`).
- **Sayfalama:** sunucu tarafında, sayfa başına kayıt sayısı seçilebilir (20/50/100/200/500, varsayılan 20).

**Filtreleme:**
- **Hızlı Ara** kutusu: tek bir metni Plaka/Müşteri/Tedarikçi/Stok Kodu/Ebat alanlarında aynı anda (VEYA) arar.
- **"Filtrele" modalı** — daha isabetli, alan bazlı filtreler, hepsi birbiriyle VE mantığıyla birleşir:
  - Tarih (Bugün / Bu Hafta / Bu Ay / Özel Aralık), Statü (Beklemede / Tamamlandı)
  - Müşteri, Plaka, Stok Kodu, Ebat (serbest metin)
  - **Yapılan İşlem** ve **Tedarikçi** — kataloglardan (`/api/services`, `/api/suppliers`) beslenen, checkbox'lı **çoklu seçim** dropdown'ları (kendi içlerinde VEYA)
  - **Ödeme Şekli** — sabit bir liste değil, gerçekten kullanılmış değerlerden (`/api/orders/payment-types`) beslenen aynı çoklu seçim dropdown'u (ör. "FB Lastik Mail Order" gibi dinamik tedarikçi+"Mail Order" kombinasyonları da listelenir)
  - Aktif filtre sayısı buton üzerinde rozet olarak görünür; "Filtreleri Temizle" ile tek tıkla sıfırlanır.

**İşlemler:**
- "Detay →" ile sipariş detayına gidilir; detaydan "Düzelt" (tam ekran) ile satırlar (Yapılan İşlem, Tedarikçi, Stok Kodu, Ebat, Adet, Tutar, Maliyet, ödeme tipi, ve Lastik Satışı'nda parti bağlantısı dahil) düzenlenebilir — düzenleme, stok bağlantılı satırlarda stoğu farkına göre otomatik günceller (bkz. Bölüm 1).
- "Sil" ile sipariş (tüm satırlarıyla, stok bağlantılı satırların stoğu geri eklenerek) kalıcı olarak silinir.

**Excel İçe Aktar:** Muhasebe programından dışa aktarılan `.xlsx` okunur, gruplanır (aynı tarih+müşteri+plaka tek siparişte birleşir; Perakende/plakasız satırlar birleştirilmez), hizmet eşleştirmesi otomatik yapılır, `import_ref` ile tekrar aktarımda mükerrer kayıt oluşmaz. Tekilleştirme tüm-ya-da-hiç çalışır (satır bazlı otomatik birleştirme yapılmaz) — kaynak dosya sonradan düzeltilip (ör. unutulan bir satır eklenip) aynı gruba ait bir sipariş tekrar yüklenirse, o sipariş yine mükerrer sayılıp atlanır, **ama** şu anki dosyadaki satır sayısı veritabanındakinden farklıysa kullanıcı ayrıca (turuncu) bir uyarıyla bilgilendirilir — sessizce veri kaybı olmaz, elle kontrol/ekleme gerekir.

---

### 4. Sipariş Detayı

Plaka, sipariş no, statü; müşteri bilgileri; hizmet listesi (her satırda miktar, ebat, tedarikçi, kendi ödeme tipi rozeti); toplam; indirim varsa ayrı satır; notlar; oluşturulma tarihi ve ödeme bilgisi; "Ödeme Al & Kapat" (BEKLEMEDE ise) ve "Düzelt" aksiyonları.

**"Düzelt" ekranı:** tam ekran açılır (üstte "← Geri" ile normal görünüme dönülür, kaydetmeden çıkar); işlem satırları tablosunda arama/seçim dropdown'ları (Yapılan İşlem, Tedarikçi, Ürün Kodu) `document.body`'e portal ile taşınır — böylece tablonun yatay kaydırma alanı tarafından kırpılmaz. Zaten bir stok partisine bağlı (product_id dolu) satırların güncel stoğu, ekran açılır açılmaz çekilir (`GET /api/products/:id`) — Adet, o partinin gerçek kalan stoğunu (bu satırın zaten tuttuğu miktar dahil) aşarsa parti seçiciye hiç dokunulmadan da kırmızı uyarı görünür.

---

### 5. Ödeme & Sipariş Kapatma

**Ödeme Tipleri:** Nakit, POS, Cari, Fatura Edildi., Garanti Hesap, Nazım Hesap, Sait Hesap, **Mail Order** (seçilince ikinci bir tedarikçi seçici belirir; nihai değer `"<Tedarikçi> Mail Order"` olarak saklanır — Excel'deki tarihi verilerle aynı format).

**Parçalı ödeme:** "Ödeme Al & Kapat" tek bir tutar/tip yerine **birden fazla (Ödeme Tipi, Tutar) girişi** kabul eder (ör. 7.000₺ POS + 15.000₺ Garanti Hesap) — "+ Ödeme Ekle" ile satır eklenir, her satırın kendi tip+tutarı olur. Bu girişler `order_payments` tablosuna kaydedilir; `orders.paid_amount` bunların toplamıdır, `orders.payment_type` özet değeridir (tek tipse o değer, karışıksa `"Karışık"`). Girilen toplam sistem tutarından azsa (indirim) turuncu bir uyarı gösterilir; **sistem tutarını aşarsa kırmızı uyarıyla birlikte "Onayla" devre dışı kalır** — hem istemci hem sunucu (`PATCH`/`PUT`) toplamın `total_amount`'ı aşmasını reddeder.

**Eski (satır bazlı) ödeme tipi:** `order_services.payment_type` hâlâ şemada var ve Excel içe aktarımında satır bazında doldurulur (aynı siparişteki farklı işlemler farklı ödenmiş olabilir) — ama "Ödeme Al & Kapat" akışı artık buna dokunmaz, sadece `order_payments`'a yazar. Sipariş Listesi'ndeki "Ödeme Şekli" sütunu ve Raporlar'daki "Ödeme Tipine Göre Gelir" kırılımı, bir siparişin `order_payments` kaydı varsa onu, yoksa (eski/içe aktarılmış sipariş) satır bazlı değeri kullanır — `COALESCE`/`NOT EXISTS` ile iki kaynak asla çift sayılmaz.

**Akış:** Yönetici "Ödeme Al & Kapat"a basar → modal, sistem tutarını gösterir, varsayılan olarak tek bir satır (Nakit, tam tutar) sunar, gerekirse birden fazla ödeme girişine bölünür → onaylanınca sipariş `TAMAMLANDI` olur, `payment_date`/`paid_amount`/`order_payments` kaydedilir.

**Not:** `PATCH` sunucu tarafında siparişin mevcut statüsünü kontrol eder — zaten `TAMAMLANDI` bir sipariş tekrar kapatılamaz (409 döner). Bu, arayüzün "Ödeme Al & Kapat" butonunu zaten sadece `BEKLEMEDE` iken göstermesiyle uyumlu, ama API'ye doğrudan istek atılsa bile mevcut ödeme kaydının üzerine sessizce yazılmasını engeller.

**Ödeme düzeltme:** Zaten kapanmış bir siparişin ödeme girişlerini (tip/tutar) düzeltmek "Düzelt" ekranından yapılır — sipariş daha önce "Ödeme Al & Kapat" ile kapatıldıysa, satırların altında bir "Ödemeler" bölümü belirir (aynı tip+tutar arayüzü); kaydedilince `PUT /api/orders/:id` mevcut `order_payments` kayıtlarını silip yeni listeyle değiştirir, `orders.paid_amount`/`payment_type`'ı da buna göre günceller. Toplam yeni (düzenlenmiş) sipariş tutarını aşarsa aynı şekilde reddedilir.

---

### 6. İstatistik & Raporlama Sayfası

**Zaman Filtresi:** Ay/Yıl seçici. **Tüm hesaplamalar `orders.created_at`'e (hizmetin girildiği tarih) göredir** — ödeme tarihine göre değil; bir hizmet Temmuz'da girilip ödemesi Ağustos'ta alınsa bile Temmuz raporunda görünür. Gelir hesabında `paid_amount` (NULL ise `total_amount`) kullanılır. **Statüye bakılmaz** — Beklemede siparişler de rakamlara dahildir (stok zaten statüden bağımsız düştüğü için raporlar da tutarlı şekilde statüden bağımsızdır).

- **Ciro/Maliyet/Kâr grafiği** — günlük kırılım.
- **Günlük/Haftalık/Aylık periyot tablosu** — üstteki Ay/Yıl seçiciyle birlikte çalışır.
- **Ödeme Tipine Göre Gelir** — tüm `"<Tedarikçi> Mail Order"` etiketleri tek bir "Mail Order" kutusunda toplanır, tıklanınca tedarikçi kırılımı açılır. Kaynak: `order_payments` (parçalı ödeme) varsa o, yoksa satır bazlı `order_services.payment_type` (bkz. Bölüm 5).
- **En Çok Verilen Hizmetler** — hizmet başına adet ve yüzdelik dağılım.

---

### 7. Hizmet & Fiyat Yönetimi

`/admin/services` — hizmet listesi, ekleme, düzenleme, soft-delete (`is_active = 0`). **Fiyat opsiyoneldir**: fiyatsız hizmetlerde Sipariş Oluşturma ekranında Tutar elle girilir (ör. Lastik Satışı gibi işleme göre değişen kalemler).

---

### 8. Depolama Modülü

**Sayfa:** `/admin/storage` — mevsimlik lastik depolama takibi.

- Sayfalı liste (sayfa başına 20/50/100/200/500 seçilebilir, varsayılan 20), sütun görünürlüğü `localStorage`'da saklanır.
- Plaka/müşteri adına göre arama; 6 aydan eski kayıtlar için "gecikmiş" filtresi.
- **Aktif Depolar** / **Teslim Edilenler** görünüm sekmesi.
- Yeni kayıt / düzenleme modalı; Depo No boş bırakılırsa boşta kalan en küçük numara otomatik atanır.
- **Teslim Et:** kaydı `teslim_edildi = true` yapar, `teslim_tarihi` bugüne set edilir, depo numarası tekrar kullanılabilir hale gelir. Aynı plaka+mevsim için ikinci bir **aktif** kayıt açılamaz (teslim edilmiş eski bir kayıtla çakışmaz — bkz. Veritabanı Şeması notu).
- Etiket yazdırma: A4 sayfa, ikiye bölünmüş A5 etiket (biri çantaya, biri müşteriye).
- Excel import/export.

---

### 9. Ürün Kataloğu

**Sayfa:** `/admin/products` — "Ürünler" ve "Malzeme Hareketleri" olmak üzere iki sekme.

#### Ürünler sekmesi

Her satır bir **PARTİ**dir: aynı Ürün Kodu farklı **Üretim Haftası/Yılı** (DOT kodu, ör. "10/26" = 10. hafta 2026 — takvim tarihi değil) ve/veya farklı **Tedarikçi** ile birden çok partiye ayrılabilir, her partinin kendi stok/fiyatı vardır. Liste **Ürün Kodu bazında gruplanır** (kod tek satır, altında partiler açılıp kapanır).

- **Stoğu 0 olan bir parti listeden (ve stok seçicilerinden) otomatik kalkar** — tükenen tedarikçiler ekranda yer kaplamaz. Geçmişi kaybolmaz, "Malzeme Hareketleri" sekmesinde görünmeye devam eder.
- **Alış Maliyeti (Ort.) / Satış Fiyatı (Ort.)** — ham/son girilen fiyat değil, o partiye (veya kod genelinde tüm partilere) ait tüm stok girişlerinin **miktar ağırlıklı ortalaması**; zararlı satış yapılmaması için.
- **Mevsim** rozeti sadece kod (grup) satırında bir kez gösterilir, her partide tekrarlanmaz.
- **Marka** alanı, mevcut ürünlerde kullanılan markalardan dinamik olarak önerilir (ayrı bir dizin tablosu yok, `products` üzerinden distinct).
- Sütun görünürlüğü özelleştirilebilir (`localStorage`).
- **Sıralama:** Ürün Kodu, Marka, Ebat, Stok sütun başlıklarına tıklanarak sıralanır (sunucuda) — Alış/Satış Fiyatı Ort. ayrı bir sorgudan geldiği için sıralanabilir değildir. Varsayılan: stoğu en fazla olan ürün ilk sırada.
- **Sayfalama:** sayfa başına 20/50/100/200/500 seçilebilir (varsayılan 20).
- **Stok Girişi:** "Yeni Ürün / Parti" formu — Kod+Hafta/Yılı+Tedarikçi mevcut bir partiyle birebir eşleşirse girilen miktar o partinin stoğuna **eklenir** (ezilmez) ve fiyat geçmişine yeni satır düşer; eşleşmezse yeni parti açılır. Alış Maliyeti + Kâr Yüzdesi (%) girilirse Satış Fiyatı otomatik hesaplanır.
- **Düzenle:** grup satırında "Stok Girişi" yanında da bulunur — tek partisi olan ürünlerde doğrudan düzenleme penceresini açar, birden fazla partisi varsa satırı genişletip hangi partinin düzenleneceği seçilir.
- **Partiyi Düzenle:** bir partiyi elle başka bir mevcut partiyle aynı kimliğe (kod+hafta/yılı+tedarikçi) getirirseniz iki satır **birleştirilir** (stok toplanır, fiyat geçmişi taşınır, kaynak satır silinir) — çakışma hatası vermez.
- **Fiyat Geçmişi:** her partinin tüm stok girişlerini (tarih, miktar, alış/satış fiyatı) gösteren salt okunur liste.

#### Malzeme Hareketleri sekmesi

Stok durumundan bağımsız, geriye dönük tam hareket kaydı — iki tür satır:
- **Giriş** — Stok Girişi kayıtları (`product_stock_entries`).
- **Çıkış** — bir partiye bağlı sipariş satışları (`order_services.product_id`); **müşteri adı + plaka** ile birlikte gösterilir, fiyatlar (Tutar/Maliyet toplamı Adet'e bölünerek) birim fiyata çevrilir ki Giriş satırlarıyla aynı birimde kıyaslanabilsin.
- Her satırda o partinin **Güncel Stok** durumu da görünür (0 olsa bile).
- Arama: ürün kodu, marka, tedarikçi, müşteri adı, plaka.
- Sayfalama: sayfa başına 20/50/100/200/500 seçilebilir (varsayılan 20).

#### Excel Import / Export

- Import: Kod/Marka/Ebat/Stok (+opsiyonel Tedarikçi/Mevsim/Üretim Haftası-Yılı/fiyatlar) sütunları eşleştirilir; üretim haftası/yılı olmayan satırlar tek bir "temel" satırı (kod bazlı) günceller, olan satırlar parti olarak eklenir/güncellenir. 2 haneli yıl (`"26"`) otomatik `2026`'ya normalize edilir.
- Export: tüm partiler, Marka/Ebat/Tedarikçi ayrı sütunlarda.

---

### 10. Müşteri & Tedarikçi Dizinleri

`/admin/customers`, `/admin/suppliers` — Sipariş Oluşturma ekranındaki Müşteri/Tedarikçi alanları için öneri/yönetim listeleri. Yeni bir sipariş yeni bir isimle kaydedildiğinde ilgili dizine otomatik eklenir (`src/lib/directories.ts`); `orders.customer_name` ve `order_services.supplier` serbest metin kalır (FK değildir).

---

### 11. Profil & Kullanıcı Yönetimi

Üst menüdeki **Ayarlar** açılır menüsü altında iki sayfa:

**Profil** (`/admin/profile`) — herhangi bir oturum açmış kullanıcı erişir:
- Kullanıcı adı ve rolünü görüntüler (salt okunur).
- Şifre değiştirme — mevcut şifrenin doğrulanmasını zorunlu kılar (`PATCH /api/auth/password`).

**Kullanıcılar** (`/admin/users`) — yalnızca `admin`:
- Yeni kullanıcı oluşturma (kullanıcı adı, şifre, rol: Yönetici/Karşılama Görevlisi).
- Satır üzerinden rol değiştirme (dropdown, anında kaydeder) ve şifre sıfırlama (admin, hedef kullanıcının mevcut şifresini bilmeden sıfırlar).
- Kullanıcı silme.
- **Kendi kaydınız üzerinde kısıtlı**: kendi rolünüzü bu ekrandan değiştiremez, kendi şifrenizi buradan sıfırlayamaz (şifre değişimi için Profil'e yönlendirilirsiniz) ve kendi hesabınızı silemezsiniz — kazara kendi yetkinizi kaybetmenizi engeller.
- **Son yönetici koruması**: sistemde tek `admin` kalmışsa o kullanıcının rolü değiştirilemez veya kendisi silinemez (bkz. Güvenlik Notları).

---

## Ortam Değişkenleri (.env.local)

```env
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
JWT_SECRET=cok_gizli_bir_anahtar_buraya
JWT_EXPIRES_IN=8h
```

---

## Veritabanı Şeması (PostgreSQL)

Tam ve güncel şema `database/schema.sql` dosyasındadır (idempotent — tekrar çalıştırılabilir). Özet:

| Tablo | Amaç |
|---|---|
| `services` | Yapılan İşlem listesi; `price` opsiyonel |
| `orders` | Siparişler; `status`, `payment_type` (serbest metin), `paid_amount`, `import_ref` (Excel tekilleştirme) |
| `order_services` | Sipariş satırları; `quantity`, `cost_price`, `supplier`, `stock_code`, `size_desc`, işlem bazlı `payment_type` (yalnızca Excel içe aktarımı doldurur), ve `product_id` (Lastik Satışı'nda bağlı parti — bkz. Bölüm 1 ve `src/lib/productStock.ts`) |
| `order_payments` | "Ödeme Al & Kapat" ile kapatılan siparişlerin parçalı ödeme kayıtları — `order_id`, `payment_type`, `amount` (bkz. Bölüm 5) |
| `customers`, `suppliers` | Öneri/yönetim dizinleri |
| `users` | Kullanıcılar — `role` (`admin`/`staff`), şifre bcrypt hash |
| `storage` | Depolama kayıtları; `teslim_edildi`/`teslim_tarihi` ile teslim takibi |
| `products` | Ürün partileri; benzersizlik `(code, production_year, production_week, COALESCE(supplier,''))` (tarihli) veya `(code)` (tarihsiz "temel" satır) |
| `product_stock_entries` | Her partinin stok girişi / fiyat geçmişi (Malzeme Hareketleri'nin "Giriş" kaynağı) |

**İndeksler** (performans): `orders(created_at)`, `orders(status)`, `orders(customer_name)` (Müşteri Detayı/silme kontrolü için), `order_services(order_id)`, `order_services(service_id)`, `order_services(product_id)`, `order_services(supplier)`, `order_services(payment_type)` (Sipariş Listesi'ndeki Filtrele modalının çoklu seçim filtreleri için), `order_payments(order_id)`, `product_stock_entries(product_id)`, `storage(teslim_edildi)`, `storage(created_at)`, `storage(islem_tarihi)`, `storage(depo_no)` (yalnızca aktif kayıtlarda benzersiz — bkz. `storage_active_depo_no_unique`), `products(code)`, `products(supplier)`, `products(season)`, `products` üzerindeki iki benzersizlik indeksi.

**Not — stok bütünlüğü:** `order_services.product_id` seçili bir sipariş satırı, o partinin `products.stock_qty`'siyle her zaman senkron tutulur (satır eklenir/silinir/miktarı değişir/parti değişir → sırasıyla düşülür/geri eklenir/farkı uygulanır/eski geri + yeni düşülür). İşlemler transaction içinde `SELECT ... FOR UPDATE` ile kilitlenir; yetersiz stokta `InsufficientStockError` fırlatılır ve tüm işlem geri alınır.

---

## API Rotaları

| Method | Endpoint | Açıklama |
|---|---|---|
| GET | `/api/orders` | Satır bazlı, sayfalı sipariş listesi — `{ items, total, totalAmount, page, limit }` döner (`totalAmount`: uygulanan filtrelere uyan TÜM satırların toplam tutarı, yalnızca görünen sayfanın değil — aynı COUNT sorgusunda `SUM(unit_price)` ile, ekstra tarama gerektirmeden); filtreler: status, dateFrom/dateTo, customer_name, plate, service_name (çoklu), supplier (çoklu), stock_code, size_desc, payment_type (çoklu), search (hızlı arama, birden çok alanda VEYA); sortBy/sortDir (whitelist tabanlı) |
| POST | `/api/orders` | Yeni sipariş oluştur; `product_id` içeren satırlarda stok düşer |
| GET | `/api/orders/:id` | Sipariş detayı |
| PATCH | `/api/orders/:id` | Siparişi kapat — `{ payments: [{payment_type, amount}, ...] }` (parçalı ödeme, bkz. Bölüm 5) |
| PUT | `/api/orders/:id` | Sipariş + satırları düzenle (id eşleşenler güncellenir, eksik olanlar silinir, yeni olanlar eklenir; stok farkı otomatik uygulanır); `payments` gönderilirse (sipariş daha önce kapatıldıysa) `order_payments` de baştan yazılır (bkz. Bölüm 5, Ödeme düzeltme) |
| DELETE | `/api/orders/:id` | Siparişi sil (bağlı stok geri eklenir, order_services cascade) |
| POST | `/api/orders/import` | Excel'den toplu içe aktar; yanıtta `changedDuplicates` — mükerrer sayılıp atlanan ama satır sayısı değişmiş gruplar |
| GET | `/api/orders/payment-types` | Filtrele modalı için gerçekten kullanılmış Ödeme Şekli değerleri (distinct) |
| GET/POST | `/api/services`, `/api/services/:id` (PATCH/DELETE) | Hizmet yönetimi |
| GET | `/api/reports` | Aylık rapor (`created_at` bazlı) |
| POST | `/api/auth/login`, `/api/auth/logout` | Giriş/çıkış |
| GET | `/api/auth/me` | Oturum bilgisi |
| PATCH | `/api/auth/password` | Kendi şifreni değiştir — mevcut şifre doğrulaması zorunlu |
| GET/POST | `/api/users` | Kullanıcı listesi / oluşturma (admin) |
| PATCH/DELETE | `/api/users/:id` | Rol değiştir, şifre sıfırla, kullanıcı sil (admin) — kendi kaydına rol/şifre değişikliği ve silme engellenir; son admin'in rolü değiştirilemez/silinemez |
| GET/POST | `/api/storage`, `/api/storage/:id` (PATCH/DELETE) | Depolama CRUD (teslim işaretleme dahil) |
| POST/GET | `/api/storage/import`, `/api/storage/export` | Excel içe/dışa aktarma |
| GET/POST | `/api/products`, `/api/products/:id` (PATCH/DELETE) | Ürün/parti CRUD (POST: eşleşen parti varsa stok ekler + fiyat geçmişine düşer); GET (liste) sayfalı, sortBy/sortDir destekler (whitelist: code/brand/size_desc/total_stock) |
| GET | `/api/products/:id` | Tek bir partinin id + güncel stock_qty'si (Sipariş Düzelt'teki stok uyarısı için) |
| GET | `/api/products/:id/history` | Bir partinin fiyat geçmişi |
| GET | `/api/products/movements` | Malzeme Hareketleri (Giriş + Çıkış birleşik, sayfalı) |
| GET | `/api/products/brands` | Mevcut markalar (distinct) |
| GET | `/api/products/stock-codes` | Bir tedarikçide stoğu olan ürün kodları |
| GET | `/api/products/stock-batches` | Bir kod+tedarikçiye ait stoklu partiler (+ ortalama fiyatlar) |
| POST/GET | `/api/products/import`, `/api/products/export` | Excel içe/dışa aktarma |
| GET/POST | `/api/customers`, `/api/customers/:id` (PATCH/DELETE) | Müşteri dizini |
| GET/POST | `/api/suppliers`, `/api/suppliers/:id` (PATCH/DELETE) | Tedarikçi dizini |

---

## Sayfa / Rota Yapısı

```
/                     → Sipariş oluşturma ekranı (oturum gerektirir, admin gerekmez)
/admin/login          → Yönetici girişi
/admin/orders         → Sipariş listesi (admin)
/admin/orders/:id     → Sipariş detayı / düzenleme (admin)
/admin/reports        → İstatistik & raporlama (admin)
/admin/services       → Hizmet & fiyat yönetimi (admin)
/admin/storage        → Depolama yönetimi (admin)
/admin/products       → Ürün Kataloğu + Malzeme Hareketleri (admin)
/admin/customers      → Müşteri dizini (admin)
/admin/suppliers      → Tedarikçi dizini (admin)
/admin/profile        → Profil (oturum açmış herkes)
/admin/users          → Kullanıcı yönetimi (admin)
```

---

## Güvenlik Notları

- `middleware.ts`, `/` ve `/admin/*` sayfa isteklerini korur — ama **API rotalarını (`/api/*`) kapsamaz** (middleware `matcher`'ı `/api/*`'i içermez); her API dosyası kendi `getAuthUser()` kontrolünü kendisi yapar (token geçerliliği). Tüm `route.ts` dosyaları bu deseni takip eder.
- **Rol kontrolü (`role === 'admin'`) artık tüm modüllerde var.** Önce `/api/orders*` denetlendi (bkz. `e7f9022`), ardından aynı denetim `/api/products*`, `/api/storage*`, `/api/customers*`, `/api/suppliers*`, `/api/services*`, `/api/reports`'a da uygulandı: sayfa seviyesinde admin'e kapalı olan uçların (liste, oluştur, düzenle, sil, içe/dışa aktar) **API'den doğrudan çağrıldığında** herhangi bir geçerli (admin olmayan) oturumla erişilebildiği tespit edilip düzeltildi. Karşılama Görevlisi'nin (`/`) sipariş oluşturma ekranı için gerçekten ihtiyaç duyduğu, bilinçli olarak **açık bırakılan** GET uçları: `POST /api/orders`, `GET /api/customers`, `GET /api/suppliers`, `GET /api/services`, `GET /api/products/stock-codes`, `GET /api/products/stock-batches`.
- Bu ikinci denetimde yol boyunca bulunan fonksiyonel/veri bütünlüğü düzeltmeleri: **Depolama Excel içe aktarma tamamen bozuktu** (`ON CONFLICT (plate, mevsim)` hedefi olmayan bir kısıta atıfta bulunuyordu — şema bilinçli olarak böyle bir kısıt koymuyor, bkz. Veritabanı Şeması) — artık `storage/route.ts` POST'taki aynı uygulama-katmanı (aktif kayıt ara, varsa güncelle) deseniyle çalışıyor. **Ürün/parti birleştirmede** (`PATCH /api/products/:id`) geçmiş satışlar (`order_services.product_id`) hedef partiye taşınmıyordu, birleşme sonrası Malzeme Hareketleri'nden kayboluyorlardı — düzeltildi. **Müşteri ekle/güncelle**, boş telefonla tekrar eklenince mevcut telefonu sessizce siliyordu — orders'taki `COALESCE` deseniyle hizalandı. **Depo no** eşzamanlı iki kayıtta çakışabiliyordu — `storage_active_depo_no_unique` kısmi unique index eklendi. **`/api/reports`**, ayda 5 bağımsız sorguyu sırayla ve sargable olmayan `EXTRACT(...)` filtreleriyle (tam tarama) çalıştırıyordu — `Promise.all` ile paralelleştirildi, filtreler `created_at` aralık karşılaştırmasına çevrildi (Türkiye sabit UTC+3 olduğundan ay sınırları JS'de hesaplanır), gereksiz bir toplam-ciro sorgusu kaldırıldı.
- Yönetici şifreleri bcrypt ile hashlenmiştir.
- JWT token süresi varsayılan 8 saat (vardiya süresi), `jose` ile imzalanır/doğrulanır.
- Tüm SQL sorguları parametrik (`$1, $2, ...`) — hiçbir yerde kullanıcı girdisi doğrudan sorgu metnine eklenmez; arama girdileri ayrıca `LIKE` özel karakterlerine (`%`, `_`, `\`) karşı kaçışlanır. Çoklu seçim filtreleri (ör. Sipariş Listesi'ndeki Yapılan İşlem/Tedarikçi/Ödeme Şekli) `= ANY($n)` ile parametrik diziler olarak gönderilir.
- Stok düşümü/geri ekleme işlemleri satır bazlı `FOR UPDATE` kilidi ile eşzamanlılığa karşı korunur (bkz. Veritabanı Şeması notu). Sipariş kapatma (`PATCH /api/orders/:id`) da aynı şekilde siparişi `FOR UPDATE` ile kilitleyip mevcut statüyü kontrol eder — zaten `TAMAMLANDI` bir sipariş tekrar kapatılamaz.
- **Kullanıcı yönetimi eklenirken (bkz. Bölüm 11) yetki modeli sıkılaştırıldı:** `getAuthUser()` artık `role`'ü JWT'nin imzalı payload'ından değil, **her istekte `users` tablosundan taze** okur — JWT yalnızca kimliği (userId) doğrulamak için kullanılır. Bundan önce rol JWT'ye gömülüydü ve token süresi (varsayılan 8 saat) dolana kadar değişmezdi; bu da bir kullanıcı `admin`'den `staff`'a düşürülse veya silinse bile eski yetkisiyle işlem yapmaya devam edebileceği anlamına geliyordu. Artık rolü değiştirilen/silinen bir kullanıcının bir sonraki API isteği anında yeni yetkiyi (veya "kullanıcı yok" durumunu) yansıtıyor. `middleware.ts`'e bilerek dokunulmadı (Edge runtime, yalnızca sayfa kabuğu görünürlüğünü yönetir); gerçek veri erişimi her zaman `getAuthUser()` üzerinden geçtiği için güvenlik sınırı orada tam korunuyor.
- `PATCH /api/users/:id`, hedef `id` isteği atan kullanıcının kendisiyse hem `role` hem `password` alanlarını reddeder — aksi halde bir admin, çalınmış/ele geçirilmiş bir oturumla mevcut şifreyi hiç bilmeden kendi şifresini değiştirip hesabı ele geçirebilir ve gerçek kullanıcıyı kalıcı olarak dışarıda bırakabilirdi (kendi şifreni değiştirmenin tek yolu, mevcut şifre doğrulaması yapan `/api/auth/password`). Aynı endpoint, sistemde tek `admin` kalmışsa o kullanıcının rolünü değiştirmeyi veya silmeyi de reddeder.
