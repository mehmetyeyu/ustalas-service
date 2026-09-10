"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDate, formatCurrency } from "@/lib/format";
import { useViewGuard, usePermission } from "../AuthContext";
import { useToast } from "@/components/ToastProvider";
import { flatPaymentOptions, PROTECTED_PAYMENT_TYPES } from "@/lib/paymentTypes";

// /api/settings sadece role==='admin' erişebilir (bkz. orders/[id]/page.tsx'teki
// aynı fetch) — customers.manage_balance izni verilmiş ama admin OLMAYAN bir
// personel için 403 döner ve gerçek liste hiç yüklenmez. Diğer sayfalar kendi
// firmaya özel hesaplarını içeren bir varsayılan kullanıyor; burada onun yerine
// her tenant'ta garanti var olan PROTECTED_PAYMENT_TYPES kullanılır (Cari hariç,
// Mail Order tek başına geçersiz olduğundan flatPaymentOptions ile elenir).
const DEFAULT_PAYMENT_OPTIONS = flatPaymentOptions(PROTECTED_PAYMENT_TYPES).filter((t) => t !== "Cari");

interface Customer {
  id: number;
  name: string;
  phone: string | null;
  order_count: number;
  balance: number;
}

interface CustomerOrder {
  id: number;
  plate: string;
  total_amount: number | null;
  paid_amount: number | null;
  status: "BEKLEMEDE" | "TAMAMLANDI";
  payment_type: string | null;
  created_at: string;
}

interface LedgerEntry {
  id: number;
  entry_type: "SIPARIS" | "MANUEL";
  direction: 1 | -1;
  amount: number;
  payment_type: string | null;
  entry_date: string;
  note: string | null;
  order_id: number | null;
  running_balance: number;
}

export default function CustomersPage() {
  const toast = useToast();
  const allowed = useViewGuard("customers");
  const canCreate = usePermission("customers.create");
  const canEdit = usePermission("customers.edit");
  const canDelete = usePermission("customers.delete");
  // Siparişler popup'ı tutar/ödeme tipi gibi finansal veri gösteriyor —
  // orders.view de gerekli (bkz. /api/customers/:id/orders).
  const canViewOrders = usePermission("orders.view");
  const canManageBalance = usePermission("customers.manage_balance");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Customer | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [ordersModalCustomer, setOrdersModalCustomer] = useState<Customer | null>(null);
  const [customerOrders, setCustomerOrders] = useState<CustomerOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ledgerModalCustomer, setLedgerModalCustomer] = useState<Customer | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [ledgerBalance, setLedgerBalance] = useState(0);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [paymentModalCustomer, setPaymentModalCustomer] = useState<Customer | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<number | null>(null);
  const [deletingEntryId, setDeletingEntryId] = useState<number | null>(null);
  const [paymentDirection, setPaymentDirection] = useState<1 | -1>(-1);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentType, setPaymentType] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [paymentOptions, setPaymentOptions] = useState<string[]>(DEFAULT_PAYMENT_OPTIONS);
  const [savingPayment, setSavingPayment] = useState(false);

  async function fetchCustomers() {
    // GET /api/customers tarayıcı önbelleğine izin verir (Cache-Control) — bu
    // yönetim ekranı bir ekleme/düzenleme/silmeden hemen sonra her zaman güncel
    // veriyi göstermeli, o yüzden önbellek burada devre dışı bırakılır.
    const res = await fetch("/api/customers?withCounts=1&withBalance=1", { cache: "no-store" });
    const data = await res.json();
    setCustomers(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => {
    fetchCustomers();
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d.payment_types)) setPaymentOptions(flatPaymentOptions(d.payment_types).filter((t: string) => t !== "Cari")); })
      .catch(() => { });
  }, []);

  async function openOrders(c: Customer) {
    setOrdersModalCustomer(c);
    setCustomerOrders([]);
    setOrdersLoading(true);
    try {
      const res = await fetch(`/api/customers/${c.id}/orders`);
      const data = await res.json();
      setCustomerOrders(Array.isArray(data) ? data : []);
    } finally {
      setOrdersLoading(false);
    }
  }

  async function openLedger(c: Customer) {
    setLedgerModalCustomer(c);
    setLedgerEntries([]);
    setLedgerBalance(0);
    setLedgerLoading(true);
    try {
      const res = await fetch(`/api/customers/${c.id}/ledger`, { cache: "no-store" });
      const data = await res.json();
      setLedgerEntries(Array.isArray(data.entries) ? data.entries : []);
      setLedgerBalance(Number(data.balance) || 0);
    } finally {
      setLedgerLoading(false);
    }
  }

  function openPaymentModal(c: Customer) {
    setPaymentModalCustomer(c);
    setEditingEntryId(null);
    setPaymentDirection(-1);
    setPaymentAmount("");
    setPaymentType("");
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setPaymentNote("");
  }

  function openEditEntry(c: Customer, entry: LedgerEntry) {
    setPaymentModalCustomer(c);
    setEditingEntryId(entry.id);
    setPaymentDirection(entry.direction);
    setPaymentAmount(String(entry.amount));
    setPaymentType(entry.payment_type || "");
    setPaymentDate(entry.entry_date);
    setPaymentNote(entry.note || "");
  }

  async function refreshAfterLedgerChange(customerId: number) {
    await Promise.all([
      fetchCustomers(),
      ledgerModalCustomer?.id === customerId ? openLedger(ledgerModalCustomer) : Promise.resolve(),
    ]);
  }

  async function handleDeleteEntry(customerId: number, entryId: number) {
    if (!confirm("Bu cari hareketi silmek istediğinize emin misiniz?")) return;
    if (deletingEntryId !== null) return;
    setDeletingEntryId(entryId);
    try {
      const res = await fetch(`/api/customers/${customerId}/payments/${entryId}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error || "Silinemedi.");
      await refreshAfterLedgerChange(customerId);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Hata oluştu.");
    } finally {
      setDeletingEntryId(null);
    }
  }

  async function submitPayment() {
    if (!paymentModalCustomer) return;
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Geçerli bir tutar girin.");
      return;
    }
    if (paymentDirection === -1 && !paymentType) {
      toast.error("Ödeme şekli zorunludur.");
      return;
    }
    setSavingPayment(true);
    try {
      const url = editingEntryId !== null
        ? `/api/customers/${paymentModalCustomer.id}/payments/${editingEntryId}`
        : `/api/customers/${paymentModalCustomer.id}/payments`;
      const res = await fetch(url, {
        method: editingEntryId !== null ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direction: paymentDirection,
          amount,
          payment_type: paymentDirection === -1 ? paymentType : null,
          entry_date: paymentDate || null,
          note: paymentNote.trim() || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Kaydetme başarısız.");
      setPaymentModalCustomer(null);
      await refreshAfterLedgerChange(paymentModalCustomer.id);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Hata oluştu.");
    } finally {
      setSavingPayment(false);
    }
  }

  function openNew() {
    setEditItem(null);
    setName("");
    setPhone("");
    setShowForm(true);
  }

  function openEdit(c: Customer) {
    setEditItem(c);
    setName(c.name);
    setPhone(c.phone || "");
    setShowForm(true);
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Müşteri adı zorunludur.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(editItem ? `/api/customers/${editItem.id}` : "/api/customers", {
        method: editItem ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim() || null }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Kaydetme başarısız.");
      setShowForm(false);
      await fetchCustomers();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Hata oluştu.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Bu müşteriyi silmek istediğinize emin misiniz?")) return;
    const res = await fetch(`/api/customers/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Müşteri silinemedi.");
      return;
    }
    await fetchCustomers();
  }

  const filtered = search
    ? customers.filter((c) => c.name.toLocaleLowerCase("tr-TR").includes(search.toLocaleLowerCase("tr-TR")))
    : customers;

  // Çalışana "git şu müşterilerden tahsil et" diye verilebilecek somut bir
  // özet — customers.view zaten sayfa girişinde şart koşulduğundan (bkz.
  // useViewGuard) burada ayrıca izin kontrolüne gerek yok.
  const totalDebt = customers.reduce((sum, c) => sum + (c.balance > 0.009 ? c.balance : 0), 0);
  const totalCredit = customers.reduce((sum, c) => sum + (c.balance < -0.009 ? -c.balance : 0), 0);

  if (!allowed) return null;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Müşteriler</h1>
        <div className="flex gap-2 self-start sm:self-auto">
          <button
            onClick={() => { window.location.href = "/api/customers/export"; }}
            className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium px-4 py-2 rounded-lg text-sm transition-colors"
          >
            Borç/Alacak Listesini İndir
          </button>
          {canCreate && (
            <button
              onClick={openNew}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors"
            >
              + Yeni Müşteri
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm p-4 min-w-0">
          <p className="text-xs text-gray-500 mb-1">Toplam Borç (bize)</p>
          <p className="text-xl sm:text-2xl font-bold text-red-600 truncate">{formatCurrency(totalDebt)}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4 min-w-0">
          <p className="text-xs text-gray-500 mb-1">Toplam Alacak (onlarda)</p>
          <p className="text-xl sm:text-2xl font-bold text-green-600 truncate">{formatCurrency(totalCredit)}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Müşteri adı ara..."
          className="w-full sm:w-72 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-12">Yükleniyor...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-400">Müşteri bulunamadı.</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Müşteri Adı</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Telefon</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Bakiye</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{c.name}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{c.phone || "-"}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {c.balance > 0.009 ? (
                        <span className="text-red-600 font-medium">{formatCurrency(c.balance)} (Borçlu)</span>
                      ) : c.balance < -0.009 ? (
                        <span className="text-green-600 font-medium">{formatCurrency(Math.abs(c.balance))} (Alacaklı)</span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-0.5 sm:gap-3 whitespace-nowrap">
                        {canViewOrders && (
                          <button
                            onClick={() => openLedger(c)}
                            title="Cari Hareketleri"
                            aria-label="Cari Hareketleri"
                            className="flex items-center gap-1 p-1 sm:p-0 rounded text-gray-600 hover:bg-gray-100 sm:hover:bg-transparent hover:text-gray-900 text-xs font-medium"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3M3.375 19.5h17.25c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v12.75c0 .621.504 1.125 1.125 1.125z" />
                            </svg>
                            <span className="hidden sm:inline">Cari</span>
                          </button>
                        )}
                        {c.order_count > 0 && canViewOrders && (
                          <button
                            onClick={() => openOrders(c)}
                            title="Siparişler"
                            aria-label="Siparişler"
                            className="flex items-center gap-1 p-1 sm:p-0 rounded text-gray-600 hover:bg-gray-100 sm:hover:bg-transparent hover:text-gray-900 text-xs font-medium"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
                            </svg>
                            <span className="hidden sm:inline">Siparişler</span>
                          </button>
                        )}
                        {canEdit && (
                          <button
                            onClick={() => openEdit(c)}
                            title="Düzenle"
                            aria-label="Düzenle"
                            className="flex items-center gap-1 p-1 sm:p-0 rounded text-blue-600 hover:bg-blue-50 sm:hover:bg-transparent hover:text-blue-800 text-xs font-medium"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.5 19.5H4.5" />
                            </svg>
                            <span className="hidden sm:inline">Düzenle</span>
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => handleDelete(c.id)}
                            title="Sil"
                            aria-label="Sil"
                            className="flex items-center gap-1 p-1 sm:p-0 rounded text-red-500 hover:bg-red-50 sm:hover:bg-transparent hover:text-red-700 text-xs font-medium"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>
                            <span className="hidden sm:inline">Sil</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <h2 className="text-xl font-bold text-gray-800 mb-4">
              {editItem ? "Müşteri Düzenle" : "Yeni Müşteri Ekle"}
            </h2>

            <div className="space-y-4 mb-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Müşteri Adı</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ad Soyad"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Telefon</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0555 000 00 00"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg hover:bg-gray-50"
              >
                İptal
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-2.5 rounded-lg transition-colors"
              >
                {saving ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Siparişler Modal */}
      {ordersModalCustomer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-5">
              <div>
                <h2 className="text-xl font-bold text-gray-800">{ordersModalCustomer.name} — Siparişler</h2>
                {ordersModalCustomer.phone && <p className="text-xs text-gray-400 mt-0.5">{ordersModalCustomer.phone}</p>}
              </div>
              <button onClick={() => setOrdersModalCustomer(null)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {ordersLoading ? (
              <div className="py-8 text-center text-gray-400 text-sm">Yükleniyor...</div>
            ) : customerOrders.length === 0 ? (
              <div className="py-8 text-center text-gray-400 text-sm">Bu müşteriye ait sipariş bulunamadı.</div>
            ) : (
              <div className="overflow-x-auto border border-gray-100 rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-gray-600 whitespace-nowrap">Sipariş No</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600 whitespace-nowrap">Tarih</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600 whitespace-nowrap">Plaka</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600 whitespace-nowrap">Tutar</th>
                      <th className="text-center px-3 py-2 font-medium text-gray-600 whitespace-nowrap">Durum</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {customerOrders.map((o) => (
                      <tr key={o.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-mono font-semibold text-gray-800 whitespace-nowrap">#{o.id}</td>
                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{formatDate(o.created_at)}</td>
                        <td className="px-3 py-2 font-mono text-gray-700 whitespace-nowrap">{o.plate}</td>
                        <td className="px-3 py-2 text-right text-gray-700 whitespace-nowrap">
                          {formatCurrency(Number((o.paid_amount ?? o.total_amount) || 0))}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${o.status === "TAMAMLANDI" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                            {o.status === "TAMAMLANDI" ? "Tamamlandı" : "Beklemede"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <Link href={`/admin/orders/${o.id}`} className="text-blue-600 hover:text-blue-800 text-xs font-medium">
                            Detay →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <button onClick={() => setOrdersModalCustomer(null)}
              className="w-full mt-5 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg hover:bg-gray-50">
              Kapat
            </button>
          </div>
        </div>
      )}

      {/* Cari Hareketleri Modal */}
      {ledgerModalCustomer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-5">
              <div>
                <h2 className="text-xl font-bold text-gray-800">{ledgerModalCustomer.name} — Cari Hareketleri</h2>
                <p className={`text-sm font-medium mt-0.5 ${ledgerBalance > 0.009 ? "text-red-600" : ledgerBalance < -0.009 ? "text-green-600" : "text-gray-500"}`}>
                  Bakiye: {formatCurrency(Math.abs(ledgerBalance))} {ledgerBalance > 0.009 ? "(Borçlu)" : ledgerBalance < -0.009 ? "(Alacaklı)" : ""}
                </p>
              </div>
              <button onClick={() => setLedgerModalCustomer(null)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {canManageBalance && (
              <button
                onClick={() => openPaymentModal(ledgerModalCustomer)}
                className="mb-4 bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors"
              >
                Tahsilat Al / Borç Ekle
              </button>
            )}

            {ledgerLoading ? (
              <div className="py-8 text-center text-gray-400 text-sm">Yükleniyor...</div>
            ) : ledgerEntries.length === 0 ? (
              <div className="py-8 text-center text-gray-400 text-sm">Cari hareket bulunamadı.</div>
            ) : (
              <div className="overflow-x-auto border border-gray-100 rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-gray-600 whitespace-nowrap">Tarih</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600 whitespace-nowrap">Açıklama</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600 whitespace-nowrap">Tutar</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600 whitespace-nowrap">Bakiye</th>
                      {canManageBalance && <th className="px-3 py-2"></th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {ledgerEntries.map((e) => (
                      <tr key={e.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{formatDate(e.entry_date)}</td>
                        <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
                          {e.entry_type === "SIPARIS"
                            ? <Link href={`/admin/orders/${e.order_id}`} className="text-blue-600 hover:text-blue-800">#{e.order_id} Sipariş</Link>
                            : (e.note || (e.direction === -1 ? `Tahsilat${e.payment_type ? ` (${e.payment_type})` : ""}` : "Borç"))}
                        </td>
                        <td className={`px-3 py-2 text-right font-medium whitespace-nowrap ${e.direction === 1 ? "text-red-600" : "text-green-600"}`}>
                          {e.direction === 1 ? "+" : "-"}{formatCurrency(e.amount)}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-700 whitespace-nowrap">{formatCurrency(e.running_balance)}</td>
                        {canManageBalance && (
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            {e.entry_type === "MANUEL" && (
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => openEditEntry(ledgerModalCustomer, e)}
                                  disabled={deletingEntryId === e.id}
                                  title="Düzenle"
                                  aria-label="Düzenle"
                                  className="text-blue-600 hover:text-blue-800 disabled:opacity-40 text-xs font-medium"
                                >
                                  Düzenle
                                </button>
                                <button
                                  onClick={() => handleDeleteEntry(ledgerModalCustomer.id, e.id)}
                                  disabled={deletingEntryId === e.id}
                                  title="Sil"
                                  aria-label="Sil"
                                  className="text-red-500 hover:text-red-700 disabled:opacity-40 text-xs font-medium"
                                >
                                  {deletingEntryId === e.id ? "Siliniyor..." : "Sil"}
                                </button>
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <button onClick={() => setLedgerModalCustomer(null)}
              className="w-full mt-5 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg hover:bg-gray-50">
              Kapat
            </button>
          </div>
        </div>
      )}

      {/* Tahsilat Al / Borç Ekle Modal */}
      {paymentModalCustomer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <h2 className="text-xl font-bold text-gray-800 mb-4">
              {paymentModalCustomer.name}{editingEntryId !== null ? " — Hareketi Düzenle" : ""}
            </h2>

            <div className="space-y-4 mb-5">
              <div className="flex gap-2">
                <button
                  onClick={() => setPaymentDirection(-1)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border ${paymentDirection === -1 ? "bg-green-600 text-white border-green-600" : "border-gray-300 text-gray-700"}`}
                >
                  Tahsilat Al
                </button>
                <button
                  onClick={() => setPaymentDirection(1)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border ${paymentDirection === 1 ? "bg-red-600 text-white border-red-600" : "border-gray-300 text-gray-700"}`}
                >
                  Borç Ekle
                </button>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tutar</label>
                <input
                  type="number"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {paymentDirection === -1 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ödeme Şekli</label>
                  <select
                    value={paymentType}
                    onChange={(e) => setPaymentType(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Seçiniz</option>
                    {/* Düzenlenen kayıt, Genel Ayarlar'dan sonradan kaldırılmış/
                        yeniden adlandırılmış bir ödeme şekliyle oluşturulmuş
                        olabilir — mevcut listede yoksa seçili değer görünmez
                        olmasın diye (ve yanlışlıkla başka bir tipe değiştirilip
                        kaydedilmesin diye) en üste eklenir. */}
                    {paymentType && !paymentOptions.includes(paymentType) && (
                      <option value={paymentType}>{paymentType} (artık listede yok)</option>
                    )}
                    {paymentOptions.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tarih</label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Açıklama (opsiyonel)</label>
                <input
                  type="text"
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setPaymentModalCustomer(null)}
                className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg hover:bg-gray-50"
              >
                İptal
              </button>
              <button
                onClick={submitPayment}
                disabled={savingPayment}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-2.5 rounded-lg transition-colors"
              >
                {savingPayment ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
