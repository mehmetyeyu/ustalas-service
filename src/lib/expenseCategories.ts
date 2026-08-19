// Masraf formundaki Kategori alanı için başlangıç önerileri — ayrı bir dizin
// tablosu yok (services/suppliers gibi), bu yüzden lastik/oto servis
// firmalarında sık görülen kalemler burada sabit bir liste olarak tutulur.
// Serbest metin girişini engellemez, sadece datalist önerisidir — fiilen
// kullanılan kategoriler (bkz. /api/expenses/categories) bu listeye eklenir.
export const DEFAULT_EXPENSE_CATEGORIES = [
  "Kira",
  "Elektrik",
  "Su",
  "Doğalgaz",
  "Personel Maaşı",
  "SGK Primi",
  "İnternet / Telefon",
  "Kırtasiye",
  "Temizlik",
  "Ekipman Bakım / Onarım",
  "Nakliye / Kargo",
  "Reklam / Pazarlama",
  "Vergi / Resmi Ödeme",
  "Sigorta",
  "Araç Yakıtı",
  "Diğer",
];
