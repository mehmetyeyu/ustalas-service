"use client";

import { useEffect, useState, useRef } from "react";
import { Tooltip } from "@/components/Tooltip";
import { useViewGuard, usePermission } from "../AuthContext";
import { useToast } from "@/components/ToastProvider";
import { useConfirm } from "@/components/ConfirmProvider";
import { escapeHtml } from "@/lib/htmlEscape";
import { useDebouncedValue } from "@/hooks/useDebounce";

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
  model_name: string | null;
  production_week: number | null;
  production_year: number | null;
  load_speed_index: string | null;
}

const MEVSIM_OPTIONS = ["Kışlık", "Yazlık", "Dört Mevsim"];

// "Değişim Yap" açılırken Mevsim alanı için akıllı varsayım — bkz. sunum
// "Depoda Mevsim Değişimi Akışı"nın "Açık Soru"su: otomatik ters + yine de
// değiştirilebilir dropdown (Dört Mevsim ihtimaline karşı kilitli değil).
function oppositeMevsim(mevsim: string | null): string {
  if (mevsim === "Kışlık") return "Yazlık";
  if (mevsim === "Yazlık") return "Kışlık";
  return "";
}

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
  // Odaklanınca sıfırlanır: alan zaten bir değerle dolu gelse bile (ör. düzenlemede
  // mevcut değer) açılışta tüm liste gösterilir, daraltma sadece yazarken olur.
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const filtered = query
    ? options.filter((o) => o.toLowerCase().includes(query.toLowerCase()))
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
        onChange={(e) => { onChange(e.target.value); setQuery(e.target.value); setOpen(true); }}
        onFocus={(e) => { setQuery(""); setOpen(true); e.target.select(); }}
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
  // Model/Üretim Haftası-Yılı/Yük-Hız — Ürünler'deki (Faz 2) aynı alanların
  // depolanan müşteri lastiğinde de takip edilmesi isteği; AB Etiketi/Jant/
  // Min. Stok Eşiği gibi satılık envanter kavramları BİLEREK eklenmedi.
  { key: "model_name", label: "Model", defaultVisible: false },
  { key: "dis_derinligi", label: "Diş", defaultVisible: true },
  { key: "uretim_hafta_yili", label: "Üretim Haftası/Yılı", defaultVisible: false },
  { key: "load_speed_index", label: "Yük/Hız", defaultVisible: false },
  { key: "adet", label: "Adet", defaultVisible: true },
  { key: "mevsim", label: "Mevsim", defaultVisible: true },
  { key: "aciklama", label: "Açıklama", defaultVisible: false },
  { key: "islem_tarihi", label: "Tarih", defaultVisible: true },
];

// Yükleniyor durumunda "Yükleniyor..." yazısı yerine gerçek tablo iskeletiyle
// aynı sütunlarda nabız (pulse) animasyonlu çubuklar gösterilir.
const SKELETON_COL_WIDTH: Record<string, string> = {
  depo_no: "w-8", plate: "w-16", customer_name: "w-28", phone: "w-20",
  ebat: "w-20", marka: "w-20", model_name: "w-24", dis_derinligi: "w-10",
  uretim_hafta_yili: "w-14", load_speed_index: "w-12", adet: "w-6",
  mevsim: "w-16", aciklama: "w-32", islem_tarihi: "w-16",
};
const SKELETON_ROWS = 8;

// Üretim Haftası/Yılı — Ürünler sayfasındaki AYNI "10/26" biçimi/mantığı
// (DOT kodu). production_year DB'de 4 haneli (2026) tutulur, görünümde
// son 2 hane kullanılır.
function weekYearLabel(week: number | null, year: number | null): string {
  if (week == null && year == null) return "—";
  if (week == null) return `—/${String(year).slice(-2)}`;
  if (year == null) return `${String(week).padStart(2, "0")}/—`;
  return `${String(week).padStart(2, "0")}/${String(year).slice(-2)}`;
}
function parseWeekYearInput(raw: string): { week: string; year: string } {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  return { week: digits.slice(0, 2), year: digits.slice(2, 4) };
}
function formatWeekYearInput(week: string, year: string): string {
  if (!week && !year) return "";
  if (!year) return week;
  return `${week}/${year}`;
}

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
  model_name: "",
  production_week: "",
  production_year: "",
  load_speed_index: "",
};

function isOverdue(islem_tarihi: string | null, thresholdMonths: number): boolean {
  if (!islem_tarihi) return false;
  const stored = new Date(islem_tarihi);
  const threshold = new Date();
  threshold.setMonth(threshold.getMonth() - thresholdMonths);
  return stored < threshold;
}

// Genel Ayarlar > Marka'da yüklenmişse (bkz. src/app/admin/orders/[id]/page.tsx
// printWorkOrder'daki AYNI desen) firma logosu etikette de gösterilir —
// yazdırmadan hemen önce çekilir, ayrı bir state/prop olarak taşınmaz.
async function printLabel(item: StorageItem) {
  const date = item.islem_tarihi
    ? new Date(item.islem_tarihi).toLocaleDateString("tr-TR")
    : new Date().toLocaleDateString("tr-TR");

  let logoUrl: string | null = null;
  try {
    const res = await fetch("/api/company-info");
    if (res.ok) logoUrl = (await res.json()).logoUrl ?? null;
  } catch { /* logo olmadan da yazdırılabilir, sessizce devam */ }

  // Sıra No/Adet/İşlem Tarihi her zaman dolu (zorunlu/varsayılanlı alanlar) —
  // geri kalanı boşsa satır hiç basılmaz: hem gereksiz "—" satırlarıyla yer
  // kaplamaz hem de logo + tüm alanlar dolu "en kötü durum" senaryosunda
  // taşma riskini azaltır (bkz. aşağıdaki sıkılaştırılmış boşluklar).
  const rows: Array<[string, string]> = [
    ["Sıra No", String(item.depo_no ?? "—")],
    ["Müşteri", escapeHtml(item.customer_name)],
    ["Telefon", escapeHtml(item.phone)],
    ["Ebat", escapeHtml(item.ebat)],
    ["Marka", escapeHtml(item.marka)],
    ["Model", escapeHtml(item.model_name)],
    ["Diş Derinliği", escapeHtml(item.dis_derinligi)],
    // weekYearLabel haftayla yıl ikisi de boşken bile "—" döndürür (düz boş
    // string değil) — bu yüzden diğerleri gibi val'e bakmak yetmez, kaynak
    // alanlar açıkça kontrol edilir.
    ...(item.production_week != null || item.production_year != null
      ? ([["Üretim Haftası/Yılı", weekYearLabel(item.production_week, item.production_year)]] as const)
      : []),
    ["Adet", String(item.adet ?? "—")],
    ["Mevsim", escapeHtml(item.mevsim)],
    ["İşlem Tarihi", date],
  ].filter(([label, val]) => val || label === "Sıra No" || label === "Adet" || label === "İşlem Tarihi") as Array<[string, string]>;

  // Aşağıdaki padding/font-size değerleri 11 satır + logo "en kötü durum"
  // bütçesine göre elle ayarlandı (bkz. style bloğundaki not). İleride yeni
  // bir alan eklenip satır sayısı 11'i aşarsa CSS'i tekrar elle ayarlamaya
  // gerek kalmasın diye satır başına boşluk/yazı boyutu bu oranla otomatik
  // küçülür — sabit bütçe değil, satır sayısına göre ölçeklenen bir önlem.
  const rowScale = rows.length > 11 ? 11 / rows.length : 1;
  const tdPaddingMm = (2.8 * rowScale).toFixed(2);
  const tdFontPt = (14 * rowScale).toFixed(1);

  const labelHtml = `
    <div class="label">
      ${logoUrl ? `<img class="logo" src="${escapeHtml(logoUrl)}" alt="" />` : ""}
      <div class="plate">${escapeHtml(item.plate) || "—"}</div>
      <table>
        ${rows.map(([label, val]) => `<tr><td class="lbl">${label}</td><td class="val${label === "Sıra No" ? " sira" : ""}">${val || "—"}</td></tr>`).join("\n        ")}
      </table>
    </div>`;

  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Etiket - ${escapeHtml(item.plate)}</title>
<style>
  @page { size: A4 landscape; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { width: 297mm; height: 210mm; display: flex; }
  .label {
    width: 148.5mm;
    height: 210mm;
    border: 1px dashed #aaa;
    /* Depolama'ya Model/DOT alanları eklenince (en kötü durumda tüm
       alanlar dolu + logo varken) 210mm'i aşıp 2. sayfaya taşıyordu —
       padding ve aşağıdaki satır/logo boşlukları bu yüzden sıkılaştırıldı. */
    padding: 6mm 12mm 12mm;
    font-family: Arial, sans-serif;
    display: flex;
    flex-direction: column;
  }
  .label:first-child { border-right: 2px dashed #aaa; }
  /* Sabit 210mm yükseklikli sayfaya logo eklenince taşıp ikinci sayfaya
     düşmesin diye gap yerine (logo yokken TAM olarak eskisiyle aynı
     görünüm kalsın diye) sadece logo VARSA devreye giren, üçü de EŞİT
     boşluklar kullanılıyor: logo üstü, logo altı, plaka altı. */
  .logo { max-height: 13mm; max-width: 100%; object-fit: contain; align-self: center; margin-top: 3.5mm; margin-bottom: 3.5mm; }
  .plate {
    font-size: 36pt;
    font-weight: bold;
    text-align: center;
    letter-spacing: 3px;
    border: 3px solid #000;
    padding: 5mm;
    border-radius: 4mm;
    margin-bottom: 4mm;
  }
  table { width: 100%; border-collapse: collapse; }
  td { padding: ${tdPaddingMm}mm 2mm; border-bottom: 1px solid #eee; font-size: ${tdFontPt}pt; }
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
  const toast = useToast();
  const confirm = useConfirm();
  const allowed = useViewGuard("storage");
  const canCreate = usePermission("storage.create");
  const canEdit = usePermission("storage.edit");
  const canDelete = usePermission("storage.delete");
  const [items, setItems] = useState<StorageItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 350);
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [editItem, setEditItem] = useState<StorageItem | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>(
    () => Object.fromEntries(COLUMNS.map((c) => [c.key, c.defaultVisible]))
  );
  const [showColPicker, setShowColPicker] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [showMobileActions, setShowMobileActions] = useState(false);

  // localStorage sadece istemcide okunur; sunucu render'ıyla eşleşmesi için
  // ilk render'da her zaman varsayılanlar kullanılır, kaydedilmiş tercih varsa
  // mount sonrası (hydration bitince) uygulanır.
  useEffect(() => {
    try {
      const saved = localStorage.getItem("storage_visible_cols");
      if (saved) setVisibleCols(JSON.parse(saved));
    } catch { }
  }, []);
  const [overdueTotal, setOverdueTotal] = useState(0);
  const [overdueMonths, setOverdueMonths] = useState(6);
  const [showDelivered, setShowDelivered] = useState(false);
  const [teslimId, setTeslimId] = useState<number | null>(null);
  const [degisimItem, setDegisimItem] = useState<StorageItem | null>(null);
  const [degisimForm, setDegisimForm] = useState({ ebat: "", marka: "", dis_derinligi: "", adet: "4", mevsim: "", aciklama: "", islem_tarihi: new Date().toISOString().split("T")[0], model_name: "", production_week: "", production_year: "", load_speed_index: "" });
  const [degisimSaving, setDegisimSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function fetchOverdueCount() {
    const res = await fetch("/api/storage?overdue=true&limit=1");
    const data = await res.json();
    setOverdueTotal(data.total ?? 0);
  }

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => { if (d.storage_overdue_months) setOverdueMonths(d.storage_overdue_months); })
      .catch(() => { });
  }, []);

  async function fetchItems(targetPage = page, delivered = showDelivered) {
    setLoading(true);
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    params.set("page", String(targetPage));
    params.set("limit", String(limit));
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
  }, [debouncedSearch, showDelivered, limit]);

  useEffect(() => {
    fetchItems(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  async function handleSave() {
    if (!form.plate.trim()) {
      toast.error("Plaka zorunludur.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/storage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          depo_no: form.depo_no ? Number(form.depo_no) : null,
          adet: Number(form.adet),
          production_week: form.production_week ? Number(form.production_week) : null,
          production_year: form.production_year ? Number(form.production_year) : null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "Hata oluştu.");
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
      model_name: item.model_name ?? "",
      production_week: item.production_week != null ? String(item.production_week).padStart(2, "0") : "",
      production_year: item.production_year != null ? String(item.production_year).slice(-2) : "",
      load_speed_index: item.load_speed_index ?? "",
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
          production_week: editForm.production_week ? Number(editForm.production_week) : null,
          production_year: editForm.production_year ? Number(editForm.production_year) : null,
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
    if (!(await confirm({ message: "Bu kaydı silmek istediğinize emin misiniz?", confirmText: "Sil", variant: "danger" }))) return;
    setDeletingId(id);
    try {
      await fetch(`/api/storage/${id}`, { method: "DELETE" });
      setItems((prev) => prev.filter((i) => i.id !== id));
    } finally {
      setDeletingId(null);
    }
  }

  async function handleTeslim(item: StorageItem) {
    if (!(await confirm({ message: `Depo No ${item.depo_no} — ${item.plate} lastiği teslim edildi olarak işaretlensin mi?\nBu depo numarası serbest kalacak.`, confirmText: "Teslim Et" }))) return;
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

  // "Değişim Yap" — bkz. sunum "Depoda Mevsim Değişimi Akışı": Plaka/Müşteri/
  // Telefon/Depo No aynı kalır (aynı müşteri/slot), lastiğe özel alanlar
  // (Ebat/Marka/Diş/Adet/Açıklama) boş gelir çünkü yeni bırakılan set farklı
  // olabilir — Mevsim ise akıllı varsayımla ters seçili gelir.
  function openDegisim(item: StorageItem) {
    setDegisimItem(item);
    setDegisimForm({
      ebat: "", marka: "", dis_derinligi: "", adet: "4",
      mevsim: oppositeMevsim(item.mevsim),
      aciklama: "",
      islem_tarihi: new Date().toISOString().split("T")[0],
      model_name: "", production_week: "", production_year: "", load_speed_index: "",
    });
  }

  async function handleDegisimSubmit() {
    if (!degisimItem) return;
    setDegisimSaving(true);
    try {
      const res = await fetch(`/api/storage/${degisimItem.id}/degisim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...degisimForm,
          adet: Number(degisimForm.adet),
          production_week: degisimForm.production_week ? Number(degisimForm.production_week) : null,
          production_year: degisimForm.production_year ? Number(degisimForm.production_year) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Değişim yapılamadı.");
        return;
      }
      setDegisimItem(null);
      await fetchItems(page);
      await fetchOverdueCount();
      // Yeni kayıt kaydedilir kaydedilmez etiket otomatik basılır — ayrıca
      // "Etiket" tıklamaya gerek yok (bkz. sunum, adım 4).
      await printLabel(data);
      toast.success("Değişim tamamlandı, etiket yazdırılıyor.");
    } finally {
      setDegisimSaving(false);
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/storage/import", { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok) {
        toast.success(
          `${data.imported} kayıt içe aktarıldı.` +
          (data.skipped ? ` ${data.skipped} kayıt plaka olmadığı için atlandı.` : "")
        );
        setPage(1);
        await fetchItems(1);
      } else {
        toast.error(data.error ?? "Hata oluştu.");
      }
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // + 1: her zaman görünen işlemler sütunu.
  const visibleColCount = COLUMNS.filter((c) => visibleCols[c.key]).length + 1;

  if (!allowed) return null;

  return (
    <div onClick={() => { setShowColPicker(false); setOpenMenuId(null); setShowMobileActions(false); }}>
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
        <div className="flex gap-1.5 sm:gap-2">
          <input
            type="file"
            accept=".xlsx,.xls"
            ref={fileInputRef}
            onChange={handleImport}
            className="hidden"
          />

          {/* Masaüstü: ayrı ayrı butonlar */}
          <div className="hidden sm:flex gap-2">
            <button
              onClick={() => { window.location.href = "/api/storage/import/template"; }}
              className="shrink-0 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-50 flex items-center gap-1 whitespace-nowrap"
            >
              Şablon İndir
              <Tooltip text="Sadece Plaka zorunludur. Depo No'yu doldurursanız aktif bir depoyla çakışmadığından emin olun, aksi halde içe aktarma tamamen başarısız olur.">
                <span className="text-gray-400 hover:text-gray-600 cursor-help">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
                  </svg>
                </span>
              </Tooltip>
            </button>
            <button
              onClick={() => { window.location.href = "/api/storage/export"; }}
              className="shrink-0 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 whitespace-nowrap"
            >
              Dışa Aktar
            </button>
            {canEdit && (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                className="shrink-0 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 whitespace-nowrap"
              >
                {importing ? "İçe Aktarılıyor..." : "İçeri Aktar"}
              </button>
            )}
            {canCreate && (
              <button
                onClick={() => { setForm(EMPTY_FORM); setShowAddModal(true); }}
                className="shrink-0 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium whitespace-nowrap"
              >
                + Yeni Kayıt
              </button>
            )}
          </div>

          {/* Mobil: hızlı menü altında toplanmış aksiyonlar */}
          <div className="relative sm:hidden shrink-0">
            <button
              onClick={(e) => { e.stopPropagation(); setShowMobileActions((v) => !v); }}
              className="shrink-0 px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-1 whitespace-nowrap"
            >
              İşlemler
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showMobileActions && (
              <div
                className="absolute left-0 top-full mt-1 z-30 bg-white border border-gray-200 rounded-xl shadow-lg py-1 w-56"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => { setShowMobileActions(false); window.location.href = "/api/storage/import/template"; }}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Şablon İndir
                </button>
                <button
                  onClick={() => { setShowMobileActions(false); window.location.href = "/api/storage/export"; }}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Dışa Aktar
                </button>
                {canEdit && (
                  <button
                    onClick={() => { setShowMobileActions(false); fileInputRef.current?.click(); }}
                    disabled={importing}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {importing ? "İçe Aktarılıyor..." : "İçeri Aktar"}
                  </button>
                )}
                {canCreate && (
                  <button
                    onClick={() => { setShowMobileActions(false); setForm(EMPTY_FORM); setShowAddModal(true); }}
                    className="w-full text-left px-4 py-2.5 text-sm font-medium text-blue-600 hover:bg-blue-50"
                  >
                    + Yeni Kayıt
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {overdueTotal > 0 && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-300 rounded-lg flex items-center gap-2 text-amber-800 text-sm font-medium">
          <svg className="w-5 h-5 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          Depoda <span className="font-bold mx-1">{overdueTotal}</span> lastik {overdueMonths} aydan uzun süredir bekliyor.
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
        <div className="overflow-x-auto">
          <table className="w-full text-xs sm:text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {visibleCols.depo_no && <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">No</th>}
                {visibleCols.plate && <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Plaka</th>}
                {visibleCols.customer_name && <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Müşteri</th>}
                {visibleCols.phone && <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Telefon</th>}
                {visibleCols.ebat && <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Ebat</th>}
                {visibleCols.marka && <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Marka</th>}
                {visibleCols.model_name && <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Model</th>}
                {visibleCols.dis_derinligi && <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Diş</th>}
                {visibleCols.uretim_hafta_yili && <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Üretim Haftası/Yılı</th>}
                {visibleCols.load_speed_index && <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Yük/Hız</th>}
                {visibleCols.adet && <th className="text-center px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Adet</th>}
                {visibleCols.mevsim && <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Mevsim</th>}
                {visibleCols.aciklama && <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Açıklama</th>}
                {visibleCols.islem_tarihi && <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Tarih</th>}
                <th className="sticky right-0 bg-gray-50 px-4 py-3 border-l border-gray-200"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: SKELETON_ROWS }).map((_, i) => (
                  <tr key={`skeleton-${i}`}>
                    {COLUMNS.filter((c) => visibleCols[c.key]).map((c) => (
                      <td key={c.key} className="px-4 py-3">
                        <div className={`h-4 ${SKELETON_COL_WIDTH[c.key]} bg-gray-100 rounded animate-pulse`} />
                      </td>
                    ))}
                    <td className="px-4 py-3">
                      <div className="h-4 w-20 bg-gray-100 rounded animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={visibleColCount} className="p-12 text-center text-gray-400">Kayıt bulunamadı.</td>
                </tr>
              ) : (
                items.map((item, index) => (
                  <tr key={item.id} className={`hover:bg-gray-50 transition-colors ${isOverdue(item.islem_tarihi, overdueMonths) ? "bg-amber-50 hover:bg-amber-100" : ""}`}>
                    {visibleCols.depo_no && <td className="px-4 py-3 text-gray-400">{item.depo_no ?? "—"}</td>}
                    {visibleCols.plate && (
                      <td className="px-4 py-3 font-mono font-semibold text-gray-800 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {item.plate ?? "—"}
                          {isOverdue(item.islem_tarihi, overdueMonths) && (
                            <span title={`${overdueMonths} aydan uzun süredir depoda`}>
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
                    {visibleCols.model_name && <td className="px-4 py-3 text-gray-700">{item.model_name ?? "—"}</td>}
                    {visibleCols.dis_derinligi && <td className="px-4 py-3 text-gray-500 font-mono text-xs">{item.dis_derinligi ?? "—"}</td>}
                    {visibleCols.uretim_hafta_yili && <td className="px-4 py-3 text-gray-700 font-mono">{weekYearLabel(item.production_week, item.production_year)}</td>}
                    {visibleCols.load_speed_index && <td className="px-4 py-3 text-gray-500 font-mono text-xs">{item.load_speed_index ?? "—"}</td>}
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
                        {canEdit && <button onClick={() => openEdit(item)} className="text-gray-600 hover:text-gray-900 text-xs font-medium">Düzenle</button>}
                        {canEdit && !item.teslim_edildi && (
                          <button onClick={() => openDegisim(item)} className="text-purple-600 hover:text-purple-800 text-xs font-medium">
                            Değişim Yap
                          </button>
                        )}
                        {canEdit && !item.teslim_edildi && (
                          <button onClick={() => handleTeslim(item)} disabled={teslimId === item.id}
                            className="text-green-600 hover:text-green-800 text-xs font-medium disabled:opacity-40">
                            {teslimId === item.id ? "..." : "Teslim Et"}
                          </button>
                        )}
                        {canDelete && (
                          <button onClick={() => handleDelete(item.id)} disabled={deletingId === item.id}
                            className="text-red-500 hover:text-red-700 text-xs font-medium disabled:opacity-40">
                            {deletingId === item.id ? "..." : "Sil"}
                          </button>
                        )}
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
                            {canEdit && (
                              <button
                                onClick={() => { openEdit(item); setOpenMenuId(null); }}
                                className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                                Düzenle
                              </button>
                            )}
                            {canEdit && !item.teslim_edildi && (
                              <button
                                onClick={() => { setOpenMenuId(null); openDegisim(item); }}
                                className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-purple-600 hover:bg-gray-50"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                                </svg>
                                Değişim Yap
                              </button>
                            )}
                            {canEdit && !item.teslim_edildi && (
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
                            {canDelete && (
                              <>
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
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm text-gray-600">
        <div className="flex items-center gap-3">
          <span>
            {total === 0 ? 0 : (page - 1) * limit + 1}–{Math.min(page * limit, total)} / {total} kayıt
          </span>
          <label className="flex items-center gap-1.5 text-xs text-gray-500">
            Sayfa başına
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="border border-gray-300 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {[20, 50, 100, 200, 500].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>
        {total > limit && (
          <div className="flex gap-1 overflow-x-auto">
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
            {Array.from({ length: Math.ceil(total / limit) }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === Math.ceil(total / limit) || Math.abs(p - page) <= 2)
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
              disabled={page * limit >= total}
              className="px-3 py-1 rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ›
            </button>
            <button
              onClick={() => setPage(Math.ceil(total / limit))}
              disabled={page * limit >= total}
              className="px-2 py-1 rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              »
            </button>
          </div>
        )}
      </div>

      {/* Yeni Kayıt Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col">
            <div className="p-6 pb-4">
            <h2 className="text-xl font-bold text-gray-800 mb-5">Yeni Depolama Kaydı</h2>

            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">İşlem Tarihi</label>
                  <input
                    type="date"
                    value={form.islem_tarihi}
                    onChange={(e) => setForm({ ...form, islem_tarihi: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Mevsim</label>
                <MevsimCheckboxes value={form.mevsim} onChange={(val) => setForm({ ...form, mevsim: val })} />
              </div>

              {/* Daha az sık kullanılan alanlar — bkz. kullanıcı isteği */}
              <div className="border-t border-gray-100 pt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Model / Ürün Hattı</label>
                  <input
                    type="text"
                    value={form.model_name}
                    onChange={(e) => setForm({ ...form, model_name: e.target.value })}
                    placeholder="ör. PremiumContact 6"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Üretim Haftası / Yılı</label>
                  <input type="text" inputMode="numeric" maxLength={5} placeholder="10/26"
                    value={formatWeekYearInput(form.production_week, form.production_year)}
                    onChange={(e) => {
                      const { week, year } = parseWeekYearInput(e.target.value);
                      setForm({ ...form, production_week: week, production_year: year });
                    }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Yük / Hız</label>
                  <input
                    type="text"
                    value={form.load_speed_index}
                    onChange={(e) => setForm({ ...form, load_speed_index: e.target.value })}
                    placeholder="91H"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Açıklama</label>
                <input
                  type="text"
                  value={form.aciklama}
                  onChange={(e) => setForm({ ...form, aciklama: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            </div>

            <div className="sticky bottom-0 sm:static bg-white border-t border-gray-100 sm:border-t-0 px-6 py-4 sm:pt-0 sm:pb-6 flex gap-3">
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
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col">
            <div className="p-6 pb-4">
            <h2 className="text-xl font-bold text-gray-800 mb-5">Kaydı Düzenle — #{editItem.depo_no}</h2>

            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">İşlem Tarihi</label>
                  <input type="date" value={editForm.islem_tarihi} onChange={(e) => setEditForm({ ...editForm, islem_tarihi: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Mevsim</label>
                <MevsimCheckboxes value={editForm.mevsim} onChange={(val) => setEditForm({ ...editForm, mevsim: val })} />
              </div>

              <div className="border-t border-gray-100 pt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Model / Ürün Hattı</label>
                  <input type="text" value={editForm.model_name} onChange={(e) => setEditForm({ ...editForm, model_name: e.target.value })} placeholder="ör. PremiumContact 6"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Üretim Haftası / Yılı</label>
                  <input type="text" inputMode="numeric" maxLength={5} placeholder="10/26"
                    value={formatWeekYearInput(editForm.production_week, editForm.production_year)}
                    onChange={(e) => {
                      const { week, year } = parseWeekYearInput(e.target.value);
                      setEditForm({ ...editForm, production_week: week, production_year: year });
                    }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Yük / Hız</label>
                  <input type="text" value={editForm.load_speed_index} onChange={(e) => setEditForm({ ...editForm, load_speed_index: e.target.value })} placeholder="91H"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Açıklama</label>
                <input type="text" value={editForm.aciklama} onChange={(e) => setEditForm({ ...editForm, aciklama: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            </div>

            <div className="sticky bottom-0 sm:static bg-white border-t border-gray-100 sm:border-t-0 px-6 py-4 sm:pt-0 sm:pb-6 flex gap-3">
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

      {/* Değişim Yap Modal — bkz. openDegisim/handleDegisimSubmit notu */}
      {degisimItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col">
            <div className="p-6 pb-4">
              <div className="flex items-start justify-between mb-1">
                <h2 className="text-xl font-bold text-gray-800">Değişim Yap — Depo No {degisimItem.depo_no}</h2>
                <button onClick={() => setDegisimItem(null)} className="text-gray-400 hover:text-gray-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <p className="text-xs text-gray-400 mb-5">
                {degisimItem.plate || "—"} · {degisimItem.customer_name || "—"} — yeni bırakılan lastiğin bilgilerini girin, eski kayıt otomatik teslim edilmiş sayılacak.
              </p>

              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Ebat</label>
                    <SearchableCombobox value={degisimForm.ebat} onChange={(val) => setDegisimForm({ ...degisimForm, ebat: val })} options={TIRE_SIZES} placeholder="195/65R15" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Marka</label>
                    <SearchableCombobox value={degisimForm.marka} onChange={(val) => setDegisimForm({ ...degisimForm, marka: val })} options={TIRE_BRANDS} placeholder="Marka seç veya yaz..." />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Diş Derinliği</label>
                    <input type="text" value={degisimForm.dis_derinligi} onChange={(e) => setDegisimForm({ ...degisimForm, dis_derinligi: e.target.value })} placeholder="5-5-5-5"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Adet</label>
                    <input type="number" min="1" value={degisimForm.adet} onChange={(e) => setDegisimForm({ ...degisimForm, adet: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">İşlem Tarihi</label>
                    <input type="date" value={degisimForm.islem_tarihi} onChange={(e) => setDegisimForm({ ...degisimForm, islem_tarihi: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-2">Mevsim</label>
                  <MevsimCheckboxes value={degisimForm.mevsim} onChange={(val) => setDegisimForm({ ...degisimForm, mevsim: val })} />
                </div>

                <div className="border-t border-gray-100 pt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Model / Ürün Hattı</label>
                    <input type="text" value={degisimForm.model_name} onChange={(e) => setDegisimForm({ ...degisimForm, model_name: e.target.value })} placeholder="ör. PremiumContact 6"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Üretim Haftası / Yılı</label>
                    <input type="text" inputMode="numeric" maxLength={5} placeholder="10/26"
                      value={formatWeekYearInput(degisimForm.production_week, degisimForm.production_year)}
                      onChange={(e) => {
                        const { week, year } = parseWeekYearInput(e.target.value);
                        setDegisimForm({ ...degisimForm, production_week: week, production_year: year });
                      }}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Yük / Hız</label>
                    <input type="text" value={degisimForm.load_speed_index} onChange={(e) => setDegisimForm({ ...degisimForm, load_speed_index: e.target.value })} placeholder="91H"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Açıklama</label>
                  <input type="text" value={degisimForm.aciklama} onChange={(e) => setDegisimForm({ ...degisimForm, aciklama: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 sm:static bg-white border-t border-gray-100 sm:border-t-0 px-6 py-4 sm:pt-0 sm:pb-6 flex gap-3">
              <button onClick={() => setDegisimItem(null)}
                className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg hover:bg-gray-50">
                İptal
              </button>
              <button onClick={handleDegisimSubmit} disabled={degisimSaving}
                className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white font-semibold py-2.5 rounded-lg">
                {degisimSaving ? "Kaydediliyor..." : "Kaydet ve Etiket Yazdır"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
