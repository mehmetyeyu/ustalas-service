// Yazdırma pencerelerinde (bkz. printWorkOrder — admin/orders/[id]/page.tsx,
// printLabel — admin/storage/page.tsx) HTML, React JSX render'ı ile DEĞİL,
// elle kurulmuş bir string'in `document.write()` ile basılmasıyla oluşuyor —
// React'in otomatik kaçışlaması burada devreye GİRMEZ. Müşteri adı/not gibi
// serbest metin alanları bu string'lere gömülmeden önce kaçışlanmazsa, bir
// müşteri/randevu formu üzerinden (kimlik doğrulamasız) girilen bir
// `<img onerror=...>` gibi payload, o siparişi yazdıran personelin
// TARAYICI OTURUMUNDA çalışır (gerçek bir denemede doğrulandı — stored XSS).
export function escapeHtml(value: unknown): string {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
