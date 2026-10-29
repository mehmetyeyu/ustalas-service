// Süper Admin'in "firmayı kalıcı sil" işleminin (DELETE
// /api/super-admin/tenants/[id]) firma verisini silme sırası. Route dosyası
// dışında, tenantDeletion.test.ts şemadaki her tenant_id'li tablonun burada
// olduğunu doğrulayabilsin diye.
//
// Silme sırası, database/schema.sql'deki tüm tenant_id/composite FK'ların
// RESTRICT (varsayılan) olduğu gerçek bağımlılık grafiğini takip eder —
// sıra yanlış olsa bile bir sonraki adım FK ihlaliyle başarısız olur ve TÜM
// transaction geri alınır (asla yarım/sessiz veri kalmaz), ama doğru sırayla
// tek seferde tamamlanması amaçlanır. orders/products/quotes'a CASCADE ile
// bağlı alt tablolar (bkz. TENANT_CASCADE_CHILD_TABLES) ayrıca silinmez —
// ebeveynleri silinince otomatik gider.
// NOT (bulundu 2026-10-29): quotes/quote_counters ve monthly_financials
// eksikti — teklif açmış ya da Yıllık Özet kaydetmiş bir firma silinemiyordu.
// Aynısı tekrar olmasın diye tenantDeletion.test.ts şemayı tarar.
// NOT (bulundu 2026-10-01): iyzico_checkout_sessions/iyzico_payments/
// billing_events/audit_log/support_ticket_messages/support_tickets/
// calendar_notes eksikti — bu 7 tablodan herhangi birinde satırı olan bir
// firma (ör. destek talebi açmış, takvim notu eklemiş, bir iyzico ödeme
// denemesi geçmiş) silinmeye çalışılınca foreign key hatasıyla patlardı.
// Sıra: support_ticket_messages → support_tickets VE calendar_notes,
// users'tan ÖNCE gelmeli (created_by/sender_id NOT NULL değil ama CASCADE
// da değil) — diğer 4 yeni tablo sadece tenant_id'ye bağlı, herhangi bir yere
// eklenebilir.
export const TENANT_ID_TABLES_IN_DELETE_ORDER = [
  "push_subscriptions",
  "whatsapp_message_log",
  "iyzico_checkout_sessions",
  "iyzico_payments",
  "billing_events",
  "audit_log",
  "appointments",
  "customer_ledger_entries",
  "cash_ledger_entries",
  "expenses",
  "recurring_expenses",
  // quotes, quote_lines'ı CASCADE ile götürür; quote_lines.service_id
  // services'e RESTRICT bağlı ve quotes.created_by users'a bağlı — ikisinden
  // de önce gelmeli.
  "quotes",
  "quote_counters",
  "orders",
  "products",
  "kasalar",
  "currency_rates",
  "customers",
  "suppliers",
  "services",
  "storage",
  "app_settings",
  "support_ticket_messages",
  "support_tickets",
  "calendar_notes",
  // updated_by → users
  "monthly_financials",
  "users",
  // orders/storage/appointments.vehicle_id SET NULL — onlardan sonra da
  // silinebilir, ama en sona konunca bağlantı hiç güncellenmez.
  "vehicles",
] as const;

// orders/products/quotes'a ON DELETE CASCADE ile bağlı alt tablolar —
// tenant_id'leri var ama ebeveynle birlikte gittikleri için listede yoklar.
export const TENANT_CASCADE_CHILD_TABLES = ["order_services", "order_payments", "product_stock_entries", "quote_lines"] as const;
