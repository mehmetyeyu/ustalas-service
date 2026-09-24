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
