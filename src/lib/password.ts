// Tüm şifre hash'leri bu cost ile üretilir (login, şifre değiştirme, kullanıcı
// ekleme/sıfırlama, firma kaydı). Login, bundan farklı cost'lu bir hash
// gördüğünde (ör. elle/harici araçla seed edilmiş $2a$15$ — her girişte
// 32 kat CPU) doğru şifreyle girişte onu bu cost'a yeniden yazar, bu yüzden
// tek yerden tanımlı olmalı. 10, OWASP'ın bcrypt için alt sınırı.
export const BCRYPT_COST = 10;
