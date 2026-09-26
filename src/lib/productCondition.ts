// Ürün Kataloğu Taslağı'ndaki "Yüksek" öncelikli alanlar için paylaşılan
// sabitler/saf fonksiyonlar — hem src/app/admin/products/page.tsx hem
// src/app/api/products/barcode/route.ts (autofill) tarafından kullanılır.

// Mevcut Hizmetler listesindeki (bkz. services.tracks_size) servis
// isimleriyle BİREBİR aynı — personel zaten bu 4 ismi biliyor, yeni bir
// isimlendirme öğrenmesine gerek yok.
export const PRODUCT_TYPE_OPTIONS = ["Lastik", "Jant", "İkinci El Lastik", "İkinci El Jant", "Aksesuar"] as const;
export type ProductType = (typeof PRODUCT_TYPE_OPTIONS)[number];

// Kondisyon, Diş Derinliği'nden OTOMATİK hesaplanır — elle girilmez, DB'de
// saklanmaz (bkz. database/schema.sql tread_depth_mm notu). Eşik kullanıcı
// tarafından onaylandı: referans kaynak sitenin (ikinciellastik.com) kendi
// kademesiyle aynı — 7mm ve üzeri "Çok İyi" (o sitede 12 ay garanti emsali),
// altı "İyi".
export function computeCondition(mm: number | null): "Çok İyi" | "İyi" | null {
  if (mm == null || !Number.isFinite(mm) || mm < 0) return null;
  return mm >= 7 ? "Çok İyi" : "İyi";
}

// AB Lastik Etiketi (Faz 2) — Yakıt Verimliliği ve Islak Zemin Tutuşu
// sınıfları. Güncel yönetmelik A-E kullanıyor ama dükkânda hâlâ eski
// (2021 öncesi, F/G sınıflı) fiziksel etiketli stok olabileceğinden A-G
// tutulur — kullanıcı elindeki gerçek etikette ne yazıyorsa onu girebilsin.
export const EU_LABEL_CLASSES = ["A", "B", "C", "D", "E", "F", "G"] as const;
// Dış yuvarlanma gürültüsü "ses dalgası" sembol sayısı (1-3) — yönetmelik
// değişse de bu kademe hiç değişmedi.
export const EU_NOISE_CLASSES = [1, 2, 3] as const;

// Minimum Stok Eşiği (Faz 2) — ürün listesindeki stok rozetinin hangi
// renkte gösterileceğine karar veren saf mantık. Eşik tanımlanmamışsa
// ("null") sadece "tükendi/stokta var" 2 kademeli eski davranış korunur.
export function stockLevel(totalStock: number, minThreshold: number | null): "out" | "low" | "ok" {
  if (totalStock <= 0) return "out";
  if (minThreshold != null && totalStock <= minThreshold) return "low";
  return "ok";
}
