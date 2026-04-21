"use client";

import { useEffect, useState, useRef } from "react";

interface StorageItem {
  id: number;
  depo_no: number | null;
  plate: string | null;
  customer_name: string | null;
  phone: string | null;
  ebat: string | null;
  marka: string | null;
  dis_derinligi: string | null;
  adet: number | null;
  mevsim: string | null;
  aciklama: string | null;
  islem_tarihi: string | null;
  teslim_edildi: boolean;
  teslim_tarihi: string | null;
}

const MEVSIM_OPTIONS = ["Kışlık", "Yazlık", "Dört Mevsim"];

const TIRE_BRANDS = [
  "Bridgestone", "Continental", "Dunlop", "Falken", "Firestone",
  "Goodyear", "Hankook", "Kumho", "Lassa", "Laufenn", "Maxxis",
  "Michelin", "Nexen", "Nokian", "Pirelli", "Toyo", "Uniroyal",
  "Vredestein", "Yokohama",
];

const TIRE_SIZES = [
  // R13
  "155/70R13", "165/70R13", "175/70R13",
  // R14
  "165/70R14", "175/65R14", "185/60R14", "185/65R14", "195/60R14",
  // R15
  "185/55R15", "185/65R15", "195/50R15", "195/55R15", "195/60R15", "195/65R15", "205/60R15", "205/65R15",
  // R16
  "185/55R16", "195/45R16", "195/55R16", "205/45R16", "205/55R16", "205/60R16",
  "215/55R16", "215/60R16", "215/65R16", "225/55R16", "225/60R16",
  // R17
  "205/40R17", "205/45R17", "205/50R17", "215/45R17", "215/50R17", "215/55R17",
  "215/60R17", "215/65R17", "225/45R17", "225/50R17", "225/55R17", "225/60R17",
  "225/65R17", "235/45R17", "235/55R17", "235/65R17", "245/45R17",
  // R18
  "215/45R18", "225/40R18", "225/45R18", "235/40R18", "235/45R18", "235/50R18",
  "235/55R18", "245/40R18", "245/45R18", "255/35R18", "255/45R18", "265/35R18", "285/60R18",
  // R19
  "225/35R19", "225/40R19", "225/45R19", "235/35R19", "235/45R19", "235/50R19",
  "235/55R19", "245/35R19", "245/40R19", "245/45R19", "255/35R19", "255/40R19", "255/50R19",
  // R20
  "235/35R20", "245/35R20", "255/35R20", "265/35R20", "275/35R20", "275/40R20",
  "275/45R20", "275/50R20", "285/35R20", "285/40R20", "295/35R20",
  // R21
  "245/35R21", "255/35R21", "255/40R21", "265/35R21", "275/35R21",
  // R22
  "265/40R22", "275/35R22", "285/35R22", "285/40R22", "295/35R22", "305/40R22",
];

function SearchableCombobox({
  value, onChange, options, placeholder,
}: {
  value: string;
  onChange: (val: string) => void;
  options: string[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = value
    ? options.filter((o) => o.toLowerCase().includes(value.toLowerCase()))
    : options;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {filtered.map((opt) => (
            <li
              key={opt}
              onMouseDown={(e) => { e.preventDefault(); onChange(opt); setOpen(false); }}
              className={`px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 hover:text-blue-700 ${value === opt ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700"}`}
            >
              {opt}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MevsimCheckboxes({
  value,
  onChange,
}: {
  value: string;
  onChange: (val: string) => void;
}) {
  const selected = value ? value.split(",").map((s) => s.trim()).filter(Boolean) : [];
  function toggle(opt: string) {
    const next = selected.includes(opt)
      ? selected.filter((s) => s !== opt)
      : [...selected, opt];
    onChange(next.join(","));
  }
  return (
    <div className="flex gap-3 flex-wrap">
      {MEVSIM_OPTIONS.map((opt) => (
        <label key={opt} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border cursor-pointer text-sm font-medium transition-colors ${selected.includes(opt)
          ? "border-blue-500 bg-blue-50 text-blue-700"
          : "border-gray-300 text-gray-600 hover:bg-gray-50"
          }`}>
          <input
            type="checkbox"
            checked={selected.includes(opt)}
            onChange={() => toggle(opt)}
            className="hidden"
          />
          {opt}
        </label>
      ))}
    </div>
  );
}

const COLUMNS: { key: string; label: string; defaultVisible: boolean }[] = [
  { key: "depo_no", label: "No", defaultVisible: true },
  { key: "plate", label: "Plaka", defaultVisible: true },
  { key: "customer_name", label: "Müşteri", defaultVisible: true },
  { key: "phone", label: "Telefon", defaultVisible: false },
  { key: "ebat", label: "Ebat", defaultVisible: true },
  { key: "marka", label: "Marka", defaultVisible: true },
  { key: "dis_derinligi", label: "Diş", defaultVisible: true },
  { key: "adet", label: "Adet", defaultVisible: true },
  { key: "mevsim", label: "Mevsim", defaultVisible: true },
  { key: "aciklama", label: "Açıklama", defaultVisible: false },
  { key: "islem_tarihi", label: "Tarih", defaultVisible: true },
];

const EMPTY_FORM = {
  depo_no: "",
  plate: "",
  customer_name: "",
  phone: "",
  ebat: "",
  marka: "",
  dis_derinligi: "",
  adet: "4",
  mevsim: "Yazlık",
  aciklama: "",
  islem_tarihi: new Date().toISOString().split("T")[0],
};

function isOverdue(islem_tarihi: string | null): boolean {
  if (!islem_tarihi) return false;
  const stored = new Date(islem_tarihi);
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  return stored < sixMonthsAgo;
}

function printLabel(item: StorageItem) {
  const date = item.islem_tarihi
    ? new Date(item.islem_tarihi).toLocaleDateString("tr-TR")
    : new Date().toLocaleDateString("tr-TR");

  const labelHtml = `
    <div class="label">
      <div class="plate">${item.plate ?? "—"}</div>
      <table>
        <tr><td class="lbl">Sıra No</td><td class="val sira">${item.depo_no ?? "—"}</td></tr>
        <tr><td class="lbl">Müşteri</td><td class="val">${item.customer_name ?? "—"}</td></tr>
        <tr><td class="lbl">Telefon</td><td class="val">${item.phone ?? "—"}</td></tr>
        <tr><td class="lbl">Ebat</td><td class="val">${item.ebat ?? "—"}</td></tr>
        <tr><td class="lbl">Marka</td><td class="val">${item.marka ?? "—"}</td></tr>
        <tr><td class="lbl">Diş Derinliği</td><td class="val">${item.dis_derinligi ?? "—"}</td></tr>
        <tr><td class="lbl">Adet</td><td class="val">${item.adet ?? "—"}</td></tr>
        <tr><td class="lbl">Mevsim</td><td class="val">${item.mevsim ?? "—"}</td></tr>
        <tr><td class="lbl">İşlem Tarihi</td><td class="val">${date}</td></tr>
      </table>
    </div>`;

  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Etiket - ${item.plate}</title>
<style>
  @page { size: A4 landscape; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { width: 297mm; height: 210mm; display: flex; }
  .label {
    width: 148.5mm;
    height: 210mm;
    border: 1px dashed #aaa;
    padding: 14mm 12mm;
    font-family: Arial, sans-serif;
    display: flex;
    flex-direction: column;
    gap: 10mm;
  }
  .label:first-child { border-right: 2px dashed #aaa; }
  .plate {
    font-size: 36pt;
    font-weight: bold;
    text-align: center;
    letter-spacing: 3px;
    border: 3px solid #000;
    padding: 6mm;
    border-radius: 4mm;
  }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 3.5mm 2mm; border-bottom: 1px solid #eee; font-size: 14pt; }
  td.lbl { color: #555; width: 45%; }
  td.val { font-weight: bold; text-align: right; }
  td.sira { font-size: 50pt; }
</style>
</head><body>
  ${labelHtml}
  ${labelHtml}
  <script>window.onload=()=>{window.print();}<\/script>
</body></html>`);
  win.document.close();
}

export default function StoragePage() {
  const [items, setItems] = useState<StorageItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const LIMIT = 20;
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [editItem, setEditItem] = useState<StorageItem | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem("storage_visible_cols");
      if (saved) return JSON.parse(saved);
    } catch { }
    return Object.fromEntries(COLUMNS.map((c) => [c.key, c.defaultVisible]));
  });
  const [showColPicker, setShowColPicker] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [overdueTotal, setOverdueTotal] = useState(0);
  const [showDelivered, setShowDelivered] = useState(false);
  const [teslimId, setTeslimId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function fetchOverdueCount() {
    const res = await fetch("/api/storage?overdue=true&limit=1");
    const data = await res.json();
    setOverdueTotal(data.total ?? 0);
  }

  async function fetchItems(targetPage = page, delivered = showDelivered) {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    params.set("page", String(targetPage));
    params.set("limit", String(LIMIT));
    if (delivered) params.set("delivered", "true");
    const res = await fetch(`/api/storage?${params}`);
    const data = await res.json();
    setItems(data.items ?? []);
    setTotal(data.total ?? 0);
    setLoading(false);
  }

  useEffect(() => {
    fetchOverdueCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setPage(1);
    fetchItems(1, showDelivered);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, showDelivered]);

  useEffect(() => {
    fetchItems(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  async function handleSave() {
    if (!form.plate.trim()) {
      setSaveError("Plaka zorunludur.");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch("/api/storage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          depo_no: form.depo_no ? Number(form.depo_no) : null,
          adet: Number(form.adet),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setSaveError(data.error ?? "Hata oluştu.");
        return;
      }
      setShowAddModal(false);
      setForm(EMPTY_FORM);
      await fetchItems(page);
    } finally {
      setSaving(false);
    }
  }

  function openEdit(item: StorageItem) {
    setEditItem(item);
    setEditForm({
      depo_no: item.depo_no != null ? String(item.depo_no) : "",
      plate: item.plate ?? "",
      customer_name: item.customer_name ?? "",
      phone: item.phone ?? "",
      ebat: item.ebat ?? "",
      marka: item.marka ?? "",
      dis_derinligi: item.dis_derinligi ?? "",
      adet: item.adet != null ? String(item.adet) : "4",
      mevsim: item.mevsim ?? "Yazlık",
      aciklama: item.aciklama ?? "",
      islem_tarihi: item.islem_tarihi ? item.islem_tarihi.split("T")[0] : new Date().toISOString().split("T")[0],
    });
  }

  async function handleUpdate() {
    if (!editItem) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/storage/${editItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...editForm,
          depo_no: editForm.depo_no ? Number(editForm.depo_no) : null,
          adet: Number(editForm.adet),
        }),
      });
      if (!res.ok) return;
      const updated = await res.json();
      setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
      setEditItem(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Bu kaydı silmek istediğinize emin misiniz?")) return;
    setDeletingId(id);
    try {
      await fetch(`/api/storage/${id}`, { method: "DELETE" });
      setItems((prev) => prev.filter((i) => i.id !== id));
    } finally {
      setDeletingId(null);
    }
  }

  async function handleTeslim(item: StorageItem) {
    if (!confirm(`Depo No ${item.depo_no} — ${item.plate} lastiği teslim edildi olarak işaretlensin mi?\nBu depo numarası serbest kalacak.`)) return;
    setTeslimId(item.id);
    try {
      await fetch(`/api/storage/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          depo_no: item.depo_no, plate: item.plate, customer_name: item.customer_name,
          phone: item.phone, ebat: item.ebat, marka: item.marka,
          dis_derinligi: item.dis_derinligi, adet: item.adet, mevsim: item.mevsim,
          aciklama: item.aciklama, islem_tarihi: item.islem_tarihi,
          teslim_edildi: true,
          teslim_tarihi: new Date().toISOString().split("T")[0],
        }),
      });
      await fetchItems(page);
      await fetchOverdueCount();
    } finally {
      setTeslimId(null);
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportMsg("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/storage/import", { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok) {
        setImportMsg(
          `${data.imported} kayıt içe aktarıldı.` +
          (data.skipped ? ` ${data.skipped} kayıt plaka olmadığı için atlandı.` : "")
        );
        setPage(1);
        await fetchItems(1);
      } else {
        setImportMsg(data.error ?? "Hata oluştu.");
      }
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div onClick={() => { setShowColPicker(false); setOpenMenuId(null); }}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-gray-800">Depolama</h1>
          <button
            onClick={() => setShowDelivered((v) => !v)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${showDelivered
              ? "bg-gray-700 text-white border-gray-700"
              : "border-gray-300 text-gray-500 hover:bg-gray-50"
              }`}
          >
            {showDelivered ? "Teslim Edilenler" : "Aktif Depolar"}
          </button>
        </div>
        <div className="flex gap-2">
          <input
            type="file"
            accept=".xlsx,.xls"
            ref={fileInputRef}
            onChange={handleImport}
            className="hidden"
          />
          <button
            onClick={() => { window.location.href = "/api/storage/export"; }}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Dışa Aktar
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {importing ? "İçe Aktarılıyor..." : "İçeri Aktar"}
          </button>
          <button
            onClick={() => { setForm(EMPTY_FORM); setSaveError(""); setShowAddModal(true); }}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
          >
            + Yeni Kayıt
          </button>
        </div>
      </div>

      {importMsg && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          {importMsg}
        </div>
      )}

      {overdueTotal > 0 && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-300 rounded-lg flex items-center gap-2 text-amber-800 text-sm font-medium">
          <svg className="w-5 h-5 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          Depoda <span className="font-bold mx-1">{overdueTotal}</span> lastik 6 aydan uzun süredir bekliyor.
        </div>
      )}

      {/* Arama + Sütun Seçici */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-6 flex flex-wrap gap-3 items-center justify-between">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value.toUpperCase())}
          placeholder="Plaka veya müşteri ara..."
          className="w-full sm:w-72 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setShowColPicker((v) => !v); }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
            </svg>
            Sütunlar
          </button>
          {showColPicker && (
            <div className="absolute left-0 sm:left-auto sm:right-0 top-10 z-30 bg-white border border-gray-200 rounded-xl shadow-lg p-3 w-44" onClick={(e) => e.stopPropagation()}>
              {COLUMNS.map((col) => (
                <label key={col.key} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={visibleCols[col.key]}
                    onChange={(e) => setVisibleCols((prev) => {
                      const next = { ...prev, [col.key]: e.target.checked };
                      try { localStorage.setItem("storage_visible_cols", JSON.stringify(next)); } catch { }
                      return next;
                    })}
                    className="accent-blue-600"
                  />
                  {col.label}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tablo */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400">Yükleniyor...</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-gray-400">Kayıt bulunamadı.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {visibleCols.depo_no && <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">No</th>}
                  {visibleCols.plate && <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Plaka</th>}
                  {visibleCols.customer_name && <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Müşteri</th>}
                  {visibleCols.phone && <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Telefon</th>}
                  {visibleCols.ebat && <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Ebat</th>}
                  {visibleCols.marka && <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Marka</th>}
                  {visibleCols.dis_derinligi && <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Diş</th>}
                  {visibleCols.adet && <th className="text-center px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Adet</th>}
                  {visibleCols.mevsim && <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Mevsim</th>}
                  {visibleCols.aciklama && <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Açıklama</th>}
                  {visibleCols.islem_tarihi && <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Tarih</th>}
                  <th className="sticky right-0 bg-gray-50 px-4 py-3 border-l border-gray-200"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((item, index) => (
                  <tr key={item.id} className={`hover:bg-gray-50 transition-colors ${isOverdue(item.islem_tarihi) ? "bg-amber-50 hover:bg-amber-100" : ""}`}>
                    {visibleCols.depo_no && <td className="px-4 py-3 text-gray-400">{item.depo_no ?? "—"}</td>}
                    {visibleCols.plate && (
                      <td className="px-4 py-3 font-mono font-semibold text-gray-800">
                        <div className="flex items-center gap-1.5">
                          {item.plate ?? "—"}
                          {isOverdue(item.islem_tarihi) && (
                            <span title="6 aydan uzun süredir depoda">
                              <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                              </svg>
                            </span>
                          )}
                        </div>
                      </td>
                    )}
                    {visibleCols.customer_name && <td className="px-4 py-3 text-gray-700">{item.customer_name ?? "—"}</td>}
                    {visibleCols.phone && <td className="px-4 py-3 text-gray-500">{item.phone ?? "—"}</td>}
                    {visibleCols.ebat && <td className="px-4 py-3 text-gray-700 font-mono text-xs">{item.ebat ?? "—"}</td>}
                    {visibleCols.marka && <td className="px-4 py-3 text-gray-700">{item.marka ?? "—"}</td>}
                    {visibleCols.dis_derinligi && <td className="px-4 py-3 text-gray-500 font-mono text-xs">{item.dis_derinligi ?? "—"}</td>}
                    {visibleCols.adet && <td className="px-4 py-3 text-center text-gray-700">{item.adet ?? "—"}</td>}
                    {visibleCols.mevsim && (
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${item.mevsim === "Kışlık" ? "bg-blue-100 text-blue-700"
                          : item.mevsim === "Yazlık" ? "bg-yellow-100 text-yellow-700"
                            : "bg-green-100 text-green-700"
                          }`}>
                          {item.mevsim ?? "—"}
                        </span>
                      </td>
                    )}
                    {visibleCols.aciklama && <td className="px-4 py-3 text-gray-400 text-xs max-w-xs truncate">{item.aciklama ?? ""}</td>}
                    {visibleCols.islem_tarihi && (
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                        {item.islem_tarihi ? new Date(item.islem_tarihi).toLocaleDateString("tr-TR") : "—"}
                      </td>
                    )}
                    <td className={`sticky right-0 bg-white border-l border-gray-100 px-3 py-3 ${openMenuId === item.id ? "z-50" : "z-10"}`}>
                      {/* Desktop */}
                      <div className="hidden sm:flex items-center gap-3 whitespace-nowrap">
                        <button onClick={() => printLabel(item)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">Etiket</button>
                        <button onClick={() => openEdit(item)} className="text-gray-600 hover:text-gray-900 text-xs font-medium">Düzenle</button>
                        {!item.teslim_edildi && (
                          <button onClick={() => handleTeslim(item)} disabled={teslimId === item.id}
                            className="text-green-600 hover:text-green-800 text-xs font-medium disabled:opacity-40">
                            {teslimId === item.id ? "..." : "Teslim Et"}
                          </button>
                        )}
                        <button onClick={() => handleDelete(item.id)} disabled={deletingId === item.id}
                          className="text-red-500 hover:text-red-700 text-xs font-medium disabled:opacity-40">
                          {deletingId === item.id ? "..." : "Sil"}
                        </button>
                      </div>
                      {/* Mobile */}
                      <div className="relative sm:hidden">
                        <button
                          onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === item.id ? null : item.id); }}
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
                        >
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <circle cx="10" cy="4" r="1.5" />
                            <circle cx="10" cy="10" r="1.5" />
                            <circle cx="10" cy="16" r="1.5" />
                          </svg>
                        </button>
                        {openMenuId === item.id && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className={`absolute right-0 z-40 bg-white border border-gray-200 rounded-xl shadow-lg py-1 w-36 ${index < 3 ? "top-full mt-1" : "bottom-full mb-1"}`}
                          >
                            <button
                              onClick={() => { printLabel(item); setOpenMenuId(null); }}
                              className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-blue-600 hover:bg-gray-50"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                              </svg>
                              Etiket
                            </button>
                            <button
                              onClick={() => { openEdit(item); setOpenMenuId(null); }}
                              className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                              Düzenle
                            </button>
                            {!item.teslim_edildi && (
                              <button
                                onClick={() => { setOpenMenuId(null); handleTeslim(item); }}
                                disabled={teslimId === item.id}
                                className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-green-600 hover:bg-gray-50 disabled:opacity-40"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                Teslim Et
                              </button>
                            )}
                            <div className="border-t border-gray-100 my-1" />
                            <button
                              onClick={() => { setOpenMenuId(null); handleDelete(item.id); }}
                              disabled={deletingId === item.id}
                              className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-red-500 hover:bg-gray-50 disabled:opacity-40"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                              Sil
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {total > LIMIT && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
          <span>
            {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} / {total} kayıt
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(1)}
              disabled={page === 1}
              className="px-2 py-1 rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              «
            </button>
            <button
              onClick={() => setPage((p) => p - 1)}
              disabled={page === 1}
              className="px-3 py-1 rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ‹
            </button>
            {Array.from({ length: Math.ceil(total / LIMIT) }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === Math.ceil(total / LIMIT) || Math.abs(p - page) <= 2)
              .reduce<(number | "…")[]>((acc, p, i, arr) => {
                if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("…");
                acc.push(p);
                return acc;
              }, [])
              .map((p, i) =>
                p === "…" ? (
                  <span key={`ellipsis-${i}`} className="px-2 py-1 text-gray-400">…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p as number)}
                    className={`px-3 py-1 rounded border ${page === p
                      ? "bg-blue-600 text-white border-blue-600"
                      : "border-gray-300 hover:bg-gray-100"
                      }`}
                  >
                    {p}
                  </button>
                )
              )}
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page * LIMIT >= total}
              className="px-3 py-1 rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ›
            </button>
            <button
              onClick={() => setPage(Math.ceil(total / LIMIT))}
              disabled={page * LIMIT >= total}
              className="px-2 py-1 rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              »
            </button>
          </div>
        </div>
      )}

      {/* Yeni Kayıt Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-800 mb-5">Yeni Depolama Kaydı</h2>

            {saveError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                {saveError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Depo No</label>
                <input
                  type="number"
                  value={form.depo_no}
                  onChange={(e) => setForm({ ...form, depo_no: e.target.value })}
                  placeholder="Otomatik"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Plaka <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={form.plate}
                  onChange={(e) => setForm({ ...form, plate: e.target.value.toUpperCase() })}
                  className={`w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 ${!form.plate && saveError ? "border-red-400" : "border-gray-300"}`}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Müşteri Adı</label>
                <input
                  type="text"
                  value={form.customer_name}
                  onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Telefon</label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Ebat</label>
                <SearchableCombobox value={form.ebat} onChange={(val) => setForm({ ...form, ebat: val })} options={TIRE_SIZES} placeholder="195/65R15" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Marka</label>
                <SearchableCombobox value={form.marka} onChange={(val) => setForm({ ...form, marka: val })} options={TIRE_BRANDS} placeholder="Marka seç veya yaz..." />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Diş Derinliği</label>
                <input
                  type="text"
                  value={form.dis_derinligi}
                  onChange={(e) => setForm({ ...form, dis_derinligi: e.target.value })}
                  placeholder="5-5-5-5"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Adet</label>
                <input
                  type="number"
                  min="1"
                  value={form.adet}
                  onChange={(e) => setForm({ ...form, adet: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-2">Mevsim</label>
                <MevsimCheckboxes value={form.mevsim} onChange={(val) => setForm({ ...form, mevsim: val })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">İşlem Tarihi</label>
                <input
                  type="date"
                  value={form.islem_tarihi}
                  onChange={(e) => setForm({ ...form, islem_tarihi: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Açıklama</label>
                <input
                  type="text"
                  value={form.aciklama}
                  onChange={(e) => setForm({ ...form, aciklama: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg hover:bg-gray-50"
              >
                İptal
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-2.5 rounded-lg"
              >
                {saving ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Düzenle Modal */}
      {editItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-800 mb-5">Kaydı Düzenle — #{editItem.depo_no}</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Depo No</label>
                <input type="number" value={editForm.depo_no} onChange={(e) => setEditForm({ ...editForm, depo_no: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Plaka</label>
                <input type="text" value={editForm.plate} onChange={(e) => setEditForm({ ...editForm, plate: e.target.value.toUpperCase() })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Müşteri Adı</label>
                <input type="text" value={editForm.customer_name} onChange={(e) => setEditForm({ ...editForm, customer_name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Telefon</label>
                <input type="text" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Ebat</label>
                <SearchableCombobox value={editForm.ebat} onChange={(val) => setEditForm({ ...editForm, ebat: val })} options={TIRE_SIZES} placeholder="195/65R15" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Marka</label>
                <SearchableCombobox value={editForm.marka} onChange={(val) => setEditForm({ ...editForm, marka: val })} options={TIRE_BRANDS} placeholder="Marka seç veya yaz..." />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Diş Derinliği</label>
                <input type="text" value={editForm.dis_derinligi} onChange={(e) => setEditForm({ ...editForm, dis_derinligi: e.target.value })} placeholder="5-5-5-5"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Adet</label>
                <input type="number" min="1" value={editForm.adet} onChange={(e) => setEditForm({ ...editForm, adet: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-2">Mevsim</label>
                <MevsimCheckboxes value={editForm.mevsim} onChange={(val) => setEditForm({ ...editForm, mevsim: val })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">İşlem Tarihi</label>
                <input type="date" value={editForm.islem_tarihi} onChange={(e) => setEditForm({ ...editForm, islem_tarihi: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Açıklama</label>
                <input type="text" value={editForm.aciklama} onChange={(e) => setEditForm({ ...editForm, aciklama: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setEditItem(null)}
                className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg hover:bg-gray-50">
                İptal
              </button>
              <button onClick={handleUpdate} disabled={saving}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-2.5 rounded-lg">
                {saving ? "Kaydediliyor..." : "Güncelle"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
