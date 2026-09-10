// ILIKE '%...%' aramalarında kullanıcı girdisindeki %, _ ve \ karakterleri
// LIKE joker karakteri olarak yorumlanmasın diye kaçışlanır (ör. bir müşteri
// adında gerçekten "%" geçiyorsa arama kırılmasın/yanlış eşleşmesin diye).
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}
