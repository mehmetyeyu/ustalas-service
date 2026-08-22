"use client";

import { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/format";
import { DEFAULT_EXPENSE_CATEGORIES } from "@/lib/expenseCategories";
import { useViewGuard, usePermission } from "../AuthContext";

interface Expense {
  id: number;
  expense_date: string;
  category: string;
  description: string | null;
  amount: number;
  payment_type: string | null;
  recurring_expense_id: number | null;
}

interface ExpenseRow {
  expense_date: string;
  category: string;
  description: string;
  amount: string;
  payment_type: string;
  recurring_expense_id: number | null;
}

interface RecurringExpense {
  id: number;
  category: string;
  description: string | null;
  amount: number;
  payment_type: string | null;
  is_active: boolean;
}

const now = new Date();
const months = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];
const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyRow(prev?: ExpenseRow): ExpenseRow {
  // Aynı gün birden fazla masraf girilmesi yaygın olduğundan, yeni satır
  // önceki satırın tarih/ödeme şeklini devralır — kategori/açıklama/tutar
  // satırdan satıra farklı olacağından boş bırakılır.
  return {
    expense_date: prev?.expense_date || todayStr(),
    category: "",
    description: "",
    amount: "",
    payment_type: prev?.payment_type || "",
    recurring_expense_id: null,
  };
}

function emptyRecurringForm(): { category: string; description: string; amount: string; payment_type: string } {
  return { category: "", description: "", amount: "", payment_type: "" };
}

export default function ExpensesPage() {
  const allowed = useViewGuard("expenses");
  const canCreate = usePermission("expenses.create");
  const canEdit = usePermission("expenses.edit");
  const canDelete = usePermission("expenses.delete");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [items, setItems] = useState<Expense[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [paymentOptions, setPaymentOptions] = useState<string[]>([]);
  const [usedCategories, setUsedCategories] = useState<string[]>([]);
  const [recurringTemplates, setRecurringTemplates] = useState<RecurringExpense[]>([]);

  // Yeni Masraf: Sipariş Oluşturma'daki İşlem Satırları gibi tek seferde
  // birden fazla satır girilebilir (bkz. POST /api/expenses — { items: [...] }).
  const [showAddForm, setShowAddForm] = useState(false);
  const [rows, setRows] = useState<ExpenseRow[]>([emptyRow()]);
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState("");

  // Düzenle: her zaman tek bir kaydı hedefler, ayrı (küçük) bir form.
  const [editExpense, setEditExpense] = useState<Expense | null>(null);
  const [editRow, setEditRow] = useState<ExpenseRow>(emptyRow());
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  // Sabit Giderler yönetimi — Masraflar sayfası içine gömülü küçük bir panel
  // (bkz. src/app/api/recurring-expenses). Aynı panel içinde inline
  // ekle/düzenle formu (recForm) toggle edilir.
  const [showRecurringModal, setShowRecurringModal] = useState(false);
  const [recFormOpen, setRecFormOpen] = useState(false);
  const [recEditingId, setRecEditingId] = useState<number | null>(null);
  const [recForm, setRecForm] = useState(emptyRecurringForm());
  const [recSaving, setRecSaving] = useState(false);
  const [recError, setRecError] = useState("");

  async function fetchExpenses() {
    setLoading(true);
    const res = await fetch(`/api/expenses?year=${year}&month=${month}`, { cache: "no-store" });
    const data = await res.json();
    setItems(Array.isArray(data.items) ? data.items : []);
    setTotal(data.total || 0);
    setLoading(false);
  }

  useEffect(() => {
    fetchExpenses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  async function fetchRecurringTemplates() {
    const res = await fetch("/api/recurring-expenses", { cache: "no-store" });
    const data = await res.json();
    setRecurringTemplates(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d.payment_types)) setPaymentOptions(d.payment_types); })
      .catch(() => {});
    fetch("/api/expenses/categories")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setUsedCategories(d); })
      .catch(() => {});
    fetchRecurringTemplates();
  }, []);

  // Seçili ay için henüz masraf satırına dönüştürülmemiş, aktif sabit gider
  // şablonları — "Sabit Giderleri Ekle" butonunun etkinliğini ve pre-fill
  // içeriğini belirler. items zaten seçili ay için yüklü olduğundan (bkz.
  // fetchExpenses), ekstra bir sorguya gerek yok.
  const addedRecurringIds = new Set(items.map((e) => e.recurring_expense_id).filter((id): id is number => id != null));
  const unaddedRecurringTemplates = recurringTemplates.filter((t) => t.is_active && !addedRecurringIds.has(t.id));

  // Kategori önerileri: bir oto/lastik servisinde sık görülen kalemlerin sabit
  // listesi (bkz. src/lib/expenseCategories.ts) + bugüne kadar fiilen
  // kullanılmış tüm kategoriler (yalnızca seçili aya değil, tüm zamanlara ait) —
  // serbest metin girişini engellemez, sadece datalist önerisidir.
  const categoryOptions = Array.from(new Set([...DEFAULT_EXPENSE_CATEGORIES, ...usedCategories])).sort();

  function openAdd() {
    setRows([emptyRow()]);
    setAddError("");
    setShowAddForm(true);
  }

  function openAddFromRecurring() {
    if (unaddedRecurringTemplates.length === 0) return;
    // Görüntülenen ay içinde bugün varsa bugünün tarihi, değilse (geçmiş/gelecek
    // bir ay görüntüleniyorsa) o ayın ilk günü varsayılan tarih olur.
    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;
    const defaultDate = isCurrentMonth ? todayStr() : `${year}-${String(month).padStart(2, "0")}-01`;
    setRows(unaddedRecurringTemplates.map((t) => ({
      expense_date: defaultDate,
      category: t.category,
      description: t.description || "",
      amount: String(t.amount),
      payment_type: t.payment_type || "",
      recurring_expense_id: t.id,
    })));
    setAddError("");
    setShowAddForm(true);
  }

  function updateRow(index: number, patch: Partial<ExpenseRow>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow(prev[prev.length - 1])]);
  }

  function removeRow(index: number) {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  const rowsTotal = rows.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);

  async function handleSaveRows() {
    setAddError("");
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.expense_date) return setAddError(`${i + 1}. satır: Tarih zorunludur.`);
      if (!r.category.trim()) return setAddError(`${i + 1}. satır: Kategori zorunludur.`);
      const amountValue = parseFloat(r.amount);
      if (!Number.isFinite(amountValue) || amountValue <= 0) return setAddError(`${i + 1}. satır: Geçersiz tutar.`);
    }
    setAddSaving(true);
    try {
      const items = rows.map((r) => ({
        expense_date: r.expense_date,
        category: r.category.trim(),
        description: r.description.trim() || null,
        amount: parseFloat(r.amount),
        payment_type: r.payment_type || null,
        recurring_expense_id: r.recurring_expense_id,
      }));
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Kayıt başarısız.");
      }
      setShowAddForm(false);
      setUsedCategories((prev) => Array.from(new Set([...prev, ...items.map((i) => i.category)])));
      await fetchExpenses();
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : "Hata oluştu.");
    } finally {
      setAddSaving(false);
    }
  }

  function openEdit(exp: Expense) {
    setEditExpense(exp);
    setEditRow({
      expense_date: exp.expense_date,
      category: exp.category,
      description: exp.description || "",
      amount: String(exp.amount),
      payment_type: exp.payment_type || "",
      recurring_expense_id: exp.recurring_expense_id,
    });
    setEditError("");
  }

  async function handleSaveEdit() {
    if (!editExpense) return;
    setEditError("");
    if (!editRow.expense_date) return setEditError("Tarih zorunludur.");
    if (!editRow.category.trim()) return setEditError("Kategori zorunludur.");
    const amountValue = parseFloat(editRow.amount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) return setEditError("Geçersiz tutar.");
    setEditSaving(true);
    try {
      const body = {
        expense_date: editRow.expense_date,
        category: editRow.category.trim(),
        description: editRow.description.trim() || null,
        amount: amountValue,
        payment_type: editRow.payment_type || null,
      };
      const res = await fetch(`/api/expenses/${editExpense.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Güncelleme başarısız.");
      setEditExpense(null);
      setUsedCategories((prev) => (prev.includes(body.category) ? prev : [...prev, body.category]));
      await fetchExpenses();
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : "Hata oluştu.");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Bu masrafı silmek istediğinize emin misiniz?")) return;
    await fetch(`/api/expenses/${id}`, { method: "DELETE" });
    await fetchExpenses();
  }

  function openRecNew() {
    setRecEditingId(null);
    setRecForm(emptyRecurringForm());
    setRecError("");
    setRecFormOpen(true);
  }

  function openRecEdit(t: RecurringExpense) {
    setRecEditingId(t.id);
    setRecForm({
      category: t.category,
      description: t.description || "",
      amount: String(t.amount),
      payment_type: t.payment_type || "",
    });
    setRecError("");
    setRecFormOpen(true);
  }

  async function handleSaveRecurring() {
    setRecError("");
    if (!recForm.category.trim()) return setRecError("Kategori zorunludur.");
    const amountValue = parseFloat(recForm.amount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) return setRecError("Geçersiz tutar.");
    setRecSaving(true);
    try {
      const body = {
        category: recForm.category.trim(),
        description: recForm.description.trim() || null,
        amount: amountValue,
        payment_type: recForm.payment_type || null,
        is_active: true,
      };
      const res = await fetch(
        recEditingId ? `/api/recurring-expenses/${recEditingId}` : "/api/recurring-expenses",
        {
          method: recEditingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) throw new Error("Kayıt başarısız.");
      setRecFormOpen(false);
      await fetchRecurringTemplates();
    } catch (err: unknown) {
      setRecError(err instanceof Error ? err.message : "Hata oluştu.");
    } finally {
      setRecSaving(false);
    }
  }

  async function handleToggleRecurringActive(t: RecurringExpense) {
    await fetch(`/api/recurring-expenses/${t.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: t.category,
        description: t.description,
        amount: t.amount,
        payment_type: t.payment_type,
        is_active: !t.is_active,
      }),
    });
    await fetchRecurringTemplates();
  }

  async function handleDeleteRecurring(id: number) {
    if (!confirm("Bu sabit gider tanımını silmek istediğinize emin misiniz? (Geçmiş masraf kayıtları etkilenmez.)")) return;
    await fetch(`/api/recurring-expenses/${id}`, { method: "DELETE" });
    await fetchRecurringTemplates();
  }

  if (!allowed) return null;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Masraflar</h1>
        <div className="flex gap-2 flex-wrap">
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {months.map((m, i) => (
              <option key={i} value={i + 1}>{m}</option>
            ))}
          </select>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button
            onClick={() => setShowRecurringModal(true)}
            className="border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium px-4 py-2 rounded-lg text-sm transition-colors"
          >
            Sabit Giderler
          </button>
          {canCreate && recurringTemplates.some((t) => t.is_active) && (
            <button
              onClick={openAddFromRecurring}
              disabled={unaddedRecurringTemplates.length === 0}
              title={unaddedRecurringTemplates.length === 0 ? "Bu ay için tüm sabit giderler zaten eklenmiş." : undefined}
              className="border border-blue-300 text-blue-700 hover:bg-blue-50 disabled:border-gray-200 disabled:text-gray-300 disabled:hover:bg-transparent font-medium px-4 py-2 rounded-lg text-sm transition-colors"
            >
              Sabit Giderleri Ekle{unaddedRecurringTemplates.length > 0 ? ` (${unaddedRecurringTemplates.length})` : ""}
            </button>
          )}
          {canCreate && (
          <button
            onClick={openAdd}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors"
          >
            + Yeni Masraf
          </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-4 mb-6 flex items-center justify-between">
        <p className="text-sm text-gray-500">Seçili ay toplam masraf</p>
        <p className="text-xl font-bold text-red-500">{formatCurrency(total)}</p>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-12">Yükleniyor...</div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-400">
          Bu ay için masraf kaydı yok.
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Tarih</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Kategori</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Açıklama</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Ödeme Şekli</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Tutar</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((exp) => (
                  <tr key={exp.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                      {new Date(`${exp.expense_date}T00:00:00`).toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" })}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">
                      {exp.category}
                      {exp.recurring_expense_id != null && (
                        <span className="ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-600 align-middle">Sabit</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{exp.description || <span className="text-gray-400">—</span>}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{exp.payment_type || <span className="text-gray-400">—</span>}</td>
                    <td className="px-4 py-3 text-right text-gray-800 font-medium whitespace-nowrap">{formatCurrency(exp.amount)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-0.5 sm:gap-3 whitespace-nowrap">
                        {canEdit && (
                        <button
                          onClick={() => openEdit(exp)}
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
                          onClick={() => handleDelete(exp.id)}
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

      <datalist id="expense-category-options">
        {categoryOptions.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      {/* Yeni Masraf — çoklu satır formu */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-4xl max-h-[90vh] flex flex-col">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Yeni Masraf Ekle</h2>

            {addError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                {addError}
              </div>
            )}

            <div className="overflow-auto flex-1 -mx-6 px-6">
              {/* Masaüstü: tablo. Mobil: her satır kendi kartı (tabloyu yatay
                  kaydırmaya zorlamak yerine dikey akan alanlar kullanılır). */}
              <div className="hidden sm:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs font-medium text-gray-500">
                      <th className="pb-2 pr-2 w-36">Tarih</th>
                      <th className="pb-2 pr-2">Kategori</th>
                      <th className="pb-2 pr-2">Açıklama</th>
                      <th className="pb-2 pr-2 w-40">Ödeme Şekli</th>
                      <th className="pb-2 pr-2 w-32 text-right">Tutar (₺)</th>
                      <th className="pb-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i} className="align-top">
                        <td className="pb-2 pr-2">
                          <input
                            type="date"
                            value={row.expense_date}
                            onChange={(e) => updateRow(i, { expense_date: e.target.value })}
                            className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                        <td className="pb-2 pr-2">
                          <input
                            type="text"
                            list="expense-category-options"
                            value={row.category}
                            onChange={(e) => updateRow(i, { category: e.target.value })}
                            placeholder="Kira, Elektrik..."
                            className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                        <td className="pb-2 pr-2">
                          <input
                            type="text"
                            value={row.description}
                            onChange={(e) => updateRow(i, { description: e.target.value })}
                            className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                        <td className="pb-2 pr-2">
                          <select
                            value={row.payment_type}
                            onChange={(e) => updateRow(i, { payment_type: e.target.value })}
                            className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">Belirtilmedi</option>
                            {paymentOptions.map((p) => (
                              <option key={p} value={p}>{p}</option>
                            ))}
                          </select>
                        </td>
                        <td className="pb-2 pr-2">
                          <input
                            type="number"
                            value={row.amount}
                            onChange={(e) => updateRow(i, { amount: e.target.value })}
                            min="0"
                            step="0.01"
                            className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                        <td className="pb-2 text-center">
                          <button
                            type="button"
                            onClick={() => removeRow(i)}
                            disabled={rows.length === 1}
                            title="Satırı Sil"
                            aria-label="Satırı Sil"
                            className="p-2 rounded text-red-500 hover:bg-red-50 disabled:text-gray-300 disabled:hover:bg-transparent"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobil kart görünümü */}
              <div className="sm:hidden space-y-3">
                {rows.map((row, i) => (
                  <div key={i} className="border border-gray-200 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-500">Satır {i + 1}</span>
                      <button
                        type="button"
                        onClick={() => removeRow(i)}
                        disabled={rows.length === 1}
                        className="text-xs text-red-500 disabled:text-gray-300"
                      >
                        Satırı Sil
                      </button>
                    </div>
                    <input
                      type="date"
                      value={row.expense_date}
                      onChange={(e) => updateRow(i, { expense_date: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="text"
                      list="expense-category-options"
                      value={row.category}
                      onChange={(e) => updateRow(i, { category: e.target.value })}
                      placeholder="Kategori (Kira, Elektrik...)"
                      className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="text"
                      value={row.description}
                      onChange={(e) => updateRow(i, { description: e.target.value })}
                      placeholder="Açıklama (opsiyonel)"
                      className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="flex gap-2">
                      <select
                        value={row.payment_type}
                        onChange={(e) => updateRow(i, { payment_type: e.target.value })}
                        className="flex-1 border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Ödeme Şekli</option>
                        {paymentOptions.map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        value={row.amount}
                        onChange={(e) => updateRow(i, { amount: e.target.value })}
                        min="0"
                        step="0.01"
                        placeholder="Tutar (₺)"
                        className="w-32 border border-gray-300 rounded-lg px-2 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-3 mt-1 border-t border-gray-100 flex items-center justify-between">
              <button
                type="button"
                onClick={addRow}
                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
              >
                + Satır Ekle
              </button>
              <p className="text-sm text-gray-600">
                Toplam: <span className="font-semibold text-gray-800">{formatCurrency(rowsTotal)}</span>
              </p>
            </div>

            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setShowAddForm(false)}
                className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg hover:bg-gray-50"
              >
                İptal
              </button>
              <button
                onClick={handleSaveRows}
                disabled={addSaving}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-2.5 rounded-lg transition-colors"
              >
                {addSaving ? "Kaydediliyor..." : rows.length > 1 ? `${rows.length} Masrafı Kaydet` : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Düzenle — tek kayıt */}
      {editExpense && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Masraf Düzenle</h2>

            {editError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                {editError}
              </div>
            )}

            <div className="space-y-4 mb-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tarih</label>
                <input
                  type="date"
                  value={editRow.expense_date}
                  onChange={(e) => setEditRow((r) => ({ ...r, expense_date: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kategori</label>
                <input
                  type="text"
                  list="expense-category-options"
                  value={editRow.category}
                  onChange={(e) => setEditRow((r) => ({ ...r, category: e.target.value }))}
                  placeholder="Kira, Elektrik, Personel..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Açıklama <span className="text-gray-400 font-normal">(opsiyonel)</span></label>
                <input
                  type="text"
                  value={editRow.description}
                  onChange={(e) => setEditRow((r) => ({ ...r, description: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tutar (₺)</label>
                <input
                  type="number"
                  value={editRow.amount}
                  onChange={(e) => setEditRow((r) => ({ ...r, amount: e.target.value }))}
                  min="0"
                  step="0.01"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ödeme Şekli <span className="text-gray-400 font-normal">(opsiyonel)</span></label>
                <select
                  value={editRow.payment_type}
                  onChange={(e) => setEditRow((r) => ({ ...r, payment_type: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Belirtilmedi</option>
                  {paymentOptions.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setEditExpense(null)}
                className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg hover:bg-gray-50"
              >
                İptal
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={editSaving}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-2.5 rounded-lg transition-colors"
              >
                {editSaving ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sabit Giderler — Masraflar sayfasına gömülü yönetim paneli */}
      {showRecurringModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-xl font-bold text-gray-800">Sabit Giderler</h2>
              <button
                onClick={() => { setShowRecurringModal(false); setRecFormOpen(false); }}
                aria-label="Kapat"
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              Kira gibi ayda bir tekrar eden giderleri burada bir kere tanımla — Masraflar ekranındaki
              &quot;Sabit Giderleri Ekle&quot; ile her ay tek tıkla o ayın masrafına dönüştürürsün.
            </p>

            <div className="overflow-auto flex-1 -mx-6 px-6">
              {recurringTemplates.length === 0 && !recFormOpen ? (
                <div className="text-center text-gray-400 py-8 text-sm">Henüz sabit gider tanımlanmadı.</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {recurringTemplates.map((t) => (
                    <div key={t.id} className={`py-3 flex items-start justify-between gap-3 ${!t.is_active ? "opacity-50" : ""}`}>
                      <div className="min-w-0">
                        <p className="font-medium text-gray-800 truncate">{t.category}</p>
                        {t.description && <p className="text-xs text-gray-500 truncate">{t.description}</p>}
                        <p className="text-xs text-gray-400 mt-0.5">
                          {formatCurrency(t.amount)}{t.payment_type ? ` · ${t.payment_type}` : ""}{!t.is_active ? " · Pasif" : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 text-xs">
                        {canEdit && (
                          <button onClick={() => handleToggleRecurringActive(t)} className="text-gray-500 hover:text-gray-700 font-medium">
                            {t.is_active ? "Pasif Yap" : "Aktifleştir"}
                          </button>
                        )}
                        {canEdit && <button onClick={() => openRecEdit(t)} className="text-blue-600 hover:text-blue-800 font-medium">Düzenle</button>}
                        {canDelete && <button onClick={() => handleDeleteRecurring(t.id)} className="text-red-500 hover:text-red-700 font-medium">Sil</button>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {recFormOpen && (
                <div className="mt-4 border border-gray-200 rounded-lg p-3 space-y-3">
                  {recError && (
                    <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs">{recError}</div>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Kategori</label>
                    <input
                      type="text"
                      list="expense-category-options"
                      value={recForm.category}
                      onChange={(e) => setRecForm((f) => ({ ...f, category: e.target.value }))}
                      placeholder="Kira, Personel Maaşı..."
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Açıklama <span className="text-gray-400 font-normal">(opsiyonel)</span></label>
                    <input
                      type="text"
                      value={recForm.description}
                      onChange={(e) => setRecForm((f) => ({ ...f, description: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-700 mb-1">Tutar (₺)</label>
                      <input
                        type="number"
                        value={recForm.amount}
                        onChange={(e) => setRecForm((f) => ({ ...f, amount: e.target.value }))}
                        min="0"
                        step="0.01"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-700 mb-1">Ödeme Şekli</label>
                      <select
                        value={recForm.payment_type}
                        onChange={(e) => setRecForm((f) => ({ ...f, payment_type: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Belirtilmedi</option>
                        {paymentOptions.map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setRecFormOpen(false)}
                      className="flex-1 border border-gray-300 text-gray-700 font-medium py-2 rounded-lg text-sm hover:bg-gray-50"
                    >
                      İptal
                    </button>
                    <button
                      onClick={handleSaveRecurring}
                      disabled={recSaving}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-2 rounded-lg text-sm transition-colors"
                    >
                      {recSaving ? "Kaydediliyor..." : "Kaydet"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {!recFormOpen && canCreate && (
              <button
                onClick={openRecNew}
                className="mt-4 text-blue-600 hover:text-blue-800 text-sm font-medium text-left"
              >
                + Yeni Sabit Gider
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
