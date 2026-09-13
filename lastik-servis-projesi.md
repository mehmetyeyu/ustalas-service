# Lastik Servis Yönetim Sistemi — Proje Spesifikasyonu

## Genel Bakış

Lastik, rot ve balans hizmeti veren bir oto servis firması için web tabanlı müşteri, sipariş, stok ve depolama yönetim uygulaması. Admin paneli mobil cihazlarda da tam kullanılabilir (responsive) — tablolar, formlar ve modallar küçük ekranlara uyarlanmıştır.

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

## Roller ve İzinler

| Rol | `role` değeri | Açıklama |
|---|---|---|
| **Karşılama Görevlisi / Personel** | `staff` | Kullanıcı adı + şifre ile giriş yapar. Sipariş oluşturma ekranına (`/`) her zaman erişir; ayrıca kendisine tanımlanan sayfa/aksiyon izinlerine göre `/admin/*` altındaki belirli sayfaları da görebilir (aşağıya bkz.) |
| **Yönetici** | `admin` | Kullanıcı adı + şifre ile giriş yapar. Tüm panele (`/admin/*`) her zaman tam yetkiyle erişir — izin sistemi admin'i hiç etkilemez. |

> `/` dahil tüm sayfalar `middleware.ts` ile korunur — geçerli bir oturum (JWT cookie) olmadan hiçbir sayfa (login hariç) açılmaz. `/admin/*` için `staff` rolü, sayfa bazında aşağıdaki izin sistemine tabidir.

Kullanıcı oluşturma ve rol/izin ataması `/admin/users` ekranından (yönetici) yapılır — bkz. Bölüm 15.

### Sayfa/Aksiyon Bazlı İzin Sistemi

Admin rolü değişmeden tam yetkili kalır; `staff` kullanıcılarına ise admin sayfalarının çoğu için (Siparişler, Raporlar, Hizmetler, Depolama, Ürünler, Müşteriler, Tedarikçiler, Masraflar, Randevular, Kasa) **görüntüle / ekle / düzenle / sil** izinleri ayrı ayrı verilebilir — siparişte ve Randevular'da ayrıca bir de **onayla** izni (siparişte Ödeme Al & Kapat, Randevular'da randevu onaylama), Müşteriler'de bir **bakiye yönetimi** (`manage_balance` — Cari'de Tahsilat Al/Borç Ekle, bkz. Bölüm 13) izni, Kasa'da ise sadece **görüntüle/yönet** (`kasa.manage` — kasa oluşturma/düzenleme/silme, transfer, döviz kuru girme) izni vardır (tek doğruluk kaynağı `src/lib/permissions.ts`: `RESOURCE_ACTIONS`). **Kullanıcılar**, **Genel Ayarlar** ve Randevu'nun alt sayfaları olan **Randevu Ayarları**/**Randevu Görünümü** izin sistemine hiç girmez, her zaman yalnızca `admin`'e özeldir (`"__admin_only__"` olarak işaretlidir).

Tek doğruluk kaynağı `src/lib/permissions.ts`'tir (`RESOURCE_ACTIONS`, `PAGE_RESOURCE`, `hasPermission`, `canAccessPath`) — hem sunucu hem istemci bunu import eder. Güvenlik sınırı **üç katmanda** uygulanır:
1. **`middleware.ts`** — sayfa erişimi (staff, izni olmayan bir `/admin/*` sayfasına gitmeye çalışırsa `/`'e yönlendirilir).
2. **Her API route** — asıl/gerçek sınır; her uç kendi `hasPermission(user, "kaynak.aksiyon")` kontrolünü yapar (middleware bypass edilse bile veri sızmaz).
3. **UI** — izni olmayan aksiyon butonları (Düzenle/Sil/Onayla/Yeni Ekle vb.) hiç gösterilmez.

**Login sonrası yönlendirme:** `admin` her zaman `/admin/orders`'a düşer. `staff` artık sabit `/` yerine, izinlerine göre erişebildiği **ilk** sayfaya yönlendirilir (öncelik sırası: Siparişler → Randevular → Depolama → Ürünler → Raporlar → Kasa → Masraflar → Hizmetler → Müşteriler → Tedarikçiler); hiçbir sayfa izni yoksa (yalnızca sipariş oluşturabilen personel) yine `/`'e düşer. `/` (Yeni Sipariş) ekranındaki üst köşede artık herkes için bir "Çıkış" butonu, izni olan `staff` için de "Yönetici Paneli" linki gösterilir — önceden bu alan yalnızca `admin`'e görünürdü.

**Ana admin koruması:** `is_primary_admin` işaretli hesap (varsayılan olarak ilk `admin` kullanıcı) artık hiçbir başka admin tarafından rolü/aktifliği/şifresi/kullanıcı adı değiştirilemez veya silinemez — admin sayısından bağımsız, sabit bir koruma. Bu, Bölüm 15'teki "son (aktif) admin koruması"na **ek** bir katmandır, onun yerine geçmez.

**Bilinen sızıntı düzeltmesi:** `GET /api/customers/:id/orders` yalnızca `customers.view` istiyordu ama sipariş tutarı/ödeme tipi gibi finansal veri döndürüyordu — artık `orders.view` de gerektiriyor.

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
- Başarılı girişte JWT token httpOnly cookie olarak saklanır (varsayılan geçerlilik 12 saat, `JWT_EXPIRES_IN`).
- **Brute-force koruması:** art arda 5 başarısız denemede hesap 15 dakika kilitlenir (`users.failed_attempts`/`locked_until`, DB'de tutulur); kilitliyken girişte 429 + kalan süre mesajı döner. Başarılı girişte sayaç sıfırlanır ve `last_login_at` güncellenir. Devre dışı bırakılmış (`is_active = false`) bir hesapla giriş denemesi 403 ile reddedilir (bkz. Bölüm 15).
- Tüm yönetici sayfaları ve tüm API uçları (bkz. Güvenlik Notları) korumalıdır.
- Giriş sonrası yönlendirme role/izinlere göre değişir — bkz. "Sayfa/Aksiyon Bazlı İzin Sistemi" (Roller bölümü).

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
- **Toplu Ödeme Şekli değiştirme:** tablodaki checkbox sütunuyla birden fazla sipariş satırı seçilip (ör. bir müşterinin "Cari" olarak girilmiş tüm siparişlerini dönem sonunda "Fatura Edildi."ye çekmek gibi) tek seferde `PATCH /api/orders/bulk-payment-type` ile ödeme şekli değiştirilebilir (`orders.edit` izni gerektirir); etkilenen siparişlerin özet `payment_type` alanı `PUT /api/orders/:id` ile aynı mantıkla yeniden hesaplanır. "Ödeme Al & Kapat" ile gerçekten karma (birden fazla farklı tipe bölünmüş, bkz. Bölüm 5) parçalı ödeme girilmiş siparişler, gerçek ödeme kırılımıyla çelişmesin diye bu toplu işlemin dışında bırakılır.

**Varsayılan tarih filtresi:** Sayfa açılışta hangi Tarih filtresiyle (Bugün/Bu Hafta/Bu Ay/Tümü) geleceği Genel Ayarlar'daki `orders_default_date_filter` ayarından okunur (bkz. Bölüm 15) — varsayılan "Tümü"dür.

**Excel İçe Aktar:** Muhasebe programından dışa aktarılan `.xlsx` okunur, gruplanır (aynı tarih+müşteri+plaka tek siparişte birleşir; Perakende/plakasız satırlar birleştirilmez), hizmet eşleştirmesi otomatik yapılır, `import_ref` ile tekrar aktarımda mükerrer kayıt oluşmaz. Tekilleştirme tüm-ya-da-hiç çalışır (satır bazlı otomatik birleştirme yapılmaz) — kaynak dosya sonradan düzeltilip (ör. unutulan bir satır eklenip) aynı gruba ait bir sipariş tekrar yüklenirse, o sipariş yine mükerrer sayılıp atlanır, **ama** şu anki dosyadaki satır sayısı veritabanındakinden farklıysa kullanıcı ayrıca (turuncu) bir uyarıyla bilgilendirilir — sessizce veri kaybı olmaz, elle kontrol/ekleme gerekir.

**Mobil:** Şablon İndir / Excel'den İçe Aktar / Dışa Aktar / + Sipariş Ekle butonları mobilde taşmayı önlemek için tek bir "İşlemler" açılır menüsünde toplanır (masaüstünde değişiklik yok, hepsi ayrı ayrı görünür). Arama kutusunun yanındaki "Filtreleri Temizle" linki mobilde gizlenir ("Filtrele" butonundaki rozet zaten aktif filtre sayısını gösterir). Tablodaki sağda sabit (sticky) İşlemler sütununun genişliği, o kullanıcının görebileceği buton sayısına göre daralır (ör. yalnızca `orders.view` izni olan bir personel için Detay dışında buton yoksa sütun neredeyse hiç yer kaplamaz) — aynı desen Depolama ve Ürün Kataloğu'nda da uygulanır.

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

- **Ciro/Maliyet/Masraf/Kâr grafiği** — günlük kırılım; Kâr = Ciro − Maliyet − Masraf (Bölüm 11, `expenses.expense_date` bazlı — sipariş kaydı gerektirmez, o yüzden hiç siparişi olmayan bir günde de masraf görünüp Kâr'ı negatife çekebilir).
- **Eklenmemiş sabit gider rozeti** — seçili ay için henüz "Sabit Giderleri Ekle" ile masrafa dönüştürülmemiş aktif sabit gider varsa (ör. unutulmuş kira), "Toplam Masraf" özet kartında kategorileri listeleyen (tooltip) turuncu bir rozet (`+N eklenmedi`) gösterilir, tıklanınca Masraflar'a götürür — bu giderler henüz Kâr hesabında yer almadığından o ayın kârı olduğundan yüksek görünüyor olabilir.
- **Günlük/Haftalık/Aylık periyot tablosu** — üstteki Ay/Yıl seçiciyle birlikte çalışır, Masraf sütunu dahildir. Günlük/Haftalık/Aylık seçiminin yanında artık bir **Özel Tarih** seçimi de var — seçilirse periyot tablosu (ve seçilince Hizmet Dağılımı da) "seçili aydaki en güncel gün" yerine kullanıcının verdiği referans gün/haftaya göre hesaplanır (`GET /api/reports`'a opsiyonel `periodFrom`/`periodTo`); seçilmezse eski varsayılan davranış (mevcut ay/en güncel gün) aynen çalışmaya devam eder.
- **Ödeme Tipine Göre Gelir** — tüm `"<Tedarikçi> Mail Order"` etiketleri tek bir "Mail Order" kutusunda toplanır, tıklanınca tedarikçi kırılımı açılır. Kaynak: `order_payments` (parçalı ödeme) varsa o, yoksa satır bazlı `order_services.payment_type` (bkz. Bölüm 5).
- **En Çok Verilen Hizmetler** — hizmet başına adet ve yüzdelik dağılım.
- **Kasa (Nakit) — Tüm Zamanlar kartı:** üstteki Ay/Yıl seçiminden **tamamen bağımsız**, kuruluştan bugüne tüm zamanların Nakit Gelir / Nakit Masraf / Kasada Kalan özetini gösterir — fiziksel kasadaki nakit hiçbir ay sınırında sıfırlanmadığından aylık rapor gibi tarih filtreli olması anlamsızdır. Gelir tarafı yalnızca `payment_type = 'Nakit'` olan sipariş tahsilatlarını (yukarıdaki Ödeme Tipine Göre Gelir ile aynı `order_payments`/`order_services` ayrıştırma mantığı, tarih filtresiz) ve Cari'den sonradan Nakit tahsil edilen tutarları (bkz. Bölüm 13) sayar; gider tarafı `expenses.payment_type = 'Nakit'` olan tüm masrafların toplamıdır. **Bu kart, Bölüm 14'teki Kasa (`/admin/kasa`) sayfasından tamamen AYRI, bağımsız bir rapor kavramıdır** — Kasa sayfası kasa bazlı (çoklu kasa, bağlı ödeme tipleri, döviz dahil) kronolojik bir defter iken, bu kart yalnızca "Nakit" ödeme tipini toplu bir özet olarak sayar; ikisi karıştırılmamalıdır.

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
- **Mobil:** Şablon İndir/İçeri Aktar/Dışa Aktar/+ Yeni Kayıt butonları tek bir "İşlemler" menüsünde toplanır; satır aksiyonları zaten mobilde her zaman üç-nokta menüsü olarak gösteriliyordu (bkz. Bölüm 3'teki mobil not).

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
- **Fiyat Geçmişi:** her partinin tüm stok girişlerini (tarih, miktar, alış/satış fiyatı — sütun başlıkları "(Birim)" ile netleştirilmiştir) gösteren liste; artık salt okunur değil, her kayıtta bir **Düzenle** butonu var (`PATCH /api/products/:id/history/:entryId`) — sadece o geçmiş stok girişi kaydının (`product_stock_entries`) Alış/Satış fiyatını düzeltir, ürünün güncel (ortalama) fiyatına dokunmaz. Stok Girişi sırasında birim fiyat yerine yanlışlıkla toplam tutar girilmiş bir kaydı sonradan düzeltmek için eklendi — önceden bu tür bir hata elle DB düzeltmesi gerektiriyordu.

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
- **Mobil:** Şablon İndir/İçeri Aktar/Dışa Aktar/+ Yeni Ürün butonları tek bir "İşlemler" menüsünde toplanır; grup/parti satırlarındaki sağda sabit İşlemler sütunu, görünen buton sayısına göre daralır (bkz. Bölüm 3'teki mobil not) — grup satırında (parti kapalıyken) sadece Stok Girişi/Düzenle olabileceğinden, açılmış bir parti satırındaki (Fiyat Geçmişi/Düzenle/Sil) genişliğe göre bazen küçük bir boşluk kalabilir, bu bilinen ve kabul edilmiş bir sınırdır.

---

### 10. Müşteri & Tedarikçi Dizinleri

`/admin/customers`, `/admin/suppliers` — Sipariş Oluşturma ekranındaki Müşteri/Tedarikçi alanları için öneri/yönetim listeleri. Yeni bir sipariş yeni bir isimle kaydedildiğinde ilgili dizine otomatik eklenir (`src/lib/directories.ts`); `orders.customer_name` ve `order_services.supplier` serbest metin kalır (FK değildir).

---

### 11. Masraflar

**Sayfa:** `/admin/expenses` — yalnızca `admin`. Sipariş/hizmetlerden bağımsız günlük işletme giderlerinin (kira, elektrik, personel, malzeme vb.) takibi.

- Üstteki Ay/Yıl seçiciyle o aya ait masraflar listelenir (varsayılan içinde bulunulan ay), seçili ayın toplam masrafı üstte gösterilir; hemen altında Raporlar'daki "Ödeme Tipine Göre Gelir" ile aynı fikirde bir **ödeme şekline göre kırılım** (Nakit Masraf Toplamı, Havale/EFT Masraf Toplamı vb.) gösterilir — zaten çekilmiş seçili ayın masraf listesinden istemci tarafında hesaplanır, ekstra bir API çağrısı gerektirmez.
- **"Yeni Masraf" — çoklu satır girişi:** Sipariş Oluşturma ekranındaki İşlem Satırları'na benzer şekilde, tek formda "+ Satır Ekle" ile birden fazla masraf satırı eklenip tek "Kaydet" ile hepsi aynı anda kaydedilir (`POST /api/expenses` bir `{ items: [...] }` dizisi kabul eder, hepsini tek bir transaction'da ekler — biri geçersizse hiçbiri kaydedilmez). Yeni eklenen satır, önceki satırın Tarih/Ödeme Şekli değerlerini devralır (aynı gün birden fazla masraf girmek yaygın olduğundan). **Düzenle** ise her zaman tek bir kaydı hedefleyen ayrı, küçük bir form.
- **Alanlar:** Tarih (zorunlu), Kategori (zorunlu, serbest metin — bir oto/lastik servisinde sık görülen kalemlerin sabit listesi (`src/lib/expenseCategories.ts`) + bugüne kadar fiilen kullanılmış tüm kategoriler `datalist` ile önerilir, bkz. `/api/expenses/categories`; listede olmayan bir isim de serbestçe yazılabilir), Açıklama (opsiyonel), Tutar (₺, zorunlu), Ödeme Şekli (opsiyonel — Genel Ayarlar'daki `payment_types` listesinden seçilir, bkz. Bölüm 15).
- Ekleme/düzenleme modal formu, silme (kalıcı — soft-delete yok, başka hiçbir tabloya FK ile bağlı değil).
- **Raporlar entegrasyonu:** Bölüm 6'daki Ciro/Maliyet/Kâr hesabına üçüncü bir kalem olarak dahildir — Kâr artık Ciro − Maliyet − Masraf'tır (`created_at` yerine `expenses.expense_date`, ki bu bir sipariş kaydı gerektirmediğinden sipariş olmayan bir günde de masraf görünebilir).
- **Sabit Giderler:** Kira gibi ayda bir tekrar eden, tutarı nadiren değişen giderler için Masraflar sayfasına gömülü ayrı bir panel (`recurring_expenses` tablosu — kategori, tutar, ödeme şekli, aktif/pasif; ayrı bir sayfa değil). "Sabit Giderleri Ekle" butonu, seçili ay için henüz masrafa dönüştürülmemiş aktif şablonları (buton üzerinde sayı rozetiyle) Yeni Masraf formuna hazır satırlar olarak doldurur — kullanıcı gözden geçirip Kaydet'e basmadan hiçbir şey kaydedilmez (tam otomatik/arka plan cron değil). Bir masrafın hangi şablondan geldiği `expenses.recurring_expense_id` ile izlenir (şablon silinse bile geçmiş masraf kayıtları etkilenmez, `SET NULL`); tabloda bu satırlar "Sabit" rozetiyle işaretlenir. Şablon Pasif yapılırsa "Sabit Giderleri Ekle" onu bir daha önermez (silmeden durdurma).

---

### 12. Online Randevu Modülü

**Public randevu formu:** `/randevu/:slug` — kimlik doğrulaması gerektirmez, her firmanın kendi `tenants.slug`'ı ile erişilir (bkz. Bölüm 16 — Firma Kodu'ndan AYRI bir kavram: slug herkese açık bir URL parçası, sadece "Bağlantıyı Yenile" ile rastgele değiştirilebilir kozmetik bir önlemdir, gerçek bir erişim kontrolü değildir). Müşteri; Hizmet (yalnızca `services.bookable = true` işaretli, randevuya açık hizmetler — bu işaretleme Hizmet & Fiyat Yönetimi'nden, Bölüm 7, yapılır), Tarih ve gerçek zamanlı hesaplanan Müsait Saatler'den birini, ardından Ad Soyad/Plaka/Telefon bilgilerini girer.

**Kapasite/slot hesaplaması** (`src/lib/appointmentSlots.ts`): naif bir saat-sayacı değil, gerçek zaman-aralığı çakışma sorgusu — her hizmetin kendi `duration_minutes` süresi (yoksa varsayılan 30 dk) baz alınarak 15 dakikalık adımlarla, o slotu aynı anda kullanan randevu sayısı Genel Ayarlar'daki `booking_capacity`'yi aşmayan başlangıç saatleri döner. Kayıt anında (`POST /api/public/randevu/:slug`) sunucu; (1) `isWithinBookableWindow` ile zamanın gerçekten geçmişte olmadığını, firmanın izin verdiği azami ileri randevu penceresi (`booking_max_days_ahead`, gün) içinde kaldığını ve çalışma saatleri (`booking_working_hours`, gün bazlı açık/kapalı + saat aralığı) içine düştüğünü, (2) `isSlotStillAvailable` ile o slotun hâlâ dolmadığını ayrı ayrı doğrular — istemcinin "bu saat müsait" iddiasına hiç güvenilmez. Eşzamanlı iki isteğin aynı boş slotu ikisinin de kapması, tenant bazlı bir `pg_advisory_xact_lock` ile engellenir (satır bazlı `FOR UPDATE`, henüz hiç randevusu olmayan bir slotta tek başına yeterli değildir).

**Kötüye kullanıma karşı:** gizli honeypot alanı (`website` — botlar doldurur, gerçek kullanıcı görmez/dolduramaz), aynı telefon numarasından 5 dakikalık soğuma süresi, aynı IP'den saatlik en fazla 8 istek. Gerçek bir CAPTCHA (ör. Turnstile) yok — kötüye kullanım gerçekten görülürse eklenecek bir sonraki adım.

**Onay akışı:** Genel Ayarlar'daki `booking_auto_approve` açıksa talep doğrudan `ONAYLANDI` statüsüyle kaydedilir, kapalıysa (önerilen varsayılan) `BEKLEMEDE` ile açılır ve `/admin/appointments` (Randevular) sayfasında personelin onayını bekler. Randevular sayfasında (`appointments` izin kaynağı — görüntüle/onayla/sil) statüye göre filtrelenebilir liste, "Onayla"/"Reddet" aksiyonları ve **"Siparişe Dönüştür"** (`POST /api/appointments/:id/convert`, `src/lib/appointments.ts`) vardır — onaylanmış bir randevuyu, Sipariş Oluşturma ekranındakiyle (Bölüm 1) aynı desende (tek satırlı, `BEKLEMEDE` statülü, hizmet fiyatıyla) bir siparişe çevirir; randevu bir hizmete bağlı değilse (personel elle, hizmet seçmeden oluşturmuşsa) genel bir "Randevu" hizmeti otomatik açılır. Bir randevu en fazla bir kez dönüştürülebilir.

**Bildirimler:**
- **Tarayıcı push bildirimi** — yeni bir randevu talebi geldiğinde firmanın admin kullanıcılarına Web Push (VAPID) ile bildirim gönderilir (`src/lib/push.ts`, `notifyTenantAdmins`); Randevu Ayarları sayfasındaki bir switch ile açılıp kapatılır. VAPID anahtarları tanımlı değilse (ortam değişkeni eksikse) randevu route'ları çökmez, bildirim sessizce atlanır.
- **WhatsApp bildirimi** — bir randevu `ONAYLANDI` olduğunda (otomatik veya manuel onay, ya da personelin telefonla gelen talebi elle girmesi) müşterinin randevu formunda girdiği telefon numarasına Meta WhatsApp Business Cloud API üzerinden randevu detaylı bir bildirim gönderilir (`src/lib/whatsapp.ts`). Her firma **kendi** Meta WhatsApp Business hesabını (erişim token'ı, telefon numarası ID'si, WABA ID'si, onaylı şablon adı) Randevu Ayarları'ndan bağlar — tek bir paylaşılan hesap değil, çünkü mesajın firmanın kendi doğrulanmış işletme adından gitmesi gerekir. Erişim token'ı istemciye asla ham haliyle dönmez (`GET /api/settings` sadece "kayıtlı mı" bilgisini döndürür), boş bırakılıp kaydedilirse mevcut token korunur. Kötüye kullanım/maliyet koruması: `whatsapp_message_log` tablosu ile tenant başına saatlik en fazla 20 gönderim (personelin elle randevu girip anında onayladığı akış hiçbir hız sınırına tabi değildir, art arda sahte randevu girilirse gerçek/ücretli mesaj tetikleyebilirdi) — sadece Meta'nın 2xx döndürdüğü **başarılı** gönderimler sayılır. Telefon numaraları gönderim anında E.164 TR formatına (`90XXXXXXXXXX`) normalize edilir.

**Görünüm özelleştirmesi** (`/admin/appointments/gorunum`, `admin`): formun kendi web sitesine gömüldüğünde nasıl göründüğü, aynı `app_settings` satırındaki `booking_widget_*` alanlarıyla ayarlanır — Görünüm Stili (Kart/Sade/Çerçeveli), Vurgu Rengi, Kolon Sayısı (Tablet 1-2, Masaüstü 1-3; mobil her zaman sabit tek kolon), Köşe Yuvarlığı (Keskin/Orta/Yuvarlak/Hap), Boşluk Yoğunluğu (Sıkışık/Normal/Ferah), Başlık/Açıklama metni ve Başlık Boyutu (Küçük/Orta/Büyük), sitesine gömülüyken başlık/açıklamanın gösterilip gösterilmeyeceği. Sayfa, seçilen değerleri kaydetmeden `postMessage` ile canlı bir önizleme iframe'ine (`/randevu/:slug?embed=1`) yansıtır; önizleme paneli üç genişlik (Mobil/Tablet/Masaüstü) arasında geçiş yapabilir, panelden geniş bir genişlik CSS `transform: scale()` ile sığdırılarak (kırpılmadan) gösterilir.

**Gömme (embed) ve izolasyon:** Randevu Ayarları'ndaki "Web Sitenize Ekleyin" bölümü üç seçenek sunar — doğrudan link, `<script src=".../embed.js" data-slug="...">` ile göm (önerilen), veya klasik bir `<iframe>`. Script ile gömme artık bir iframe üretmez, formu doğrudan host sayfanın DOM'una bir **Shadow DOM** köküne (vanilla JS, React değil — `public/embed.js`) render eder: host sitenin genel CSS'i (agresif `*{...}` kuralları dahil) forma sızamaz, buna karşılık host `--accent` CSS değişkeni ve `::part(field|submit|slot|...)` seçicileriyle kontrollü şekilde stil verebilir. Shadow DOM'un JS izolasyonu **olmadığı** (host'un kendi JS'i widget'ın içine erişebilir) bilinçli bir mimari tercihtir. API'ler artık host'un kendi origin'inden çağrıldığından `/api/public/randevu/*` uçlarına CORS eklenmiştir. Tam izolasyon (host CSS'i hiç etkilemesin/etkilenmesin) isteyen firmalar için klasik `<iframe>` seçeneği hâlâ durur. **"Bağlantıyı Yenile"** butonu tahmin edilebilir bir slug'ı (ör. "ustalas") 16 karakterlik rastgele bir tanımlayıcıyla değiştirir — eski embed kodu/link bilerek çalışmaz hale gelir; slug hiçbir zaman gerçek bir erişim kontrolü değildir (kodun kendisinde zaten herkese açık durur), sadece rastgele denemeyle bulunmayı zorlaştıran kozmetik bir önlemdir.

**Ayarlar önbelleği:** Public randevu widget'ının ayar okumaları (`/api/public/randevu/:slug/meta`) `src/lib/publicBookingConfigCache.ts` ile 60 saniyelik bir TTL cache'e alınır — yüksek trafikte her form açılışında `app_settings`'i tekrar tekrar sorgulamamak için.

---

### 13. Cari (Müşteri Bakiye Takibi) Modülü

**Amaç:** Bir müşterinin firmaya olan borcunu/alacağını, tek bir siparişten bağımsız, KOBİ muhasebe pratiğine uygun şekilde (tahsilat belirli bir faturaya değil genel bakiyeye karşı düşer) takip eder. Kaynak: `src/lib/customerLedger.ts`, `customer_ledger_entries` tablosu.

**İki tür kayıt:**
- **`SIPARIS`** — otomatik türer, elle oluşturulamaz/silinemez. Bir siparişin ödeme kırılımında (`order_payments` varsa o, yoksa satır bazlı `order_services.payment_type` — Bölüm 5/6'daki fallback ile BİREBİR aynı mantık) "Cari" tipinde bir tutar kaldıysa, `syncOrderLedger`/`syncOrderLedgerBatch` bu tutar kadar bir borç kaydı açar; sipariş sonradan düzenlenip Cari tutarı değişir/kalkarsa aynı fonksiyon "sil, yeniden hesapla, gerekiyorsa tek satır ekle" deseniyle senkron kalır (`customer_ledger_entries_order_siparis_unique` kısmi index, bir sipariş için en fazla bir SIPARIS satırına izin vererek bunu ikinci bir katman olarak garantiler). Bu senkronizasyon `auto_register_customers` ayarından **bağımsız** çalışır — o ayar sadece kolaylık dizinini kontrol eder, Cari borcun geçerli bir `customer_id`'ye ihtiyacı olduğundan müşteri kaydı ayar kapalı olsa bile burada oluşturulur.
- **`MANUEL`** — Müşteriler sayfasındaki bir müşterinin "Cari Hareketleri" modalından "Tahsilat Al" (`direction = -1`, ödeme şekli zorunlu, "Cari" **hariç** — bir Cari borcunu yine Cari ile "tahsil etmek" döngüsel olurdu) veya "Borç Ekle" (`direction = 1`, ödeme şekli yok) ile girilir (`customers.manage_balance` izni). Nakit bir tahsilatta isteğe bağlı bir `kasa_id` seçilebilir (bkz. Bölüm 14) — bu tutar hem Cari bakiyeye hem ilgili kasanın Kasa defterine (`CARI_TAHSILAT` satırı olarak) aynı anda yansır. Bu kayıtlar sonradan **düzenlenebilir ve silinebilir** (`PUT`/`DELETE /api/customers/:id/payments/:entryId`) — ortak doğrulama (`validateManualLedgerInput`) POST ile PUT arasında `src/lib/customerLedger.ts`'te paylaşılır; bir kaydın ödeme şekli Genel Ayarlar'dan sonradan kaldırılmış olsa bile o kayıt hâlâ (alakasız bir alan değişse bile) düzenlenebilir — kayıtta ZATEN kayıtlı olan değer yeniden doğrulanmaz. `SIPARIS` kayıtları bu uçlardan elle değiştirilemez/silinemez, sadece ilgili siparişin kendisi değiştirilerek dolaylı güncellenebilir.

**Bakiye:** cache kolonu yok, her zaman `customer_ledger_entries`'in canlı toplamıdır — `SUM(amount * direction) OVER (ORDER BY entry_date, id)` pencere fonksiyonuyla kümülatif olarak hesaplanır (`GET /api/customers/:id/ledger`).

**Müşteriler sayfası entegrasyonu** (`/admin/customers`): üstte **Toplam Borç / Toplam Alacak** özet kartları; "Borç/Alacak Listesini İndir" ile bakiyesi olan müşteriler en yüksek borçtan başlayarak Excel'e aktarılır (ilk borç tarihi, son hareket tarihi, ilgili sipariş numaraları + hizmet detaylarıyla birlikte — "git şunlardan tahsil et" diye çalışana verilebilecek somut bir liste, `GET /api/customers/export`). Her müşteri satırından "Cari Hareketleri" modalına girilip tam hareket dökümü (kümülatif bakiye sütunuyla) görülebilir, yeni Tahsilat/Borç girilebilir, mevcut MANUEL kayıtlar düzenlenip silinebilir.

---

### 14. Kasa (Nakit Kasa Defteri), Kasalar, Transfer ve Döviz Desteği

**Sayfa:** `/admin/kasa` (`kasa.view`/`kasa.manage` izinleri) — fiziksel nakit kasa(lar)ın tam kronolojik defteri, canlı kümülatif bakiye sütunuyla.

**Kasa Defteri (temel görünüm):** Beş kaynak `UNION ALL` ile tek listede birleşir (`GET /api/kasa`, `src/app/api/kasa/route.ts`): nakit sipariş tahsilatları (`order_payments`/`order_services` fallback — Bölüm 6'daki "Kasa (Nakit) — Tüm Zamanlar" kartıyla BİREBİR aynı kaynak/filtre; orada bir değişiklik yapılırsa burada da yapılmalıdır, aksi halde ikisi sessizce birbirinden sapar), Cari'den nakit tahsilat (Bölüm 13), nakit masraflar (Bölüm 11) ve serbest manuel hareketler (`cash_ledger_entries` — hiçbir siparişe/masrafa bağlı olmayan "Yavuz Abiye Gönderildi" gibi girişler, ve Kasalar Arası Transfer bacakları). Bakiye her zaman canlı `SUM()`'dır, cache kolonu yok. `payment_type = 'Nakit'` OLMASA bile `kasa_id` dolu satırlar da dahil edilir (aşağıdaki Ödeme Tipi Bağlama'ya bkz.).

**Çoklu Kasa:** `kasalar` tablosu (`id`, `tenant_id`, `name`) ile firma birden fazla fiziksel kasa tanımlayabilir (ör. "Nazım Kasa", "Sait Kasa") — `suppliers` gibi serbest metin upsert değil, gerçek FK'li bir dizin (`GET/POST /api/kasalar`, `PATCH/DELETE /api/kasalar/:id`, "Kasaları Yönet" modalı, `kasa.manage` izni). Altı tabloya (`order_payments`, `order_services`, `expenses`, `recurring_expenses`, `customer_ledger_entries`, `cash_ledger_entries`) nullable bir `kasa_id` kolonu eklenmiştir — hiç kasa tanımlamamış firmalarda davranış birebir eskisiyle aynı kalır. Kasa sayfasında sekmeler: **"Tüm Kasalar"** (varsayılan, hepsinin birleşik görünümü), her kasa için ayrı bir sekme, ve kasasız/eski kayıtlar için **"Kasa"** (eski adıyla "Atanmamış") sekmesi — bu sekme sadece gerçekten kasasız hareket varsa görünür. "Kasaları Yönet"ten kasa oluşturulur/yeniden adlandırılır/silinir; bağlı hareketi olan bir kasa (composite FK `RESTRICT`) silinemez, anlaşılır bir hata mesajı döner.

**Ödeme Tipi Bağlama (sanal kasalar):** bir kasa, Nakit **dışı** bir ödeme tipine (ör. "Nazım Hesap") bağlanabilir (`kasalar.linked_payment_type`; tenant başına bir ödeme tipi en fazla bir kasaya bağlanabilir; "Nakit" ve "Cari" bağlanamaz — Nakit'in zaten kendi çoklu-kasa/manuel seçim mekanizması var, Cari nakit hareketi temsil etmiyor). Bağlı tipteki **her** işlem (hem yeni girilenler hem geçmiş kayıtlar — bağlama anında otomatik backfill yapılır) otomatik o kasaya sayılır, kullanıcı ek bir seçim yapmaz; bağlantı değiştirilir/kaldırılırsa aynı senkron tersine de uygulanır (`src/lib/kasalar.ts`: `resolveKasaId`, `applyKasaLinkChange`).

**Kasalar Arası Transfer:** bir kasadan diğerine yapılan para aktarımı, TEK işlemle, `cash_ledger_entries.transfer_pair_id` ile birbirine bağlı (kaynakta `-1`, hedefte `+1`) dengeli iki satır olarak yazılır (`POST /api/kasa/transfers`). Bu satırlar `PUT` ile düzenlenemez, sadece **birlikte** silinebilir. Farklı para birimindeki kasalar arasında transfer yapılamaz (döviz bozdurma anlamına gelirdi, kapsam dışı bırakılmıştır).

**Döviz/Para Birimi Desteği:** bir kasa TL dışında bir para birimi tutabilir (`kasalar.currency`, varsayılan TRY; hazır seçenekler TRY/USD/EUR/GBP + serbest 3 harfli kod). `currency_rates` tablosu (`tenant_id`, `currency`, `rate_to_try`) ile tenant'ın "Kasaları Yönet"ten girdiği **güncel** TL kuru tutulur — dış bir kur API'sinden **otomatik çekilmez**, tamamen manuel, geçmiş işlemleri yeniden hesaplamaz, sadece "şu an bu kasada duran döviz kaç TL eder" sorusuna canlı cevap verir (`GET/PUT /api/currency-rates`). Belirli bir döviz kasası seçiliyken tutar/bakiye o kasanın **kendi** para biriminde (native, çevrilmemiş) gösterilir; **"Tüm Kasalar"** ve **"Kasa"** (atanmamış) gibi birden fazla kasayı birleştiren görünümlerde ise TEK doğru TL toplamı korunur — her satır `effective_amount` (= `amount × güncel_kur`, TL için 1) üzerinden toplanır, kuru hiç girilmemiş bir para birimindeki kasa toplamdan **hariç tutulup** kullanıcıya bir uyarı gösterilir. Döviz kasası bir ödeme tipine bağlanamaz (Ödeme Tipi Bağlama yukarıda) — sipariş/masraf/Cari tutarları her zaman TL olduğundan. Aynı nedenle Nakit ödeme her zaman TL kabul edildiğinden, sipariş/masraf/Cari ekranlarındaki kasa seçicilerinde (`KasaSelect` bileşeni) döviz kasaları hiç listelenmez; bu seçicilerde kasa seçilmemiş varsayılan seçenek "Kasa" olarak adlandırılır (Kasa sayfasındaki "Kasa" sekmesiyle aynı isim/anlam).

**Tarih Filtresi & Sayfalama:** Kasa sayfasına opsiyonel `?from=&to=` (`YYYY-MM-DD`) tarih aralığı eklenebilir — verilmezse tüm geçmiş taranır (eski davranış); verildiğinde SADECE o aralıktaki satırlar pencerelenir (performans), aralıktan önceki toplam ("opening" bakiye) ayrı ve ucuz bir agregat sorguyla hesaplanıp her satırın kümülatif bakiyesine eklenir. Liste sayfalıdır (varsayılan 50, en fazla 200 satır), "Daha Fazla Yükle" ile eskiye doğru ilerlenir; toplam bakiye ve "Kasa" (atanmamış) sekmesinin görünürlüğü sayfalamadan bağımsız, ayrı sorgularla hesaplanır.

---

### 15. Profil, Kullanıcı Yönetimi & Genel Ayarlar

Üst menüdeki **Ayarlar** açılır menüsü altında üç sayfa:

**Profil** (`/admin/profile`) — herhangi bir oturum açmış kullanıcı erişir:
- Kullanıcı adı ve rolünü görüntüler.
- **Kullanıcı adını değiştirme** — self-service, benzersizlik kontrolüyle (`PATCH /api/auth/username`); mevcut şifre doğrulaması gerektirmez.
- Şifre değiştirme — mevcut şifrenin doğrulanmasını zorunlu kılar (`PATCH /api/auth/password`).

**Kullanıcılar** (`/admin/users`) — yalnızca `admin`:
- Yeni kullanıcı oluşturma (kullanıcı adı, şifre, rol: Yönetici/Karşılama Görevlisi). Rol "Karşılama Görevlisi" seçilirse form altında sayfa/aksiyon bazlı **izin matrisi** (`PermissionMatrix`) belirir — hiçbiri seçilmezse kullanıcı yalnızca sipariş oluşturma ekranını görür (bkz. Roller bölümündeki İzin Sistemi). Bu modalın İptal/Kaydet butonları mobilde (izin matrisi uzun olduğunda içerik kaydırıldığında bile erişilebilir kalması için) ekranın altında sabittir.
- Satır üzerinden rol değiştirme (dropdown, anında kaydeder) ve şifre sıfırlama (admin, hedef kullanıcının mevcut şifresini bilmeden sıfırlar).
- **Kullanıcı adı yeniden adlandırma** (✎ ikonu) — başka bir kullanıcının adını değiştirir (kendi adınız bu ekrandan değiştirilemez, Profil'e yönlendirilirsiniz).
- **Kilit rozeti + "Kilidi Aç"** — brute-force korumasıyla (bkz. Bölüm 2) kilitlenmiş bir hesap listede görünür, yönetici 15 dakika beklemeden manuel açabilir.
- **"Oturumu Sonlandır"** — hedef kullanıcının tüm cihazlardaki aktif oturumunu (elindeki cookie/token ne kadar süre geçerli olursa olsun) anında geçersiz kılar; kayıp cihaz veya işten ayrılma gibi durumlar için (bkz. Güvenlik Notları — `tokens_invalid_before`).
- **Aktif/Pasif toggle ("Devre Dışı Bırak"/"Aktifleştir")** — kaydı silmeden hesabı devre dışı bırakır: pasif hesapla giriş yapılamaz ve mevcut oturumu varsa o da anında düşer; geçmiş kayıtlar/izler korunur (kalıcı "Sil" ayrıca mevcut).
- **Kayıt Tarihi** ve **Son Giriş** sütunları — hesabın ne zaman açıldığı ve en son ne zaman kullanıldığı görünür.
- **Kendi kaydınız üzerinde kısıtlı**: kendi rolünüzü/kullanıcı adınızı bu ekrandan değiştiremez, kendi şifrenizi buradan sıfırlayamaz (Profil'e yönlendirilirsiniz), kendi oturumunuzu buradan sonlandıramaz, kendi hesabınızı devre dışı bırakamaz veya silemezsiniz — kazara kendi yetkinizi/erişiminizi kaybetmenizi engeller.
- **Son yönetici koruması**: sistemde tek **aktif** `admin` kalmışsa o kullanıcının rolü değiştirilemez, devre dışı bırakılamaz veya silinemez (bkz. Güvenlik Notları).
- **Ana admin koruması** (`is_primary_admin`): son-yönetici korumasından ayrı, ek bir katman — bkz. Roller bölümündeki İzin Sistemi.

**Genel Ayarlar** (`/admin/settings`) — yalnızca `admin`:
- İşletme adı, depoda bekleme uyarı eşiği (ay) ve ödeme şekilleri listesi — `app_settings` tablosunda tutulur, `GET/PUT /api/settings` üzerinden okunur/güncellenir. (Çoklu firma altyapısı kapsamında bu tablo artık tek satır değil, firma başına bir satırdır — bkz. "Çoklu Firma (Multi-Tenant) Altyapısı".)
- Depolama modülündeki (Bölüm 8) "N aydan uzun süredir bekliyor" uyarısı hem liste sayfasında hem `/api/storage?overdue=true` sorgusunda artık bu ayardan okunur (önceden kod içinde sabit 6 ay idi).
- **Ödeme şekilleri** (`payment_types`, "Mail Order" dahil) — sipariş kapama/düzenleme ekranındaki (Bölüm 5) dropdown ve Excel içe aktarmadaki (`src/lib/ordersExcel.ts`) normalizasyon ("Mail Order" hariç geri kalanı "bilinen" sabit tip sayılır, listede olmayan bir değer "<değer> Mail Order" olarak yorumlanır) artık bu listeden okunur — önceden üç ayrı dosyada (`admin/orders/[id]/page.tsx`, `api/orders/[id]/route.ts`, `lib/ordersExcel.ts`) birebir aynı sabit dizi tekrarlanıyordu. Ayarlar sayfasında bu listeyi değiştirmenin sonuçlarını (yeni seçenekler, Excel normalizasyonu) açıklayan bir uyarı gösterilir; geçmiş sipariş kayıtları (`payment_type` serbest metin) etkilenmez. Raporlar (Bölüm 6) ödeme tipini tamamen dinamik (`GROUP BY payment_type`) işlediğinden bu listeden bağımsızdır, etkilenmez.
  - **Korumalı ödeme tipleri** (`src/lib/paymentTypes.ts` — `PROTECTED_PAYMENT_TYPES`): Nakit, POS, Cari, Mail Order — her lastikçi firmasında bulunan genel kategoriler olduğundan Genel Ayarlar'dan kaldırılamaz (arayüzde 🔒 ile işaretlenir, `PUT /api/settings` da bunları liste dışında bırakan bir isteği reddeder). `getAppSettings()` bunların her zaman sonuçta bulunmasını da ayrıca garanti eder. Diğerleri ("Fatura Edildi.", isimli hesaplar gibi firmaya özel olanlar) serbestçe eklenip kaldırılabilir.
  - **Geriye dönük uyumluluk:** Bir ödeme tipi (ör. "Garanti Hesap") ayarlardan kaldırıldıktan sonra, o değeri zaten taşıyan eski siparişler kilitlenmez — `PUT /api/orders/:id`, o siparişin `order_services`/`order_payments` kayıtlarında hâlâ geçerli olan değerleri bu istek özelinde ayrıca kabul eder (ayarlar listesine geri eklemez, sadece o siparişin düzenlenmesini alakasız bir değişiklik için bile engellemez). Genel olarak yeni satır/ödeme girişleri için kaldırılmış bir tip artık seçilemez/kabul edilmez.
- **Sipariş Listesi varsayılan tarih filtresi** (`orders_default_date_filter`) — Sipariş Listesi'nin (Bölüm 3) açılışta hangi Tarih filtresiyle (Tümü/Bugün/Bu Hafta/Bu Ay) geleceğini belirler; varsayılan "Tümü"dür.
- **Müşterileri Otomatik Kaydet** (`auto_register_customers`, varsayılan açık) — kapatılırsa Sipariş Oluşturma/düzenleme ekranındaki ve Randevu'dan siparişe dönüştürmedeki (Bölüm 12) yeni bir müşteri adının `customers` dizinine otomatik eklenmesi durur; Cari (Bölüm 13) borç senkronizasyonu bu ayardan bağımsız çalışmaya devam eder, çünkü borcun geçerli bir `customer_id`'ye ihtiyacı vardır.
- **Firma Kodu** — çoklu firma girişinde kullanılan, 6 haneli `tenants.code`'a salt okunur erişim (paylaşılan `CopyBox` bileşeniyle) burada gösterilir; bkz. Bölüm 16.
- Bu tablo tam olarak çoklu firma (SaaS) desteği öngörülerek tasarlanmıştı — bu geçiş artık gerçekleşti, bkz. Bölüm 16 "Çoklu Firma (Multi-Tenant) Altyapısı".

---

### 16. Çoklu Firma (Multi-Tenant) Altyapısı

> **Durum (2026-09-10): tamamlandı, canlıda.** Tüm route'lara tenant izolasyonu uygulanmış, girişe Firma Kodu eklenmiş ve paylaşılan tek deploymentta iki gerçek firma (**Ustalas** ve **FB Lastik**) üretimde çalışır durumdadır. Bu bölüm artık hedeflenen değil, GERÇEKLEŞMİŞ mimariyi anlatır.

**Neden:** Bugüne kadar her müşteri (lastikçi) için ayrı bir Vercel deployment + ayrı bir Postgres veritabanı açılıyordu (aynı kod tabanı, farklı `DATABASE_URL`). Müşteri sayısı reklamlarla ~100'e çıkacağından bu model sürdürülemezdi (her yeni müşteri = yeni deploy + yeni migration + yeni izleme). Hedef **tek bir paylaşılan deployment + tek bir paylaşılan veritabanı** olarak gerçekleştirildi — müşteriler birbirinin verisini (sipariş, depo, ürün, fiyat, müşteri vb.) hiç göremiyor.

**Tenant çözümleme ve Firma Kodu:** İlk sürümde `users.username` kasıtlı olarak global unique tutulmuş, girişte firma seçimi yapılmıyordu. FB Lastik'in onboard edilmesiyle bu net bir operasyonel kısıt haline geldi (iki firma aynı kullanıcı adını, ör. "admin", kullanamıyordu — ~100 firma hedefiyle sürdürülemez). Natro vb. hosting panellerindeki "hesap kodu" mantığıyla çözüldü: `tenants.code` (6 haneli, rastgele, benzersiz) eklendi, `users.username` artık **`(tenant_id, username)` composite unique** — global değil. Giriş formu (`/admin/login`) artık üç alanlıdır: **Firma Kodu → Kullanıcı Adı → Şifre**. Kullanıcı adı yazıldıkça (400ms debounce ile) `/api/auth/branding?username=...` genel ucu o kullanıcı adına ait firmanın adını canlı gösterir (henüz kimlik doğrulanmadan) — boş/eşleşmeyen kullanıcı adında jenerik "Lastik Servis Paneli" ismine düşer; bu, bir kullanıcı adının var olup olmadığını hafifçe ifşa eden bilinçli kabul edilmiş bir tradeoff'tur. Login ayrıca artık `tenants.is_active`'i de (önceden yalnızca her API isteğinde kontrol ediliyordu) ilk girişte kontrol eder. `tenants.slug` (bkz. Bölüm 12 — Online Randevu) Firma Kodu'ndan tamamen AYRI bir kavramdır — slug herkese açık `/randevu/:slug` URL'i içindir, code ise kimlik doğrulama öncesi girilen gizli bir alandır.

**Dinamik işletme adı/logo:** Paylaşılan deploymentta artık birden fazla firma aynı panele giriyor — sabit kodlanmış tek bir logo (`public/logo.jpg`) yerine, giriş yapmış kullanıcının admin header'ında (masaüstü + mobil menü) ve login ekranındaki canlı önizlemede kendi firmasının `app_settings.business_name`'i gösterilir (`GET /api/auth/me` artık `business_name` döndürür, `AuthContext` bunu taşır). Elevire demo ortamı kendi markası "Elevire"yi göstermeye devam eder.

**Uygulanan altyapı ve izolasyon (Faz 1-9, tümü tamamlandı):**
- `tenants` tablosu (`id`, `name`, `slug`, `code`, `is_active`, + ileride merkezi faturalandırma için ayrılmış boş alanlar: `plan`, `billing_provider`, `billing_customer_id`, `billing_status`, `trial_ends_at`).
- Her firma-sahipli tabloya (`services`, `orders`, `order_services`, `order_payments`, `customers`, `suppliers`, `users`, `storage`, `products`, `product_stock_entries`, `expenses`, `recurring_expenses`, `appointments`, `customer_ledger_entries`, `cash_ledger_entries`, `kasalar`, `currency_rates` vb.) bir `tenant_id` kolonu; `order_services`/`order_payments`/`product_stock_entries` gibi çocuk tablolarda, ebeveynden (orders/products) farklı bir `tenant_id` ile satır eklenmesini veritabanı seviyesinde imkansız kılan composite foreign key'ler.
- **~40 API route dosyası ve 5 paylaşılan lib fonksiyonunun (`orderQuery`, `directories`, `serviceCatalog`, `productStock`) her sorgusuna `tenant_id` filtresi uygulandı**: `orders`, `products`, `storage`, `customers`, `suppliers`, `services`, `expenses`, `recurring-expenses`, `users`, `reports` — dokümanın önceki sürümünde "henüz yapılmadı" denen tam olarak bu adımdır, artık tamamlanmıştır. `services`/`suppliers`/`customers`'ın unique index'i `(tenant_id, name)` oldu — `provisionTenant()`/`create-tenant.mjs` artık gerçekten ikinci (ve üçüncü, dördüncü...) bir firma oluşturabiliyor.
- `app_settings` artık tekil `id=1` satırı değil, **firma başına bir satır** (`PRIMARY KEY(tenant_id)`).
- `users_single_primary_admin` (bkz. Bölüm 15) global'den firma-bazlı bir kısıta çevrildi — her firma kendi ana admin'ine sahip olabilir.
- `src/lib/auth.ts` → `getAuthUserByToken`, her istekte (role/permissions gibi) `tenant_id`'yi de taze DB'den okur — JWT'den asla güvenilmez.
- `src/lib/provisionTenant.ts` (yeni firma + `app_settings` satırı + varsayılan hizmet/tedarikçi listesi + firma kodu + o firmanın ana admin kullanıcısı, tek transaction'da, toplu insert) ve `scripts/create-tenant.mjs` (dahili/manuel firma oluşturma CLI'ı) — HTTP'den bağımsız, ileride bir kayıt (register) sayfası aynısını çağırabilir.
- Sahiplik kontrolleri sıkılaştırıldı: `customers`/`suppliers`/`expenses`/`services`/`recurring-expenses` PATCH/PUT/DELETE artık `rowCount` kontrol eder (yabancı firmanın id'sinde 404 döner, önceden yanıltıcı 200 dönüyordu); `orders/:id` PUT'ta açık sahiplik kontrolü eklendi (önceden yalnızca DB'deki composite FK yakalayıp 500 veriyordu).
- Performans: yeni `tenant_id` kolonlarının çoğuna (`orders`, `storage`, `expenses`, `products`, `product_stock_entries`) composite index eklendi; ürün listesindeki ortalama fiyat alt sorgusu artık tenant filtreli.
- Doğrulama: 5 örnek firma `create-tenant.mjs` ile oluşturulup gerçek API'yle veri girildi, izole ortama karşı 3 bağımsız ajan (izolasyon/güvenlik/performans) çalıştırıldı — gerçek bir veri sızıntısı bulunmadı.

---

## Ortam Değişkenleri (.env.local)

```env
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
JWT_SECRET=cok_gizli_bir_anahtar_buraya
JWT_EXPIRES_IN=12h
```

---

## Veritabanı Şeması (PostgreSQL)

Tam ve güncel şema `database/schema.sql` dosyasındadır (idempotent — tekrar çalıştırılabilir). Özet:

| Tablo | Amaç |
|---|---|
| `tenants` | Firmalar (çoklu firma altyapısı, Bölüm 16) — `name`, `slug`, `code` (6 haneli Firma Kodu), `is_active`, ileride faturalandırma için ayrılmış boş alanlar |
| `services` | Yapılan İşlem listesi; `price` opsiyonel; `bookable`, `duration_minutes` (Online Randevu'ya açık mı, bkz. Bölüm 12) |
| `orders` | Siparişler; `status`, `payment_type` (serbest metin), `paid_amount`, `import_ref` (Excel tekilleştirme) |
| `order_services` | Sipariş satırları; `quantity`, `cost_price`, `supplier`, `stock_code`, `size_desc`, işlem bazlı `payment_type` (yalnızca Excel içe aktarımı doldurur), `product_id` (Lastik Satışı'nda bağlı parti — bkz. Bölüm 1 ve `src/lib/productStock.ts`), `kasa_id` (bkz. Bölüm 14) |
| `order_payments` | "Ödeme Al & Kapat" ile kapatılan siparişlerin parçalı ödeme kayıtları — `order_id`, `payment_type`, `amount` (bkz. Bölüm 5), `kasa_id` (bkz. Bölüm 14) |
| `customers`, `suppliers` | Öneri/yönetim dizinleri |
| `users` | Kullanıcılar — `role` (`admin`/`staff`), şifre bcrypt hash, `failed_attempts`/`locked_until` (brute-force kilidi), `is_active` (devre dışı bırakma), `tokens_invalid_before` (zorla oturum sonlandırma), `last_login_at`; `(tenant_id, username)` composite unique (bkz. Bölüm 16 — Firma Kodu) |
| `storage` | Depolama kayıtları; `teslim_edildi`/`teslim_tarihi` ile teslim takibi |
| `products` | Ürün partileri; benzersizlik `(code, production_year, production_week, COALESCE(supplier,''))` (tarihli) veya `(code)` (tarihsiz "temel" satır) |
| `product_stock_entries` | Her partinin stok girişi / fiyat geçmişi (Malzeme Hareketleri'nin "Giriş" kaynağı) |
| `app_settings` | Genel ayarlar — firma başına bir satır (`PRIMARY KEY(tenant_id)`, bkz. Bölüm 16): `business_name`, `storage_overdue_months`, `payment_types` (bkz. Bölüm 15), `orders_default_date_filter`, `auto_register_customers`, `booking_*` (Online Randevu ayarları, Bölüm 12), `whatsapp_*` (Bölüm 12) |
| `expenses` | Masraflar (Bölüm 11) — `expense_date`, `category`, `description`, `amount`, `payment_type`, `recurring_expense_id` (opsiyonel, bkz. `recurring_expenses`), `kasa_id` (bkz. Bölüm 14) |
| `recurring_expenses` | Sabit gider şablonları (Bölüm 11) — `category`, `description`, `amount`, `payment_type`, `is_active`, `kasa_id`; "Sabit Giderleri Ekle" bunlardan `expenses` satırı üretir |
| `appointments` | Online Randevu talepleri (Bölüm 12) — `plate`, `customer_name`, `customer_phone`, `service_id`, `requested_at`, `status` (`BEKLEMEDE`/`ONAYLANDI`/`REDDEDILDI`/`TAMAMLANDI`/`IPTAL`/`GELMEDI`), `order_id` (dönüştürüldüyse), `ip_address` (hız sınırı için) |
| `whatsapp_message_log` | Randevu onayı WhatsApp bildirimi gönderim kayıtları (Bölüm 12) — tenant başına saatlik gönderim sınırı için, sadece başarılı gönderimler |
| `customer_ledger_entries` | Cari (müşteri bakiye) hareketleri (Bölüm 13) — `customer_id`, `order_id` (SIPARIS ise), `entry_type` (`SIPARIS`/`MANUEL`), `direction` (`1`=borç/`-1`=tahsilat), `amount`, `payment_type`, `entry_date`, `note`, `kasa_id` (bkz. Bölüm 14) |
| `cash_ledger_entries` | Kasa serbest manuel hareketleri (Bölüm 14) — `direction`, `amount`, `entry_date`, `description`, `kasa_id`, `transfer_pair_id` (Kasalar Arası Transfer'in eşleşen bacağı) |
| `kasalar` | Fiziksel kasa dizini (Bölüm 14) — `name`, `currency` (varsayılan TRY), `linked_payment_type` (bir ödeme tipine bağlı "sanal kasa") |
| `currency_rates` | Tenant + para birimi başına güncel manuel TL kuru (Bölüm 14) — `tenant_id`, `currency`, `rate_to_try` |

> `tenants` hariç yukarıdaki tüm tablolarda bir `tenant_id` kolonu vardır (bkz. Bölüm 16) — tüm route'lar artık buna göre filtreler, paylaşılan tek deploymentta firmalar arası veri sızıntısı yoktur (Faz 3-9 tamamlandı).

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
| PATCH | `/api/orders/bulk-payment-type` | Seçili sipariş satırlarının Ödeme Şeklini toplu değiştirir, etkilenen siparişlerin özet `payment_type`'ını yeniden hesaplar (bkz. Bölüm 3) |
| GET/POST | `/api/services`, `/api/services/:id` (PATCH/DELETE) | Hizmet yönetimi |
| GET | `/api/reports` | Aylık rapor (`created_at` bazlı Ciro/Maliyet + `expenses.expense_date` bazlı Masraf) |
| GET/POST | `/api/expenses`, `/api/expenses/:id` (PUT/DELETE) | Masraf CRUD (admin) — GET `year`/`month` filtreler; POST `{ items: [...] }` çoklu satırı tek transaction'da ekler |
| GET | `/api/expenses/categories` | Bugüne kadar fiilen kullanılmış masraf kategorileri (distinct, tüm zamanlar) — Kategori alanı önerisi için |
| GET/POST | `/api/recurring-expenses`, `/api/recurring-expenses/:id` (PUT/DELETE) | Sabit gider şablonu CRUD (admin) — PUT `is_active` ile aktif/pasif de yapılır |
| POST | `/api/auth/login`, `/api/auth/logout` | Giriş/çıkış |
| GET | `/api/auth/me` | Oturum bilgisi |
| PATCH | `/api/auth/password` | Kendi şifreni değiştir — mevcut şifre doğrulaması zorunlu |
| PATCH | `/api/auth/username` | Kendi kullanıcı adını değiştir (self-service, benzersizlik kontrolü) |
| GET/POST | `/api/users` | Kullanıcı listesi (kilit/aktiflik/son giriş dahil) / oluşturma (admin) |
| PATCH/DELETE | `/api/users/:id` | Rol değiştir, şifre sıfırla, kullanıcı adı değiştir, kilidi aç (`unlock`), oturumu sonlandır (`forceLogout`), aktif/pasif yap (`isActive`), kullanıcı sil (admin) — kendi kaydına rol/şifre/kullanıcı adı değişikliği, oturum sonlandırma, devre dışı bırakma ve silme engellenir; son aktif admin'in rolü değiştirilemez/devre dışı bırakılamaz/silinemez |
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
| GET | `/api/customers/export` | Bakiyesi olan müşterilerin Borç/Alacak listesini Excel'e aktarır (bkz. Bölüm 13) |
| GET | `/api/customers/:id/orders` | Müşterinin sipariş geçmişi (`customers.view` + `orders.view` gerektirir) |
| GET | `/api/customers/:id/ledger` | Cari hareket dökümü + canlı kümülatif bakiye (bkz. Bölüm 13) |
| POST | `/api/customers/:id/payments` | Manuel Cari tahsilat/borç kaydı ekle (bkz. Bölüm 13) |
| PUT/DELETE | `/api/customers/:id/payments/:entryId` | Manuel Cari kaydını düzenle/sil (yalnızca `MANUEL`, `SIPARIS` kayıtları hariç) |
| GET/POST | `/api/suppliers`, `/api/suppliers/:id` (PATCH/DELETE) | Tedarikçi dizini |
| GET/PUT | `/api/settings` | Genel ayarlar — işletme adı, depoda bekleme uyarı eşiği, ödeme şekilleri, `orders_default_date_filter`, `auto_register_customers`, Online Randevu (`booking_*`) ve WhatsApp (`whatsapp_*`) ayarları (admin) |
| POST | `/api/settings/regenerate-slug` | Randevu formunun public bağlantısını (`tenants.slug`) rastgele yeniler (admin, bkz. Bölüm 12) |
| GET | `/api/auth/branding` | Kimlik doğrulamasız — girilen kullanıcı adına ait firmanın `business_name`'ini döner (login ekranındaki canlı önizleme için, bkz. Bölüm 16) |
| GET/POST | `/api/appointments` | Randevu listesi (filtre: status) / personelin elle randevu girmesi (bkz. Bölüm 12) |
| PATCH/DELETE | `/api/appointments/:id` | Statü değiştir (onayla/reddet/vb. — `ONAYLANDI`da WhatsApp bildirimi tetikler) / sil |
| POST | `/api/appointments/:id/convert` | Onaylanmış randevuyu `BEKLEMEDE` bir siparişe dönüştürür |
| GET | `/api/public/randevu/:slug/meta` | Kimlik doğrulamasız — public form için tenant/hizmet/görünüm bilgisi (60sn TTL cache) |
| GET | `/api/public/randevu/:slug/slots` | Kimlik doğrulamasız — seçilen tarih+hizmet için müsait saatler |
| POST | `/api/public/randevu/:slug` | Kimlik doğrulamasız — yeni randevu talebi (honeypot + telefon/IP hız sınırı, bkz. Bölüm 12) |
| GET | `/api/kasa` | Kasa defteri — sayfalı, canlı kümülatif bakiyeli kronolojik liste (`?kasaId=`, `?from=&to=`, `?limit=&offset=`, bkz. Bölüm 14) |
| POST | `/api/kasa/entries` | Serbest manuel Para Girişi/Çıkışı ekle (hiçbir siparişe/masrafa bağlı değil) |
| PUT/DELETE | `/api/kasa/entries/:id` | Manuel kasa hareketini düzenle/sil — transfer bacağıysa (`transfer_pair_id` dolu) `PUT` reddedilir, sadece birlikte silinebilir |
| POST | `/api/kasa/transfers` | Kasalar Arası Transfer — birbirine bağlı iki `cash_ledger_entries` satırı oluşturur |
| GET/POST | `/api/kasalar`, `/api/kasalar/:id` (PATCH/DELETE) | Kasa dizini CRUD — ad, para birimi, bağlı ödeme tipi (`kasa.manage`, bkz. Bölüm 14) |
| GET/PUT | `/api/currency-rates` | Tenant başına para birimi → güncel TL kuru (manuel, bkz. Bölüm 14) |

---

## Sayfa / Rota Yapısı

```
/                             → Sipariş oluşturma ekranı (oturum gerektirir, admin gerekmez)
/randevu/:slug                → Online Randevu — public form, kimlik doğrulaması gerektirmez (bkz. Bölüm 12)
/admin/login                  → Yönetici girişi (Firma Kodu + Kullanıcı Adı + Şifre, bkz. Bölüm 16)
/admin/orders                 → Sipariş listesi (admin)
/admin/orders/:id             → Sipariş detayı / düzenleme (admin)
/admin/reports                → İstatistik & raporlama (admin)
/admin/expenses               → Masraflar (admin)
/admin/services               → Hizmet & fiyat yönetimi (admin)
/admin/storage                → Depolama yönetimi (admin)
/admin/products               → Ürün Kataloğu + Malzeme Hareketleri (admin)
/admin/customers              → Müşteri dizini + Cari (admin)
/admin/suppliers              → Tedarikçi dizini (admin)
/admin/appointments           → Randevular (bkz. Bölüm 12, admin)
/admin/appointments/ayarlar   → Randevu Ayarları — kapasite, çalışma saatleri, push/WhatsApp bildirimi, embed kodu (admin)
/admin/appointments/gorunum   → Randevu Görünümü — form stil/tema özelleştirmesi + canlı önizleme (admin)
/admin/kasa                   → Kasa (nakit kasa defteri, çoklu kasa, transfer, döviz — bkz. Bölüm 14) (admin)
/admin/profile                → Profil (oturum açmış herkes)
/admin/users                  → Kullanıcı yönetimi (admin)
/admin/settings               → Genel ayarlar (admin)
```

---

## Güvenlik Notları

- `middleware.ts`, `/` ve `/admin/*` sayfa isteklerini korur — ama **API rotalarını (`/api/*`) kapsamaz** (middleware `matcher`'ı `/api/*`'i içermez); her API dosyası kendi `getAuthUser()` kontrolünü kendisi yapar (token geçerliliği). Tüm `route.ts` dosyaları bu deseni takip eder.
- **Rol kontrolü (`role === 'admin'`) artık tüm modüllerde var.** Önce `/api/orders*` denetlendi (bkz. `e7f9022`), ardından aynı denetim `/api/products*`, `/api/storage*`, `/api/customers*`, `/api/suppliers*`, `/api/services*`, `/api/reports`'a da uygulandı: sayfa seviyesinde admin'e kapalı olan uçların (liste, oluştur, düzenle, sil, içe/dışa aktar) **API'den doğrudan çağrıldığında** herhangi bir geçerli (admin olmayan) oturumla erişilebildiği tespit edilip düzeltildi. Karşılama Görevlisi'nin (`/`) sipariş oluşturma ekranı için gerçekten ihtiyaç duyduğu, bilinçli olarak **açık bırakılan** GET uçları: `POST /api/orders`, `GET /api/customers`, `GET /api/suppliers`, `GET /api/services`, `GET /api/products/stock-codes`, `GET /api/products/stock-batches`.
- Bu ikinci denetimde yol boyunca bulunan fonksiyonel/veri bütünlüğü düzeltmeleri: **Depolama Excel içe aktarma tamamen bozuktu** (`ON CONFLICT (plate, mevsim)` hedefi olmayan bir kısıta atıfta bulunuyordu — şema bilinçli olarak böyle bir kısıt koymuyor, bkz. Veritabanı Şeması) — artık `storage/route.ts` POST'taki aynı uygulama-katmanı (aktif kayıt ara, varsa güncelle) deseniyle çalışıyor. **Ürün/parti birleştirmede** (`PATCH /api/products/:id`) geçmiş satışlar (`order_services.product_id`) hedef partiye taşınmıyordu, birleşme sonrası Malzeme Hareketleri'nden kayboluyorlardı — düzeltildi. **Müşteri ekle/güncelle**, boş telefonla tekrar eklenince mevcut telefonu sessizce siliyordu — orders'taki `COALESCE` deseniyle hizalandı. **Depo no** eşzamanlı iki kayıtta çakışabiliyordu — `storage_active_depo_no_unique` kısmi unique index eklendi. **`/api/reports`**, ayda 5 bağımsız sorguyu sırayla ve sargable olmayan `EXTRACT(...)` filtreleriyle (tam tarama) çalıştırıyordu — `Promise.all` ile paralelleştirildi, filtreler `created_at` aralık karşılaştırmasına çevrildi (Türkiye sabit UTC+3 olduğundan ay sınırları JS'de hesaplanır), gereksiz bir toplam-ciro sorgusu kaldırıldı.
- **Rol kontrolü artık daha ince taneli:** yukarıdaki "`role === 'admin'`" blok kontrolü, sayfa/aksiyon bazlı izin sistemiyle (bkz. Roller bölümü) `staff` için kaynak bazında yumuşatıldı — ama her API route'ta hâlâ `hasPermission(user, "kaynak.aksiyon")` şeklinde, aynı sıkılıkta bir sunucu-taraflı kontrol var; sadece admin'e-kapalı-blok yerine kaynak-bazlı-izin-listesi kontrolü yapılıyor. `GET /api/customers/:id/orders`'ın yalnızca `customers.view` ile finansal sipariş verisi döndürdüğü bir sızıntı bu denetimde bulunup `orders.view`'ı da zorunlu kılacak şekilde düzeltildi.
- **İzin butonlarının kısa süre yanlışlıkla görünmesi:** `usePermission` hook'u (`src/app/admin/AuthContext.tsx`), `/api/auth/me` yanıtı gelene kadarki yükleme anında hata ile "fail open" (her zaman `true`) dönüyordu — sayfa her yenilendiğinde izni olmayan bir `staff` kullanıcı, o kısa pencerede Düzenle/Sil/Yeni Ekle gibi butonları görüp tıklayabiliyordu (API zaten 403 döndürürdü, ama buton yine de görünüp kayboluyordu). Artık yüklenirken `false` dönüyor ("fail closed") — buton, izin gerçekten onaylanana kadar hiç görünmüyor.
- Yönetici şifreleri bcrypt ile hashlenmiştir.
- JWT token süresi varsayılan 12 saat, `jose` ile imzalanır/doğrulanır. Cookie `maxAge`'i bununla senkron tutulmalıdır (login route'ta elle senkronize edilir, ortak bir kaynaktan gelmez).
- **Login rate limiting:** `/api/auth/login`'e karşı art arda 5 başarısız denemede hesap 15 dakika kilitlenir (bkz. Bölüm 2). Sayaç/kilit DB'de tutulur (in-memory değil) — birden fazla sunucu örneği (serverless) arasında da tutarlı çalışır.
- **Güvenlik header'ları** (`next.config.js`, yalnızca production build'de): `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, `Strict-Transport-Security`, `Content-Security-Policy`. CSP'de `script-src` **`'unsafe-inline'` içerir** — Next.js App Router bu projenin kullandığı sürümde (14.2) her sayfada hydration/streaming verisini inline `<script>` ile gönderir (`self.__next_f.push(...)`) ve bu script'lere otomatik nonce uygulamaz; nonce tabanlı bir `script-src` denendi, inline script'ler bloklanıp hydration'ı komple kırdı (canlıda bir kez yaşandı, aynı gün düzeltildi). Kod tabanında `dangerouslySetInnerHTML`/`eval` olmadığı ve tüm SQL parametreli olduğu için bu kabul edilebilir bir risk olarak değerlendirildi. **next.config.js'e ayrıca ikinci bir CSP header'ı eklenmemelidir** (iki CSP header'ı intersection ile birleşir, biri nonce'suz `script-src 'self'` olursa hydration yine kırılır).
- **Push abonelik SSRF koruması:** `POST /api/push/subscribe` (bkz. Bölüm 12 — tarayıcı push bildirimi), kaydedilen `endpoint` alanını doğrulamadan saklıyordu ve sunucu her yeni randevuda `webpush.sendNotification` ile doğrudan o adrese istek atıyordu — `appointments.view` yetkisi olan biri rastgele bir URL kaydedip sunucuyu o adrese kör (blind) bir SSRF isteği atmaya zorlayabilirdi. Artık yalnızca bilinen push servisi host'larına (FCM, Mozilla) izin verilir.
- **Zorla oturum sonlandırma:** `users.tokens_invalid_before` alanı, bir tarihten önce imzalanmış tüm JWT'leri geçersiz sayar (bkz. Bölüm 15 — "Oturumu Sonlandır"). Karşılaştırma milisaniye hassasiyetiyle yapılır: standart JWT `iat` alanı saniyeye yuvarlandığından, token'a ayrıca özel bir `iatMs` claim'i gömülür (`src/lib/auth.ts`) — aksi halde "Oturumu Sonlandır" işleminden hemen sonra (aynı saniye içinde) girilen yeni bir oturum da yanlışlıkla geçersiz sayılabilirdi. Bu değişiklikten önce imzalanmış eski token'larda `iatMs` yoktur; öyle bir durumda saniyeye yuvarlanmış standart `iat`'a geriye dönük uyumlu şekilde düşülür.
- `getAuthUser()`, rolün yanı sıra `is_active` ve `tokens_invalid_before`'ı da her istekte DB'den taze okur — pasif bir hesabın veya zorla oturumu sonlandırılmış bir kullanıcının elindeki token'ı, süresi dolmadan bile artık geçersizdir.
- Tüm SQL sorguları parametrik (`$1, $2, ...`) — hiçbir yerde kullanıcı girdisi doğrudan sorgu metnine eklenmez; arama girdileri ayrıca `LIKE` özel karakterlerine (`%`, `_`, `\`) karşı kaçışlanır. Çoklu seçim filtreleri (ör. Sipariş Listesi'ndeki Yapılan İşlem/Tedarikçi/Ödeme Şekli) `= ANY($n)` ile parametrik diziler olarak gönderilir.
- Stok düşümü/geri ekleme işlemleri satır bazlı `FOR UPDATE` kilidi ile eşzamanlılığa karşı korunur (bkz. Veritabanı Şeması notu). Sipariş kapatma (`PATCH /api/orders/:id`) da aynı şekilde siparişi `FOR UPDATE` ile kilitleyip mevcut statüyü kontrol eder — zaten `TAMAMLANDI` bir sipariş tekrar kapatılamaz.
- **Kullanıcı yönetimi eklenirken (bkz. Bölüm 15) yetki modeli sıkılaştırıldı:** `getAuthUser()` artık `role`'ü JWT'nin imzalı payload'ından değil, **her istekte `users` tablosundan taze** okur — JWT yalnızca kimliği (userId) doğrulamak için kullanılır. Bundan önce rol JWT'ye gömülüydü ve token süresi (varsayılan 12 saat) dolana kadar değişmezdi; bu da bir kullanıcı `admin`'den `staff`'a düşürülse veya silinse bile eski yetkisiyle işlem yapmaya devam edebileceği anlamına geliyordu. Artık rolü değiştirilen/silinen bir kullanıcının bir sonraki API isteği anında yeni yetkiyi (veya "kullanıcı yok" durumunu) yansıtıyor. `middleware.ts`'e bilerek dokunulmadı (Edge runtime, yalnızca sayfa kabuğu görünürlüğünü yönetir); gerçek veri erişimi her zaman `getAuthUser()` üzerinden geçtiği için güvenlik sınırı orada tam korunuyor.
- `PATCH /api/users/:id`, hedef `id` isteği atan kullanıcının kendisiyse `role`, `password`, `username`, `forceLogout` ve `isActive: false` alanlarının hiçbirini kabul etmez — aksi halde bir admin, çalınmış/ele geçirilmiş bir oturumla mevcut şifreyi hiç bilmeden kendi şifresini değiştirip hesabı ele geçirebilir ve gerçek kullanıcıyı kalıcı olarak dışarıda bırakabilirdi (kendi şifreni/kullanıcı adını değiştirmenin tek yolu Profil sayfasıdır, `/api/auth/password` mevcut şifre doğrulaması yapar). Aynı endpoint, sistemde tek **aktif** `admin` kalmışsa o kullanıcının rolünü değiştirmeyi, devre dışı bırakmayı veya silmeyi de reddeder (`isActive` kontrolü de admin sayımına dahildir).
