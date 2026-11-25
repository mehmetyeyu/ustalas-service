"use client";

// Depolama formunun ortak parçaları — Depolama sayfası ve siparişten "Depoya
// Al" penceresi (OrderStorageDialog) aynı alanları, kayıt gövdesini ve etiketi
// kullanır.
import { useEffect, useState, useRef } from "react";
import { escapeHtml } from "@/lib/htmlEscape";
import { parseWeekYearInput, formatWeekYearInput, weekYearLabel } from "@/lib/weekYear";
import { trIncludes } from "@/lib/trSearch";
import {
  STORAGE_TIRE_LAYOUTS, STORAGE_TIRE_POSITIONS, layoutOf, describeStorageTire, rftLabel,
  type StorageTire, type StorageTireLayout,
} from "@/lib/storageTires";

export interface StorageItem {
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
  teslim_aciklama: string | null;
  model_name: string | null;
  production_week: number | null;
  production_year: number | null;
  load_speed_index: string | null;
  lastikler: StorageTire[] | null;
  rft: boolean;
  jantli: boolean;
  // Siparişten "Depoya Al" ile açıldıysa.
  order_id: number | null;
}

export const MEVSIM_OPTIONS = ["Kışlık", "Yazlık", "Dört Mevsim"];

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
    ? options.filter((o) => trIncludes(o, query))
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
        // Escape önce açık öneri listesini kapatır; içinde bulunduğu pencere
        // (useDialog) preventDefault'u görüp kapanmaz — ikinci Escape kapatır.
        onKeyDown={(e) => { if (e.key === "Escape" && open) { e.preventDefault(); setOpen(false); } }}
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

export function MevsimCheckboxes({
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

export const INPUT_CLS = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

// Bir lastiğin (ya da tüm setin) alanları. adet yalnızca "hepsi aynı"da
// girilir; diğer düzenlerde konum başına adet sabittir. RFT lastiğin kendi
// özelliği olduğundan konum başınadır (Jantlı ise setin saklanma şekli,
// TireFields'ta ortak).
function TireInputs({
  value, onChange, adet, onAdetChange, disPlaceholder,
}: {
  value: TireForm;
  onChange: (patch: Partial<TireForm>) => void;
  adet?: string;
  onAdetChange?: (v: string) => void;
  disPlaceholder: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Ebat</label>
          <SearchableCombobox value={value.ebat} onChange={(val) => onChange({ ebat: val })} options={TIRE_SIZES} placeholder="195/65R15" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Marka</label>
          <SearchableCombobox value={value.marka} onChange={(val) => onChange({ marka: val })} options={TIRE_BRANDS} placeholder="Marka seç veya yaz..." />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Model / Ürün Hattı</label>
          <input type="text" value={value.model_name} onChange={(e) => onChange({ model_name: e.target.value })} placeholder="ör. PremiumContact 6" className={INPUT_CLS} />
        </div>
      </div>
      <div className={`grid grid-cols-2 gap-3 ${onAdetChange ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Diş Derinliği</label>
          <input type="text" value={value.dis_derinligi} onChange={(e) => onChange({ dis_derinligi: e.target.value })} placeholder={disPlaceholder} className={`${INPUT_CLS} font-mono`} />
        </div>
        {onAdetChange && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Adet</label>
            <input type="number" min="1" value={adet} onChange={(e) => onAdetChange(e.target.value)} className={INPUT_CLS} />
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Üretim Hafta / Yıl</label>
          <input type="text" inputMode="numeric" maxLength={5} placeholder="10/26"
            value={formatWeekYearInput(value.production_week, value.production_year)}
            onChange={(e) => {
              const { week, year } = parseWeekYearInput(e.target.value);
              onChange({ production_week: week, production_year: year });
            }}
            className={INPUT_CLS} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Yük / Hız</label>
          <input type="text" value={value.load_speed_index} onChange={(e) => onChange({ load_speed_index: e.target.value })} placeholder="91H" className={INPUT_CLS} />
        </div>
      </div>
      <label className="flex w-fit items-center gap-2 text-sm text-gray-700 cursor-pointer">
        <input type="checkbox" checked={value.rft} onChange={(e) => onChange({ rft: e.target.checked })} className="w-4 h-4 accent-blue-600" />
        RFT (Run-Flat)
      </label>
    </div>
  );
}

// Yeni/Düzenle/Değişim formlarının ortak "Lastikler" bölümü — müşteri isteği:
// ön/arka (uç durumda her lastik) ebatı-markası farklı olabilir; RFT ve
// jantlı saklama işaretlenir (bkz. src/lib/storageTires.ts).
export function TireFields({ value, onChange }: { value: TireFieldsState; onChange: (patch: Partial<TireFieldsState>) => void }) {
  const positions = value.duzen === "ayni" ? null : STORAGE_TIRE_POSITIONS[value.duzen];
  const updateTire = (i: number, patch: Partial<TireForm>) =>
    onChange({ lastikler: value.lastikler.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-start gap-2">
        <span className="text-xs font-medium text-gray-600">Lastikler</span>
        <div role="radiogroup" aria-label="Lastik düzeni" className="inline-flex rounded-lg border border-gray-300 p-0.5 text-xs">
          {STORAGE_TIRE_LAYOUTS.map((l) => (
            <button key={l.value} type="button" role="radio" aria-checked={value.duzen === l.value}
              onClick={() => onChange(switchLayout(value, l.value))}
              className={`rounded-md px-2.5 py-1 font-medium ${value.duzen === l.value ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}>
              {l.label}
            </button>
          ))}
        </div>
      </div>
      {positions ? (
        positions.map((p, i) => (
          <fieldset key={p.konum} className="rounded-lg border border-gray-200 p-3">
            <legend className="px-1 text-xs font-semibold text-gray-700">{p.konum} <span className="font-normal text-gray-400">· {p.adet} adet</span></legend>
            <TireInputs value={value.lastikler[i] ?? EMPTY_TIRE} onChange={(patch) => updateTire(i, patch)} disPlaceholder={p.adet === 2 ? "5-5" : "5"} />
          </fieldset>
        ))
      ) : (
        <TireInputs value={value} onChange={onChange} adet={value.adet} onAdetChange={(adet) => onChange({ adet })} disPlaceholder="5-5-5-5" />
      )}
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input type="checkbox" checked={value.jantli} onChange={(e) => onChange({ jantli: e.target.checked })} className="w-4 h-4 accent-blue-600" />
          Jantlı
        </label>
      </div>
    </div>
  );
}

// Bir lastiğin (ya da "hepsi aynı"da tüm setin) form alanları.
export const EMPTY_TIRE = {
  ebat: "",
  marka: "",
  model_name: "",
  dis_derinligi: "",
  production_week: "",
  production_year: "",
  load_speed_index: "",
  rft: false,
};
type TireForm = typeof EMPTY_TIRE;

// Yeni/Düzenle/Değişim formlarının ortak lastik bölümü (bkz. TireFields).
// duzen "ayni" iken üstteki alanlar + adet kullanılır; diğer düzenlerde her
// konumun alanları lastikler'dedir (STORAGE_TIRE_POSITIONS sırasıyla).
export const EMPTY_TIRE_FIELDS = {
  ...EMPTY_TIRE,
  adet: "4",
  duzen: "ayni" as StorageTireLayout,
  lastikler: [] as TireForm[],
  jantli: false,
};
export type TireFieldsState = typeof EMPTY_TIRE_FIELDS;

function pickTire(f: TireForm): TireForm {
  return {
    ebat: f.ebat, marka: f.marka, model_name: f.model_name, dis_derinligi: f.dis_derinligi,
    production_week: f.production_week, production_year: f.production_year, load_speed_index: f.load_speed_index,
    rft: f.rft,
  };
}

function tireToForm(t: { ebat: string | null; marka: string | null; model_name: string | null; dis_derinligi: string | null; production_week: number | null; production_year: number | null; load_speed_index: string | null; rft: boolean }): TireForm {
  return {
    ebat: t.ebat ?? "",
    marka: t.marka ?? "",
    model_name: t.model_name ?? "",
    dis_derinligi: t.dis_derinligi ?? "",
    production_week: t.production_week != null ? String(t.production_week).padStart(2, "0") : "",
    production_year: t.production_year != null ? String(t.production_year).slice(-2) : "",
    load_speed_index: t.load_speed_index ?? "",
    rft: !!t.rft,
  };
}

// Kayıttaki lastik bilgisini forma çevirir (Düzenle).
export function tireFieldsFromItem(item: StorageItem): TireFieldsState {
  return {
    ...tireToForm(item),
    adet: item.adet != null ? String(item.adet) : "4",
    duzen: layoutOf(item.lastikler),
    lastikler: (item.lastikler ?? []).map(tireToForm),
    jantli: !!item.jantli,
  };
}

// Düzen değişince girilmiş bilgiler kaybolmasın: "hepsi aynı"dan geçerken
// her konum mevcut bilgiyle dolar (kullanıcı sadece farklı olanı değiştirir);
// ön/arka ⇄ tek tek geçişte aynı aksın lastikleri birbirine taşınır.
function switchLayout(f: TireFieldsState, duzen: StorageTireLayout): Partial<TireFieldsState> {
  if (duzen === f.duzen) return {};
  if (duzen === "ayni") return { duzen, ...(f.lastikler[0] ?? EMPTY_TIRE), adet: "4", lastikler: [] };
  const source = f.duzen === "ayni" ? null : f.lastikler;
  const lastikler = STORAGE_TIRE_POSITIONS[duzen].map((_, i) => {
    if (!source) return pickTire(f);
    // aks → tek: 0,1 ön (kaynak 0), 2,3 arka (kaynak 1); tek → aks: 0 → 0, 1 → 2.
    const from = duzen === "tek" ? Math.floor(i / 2) : i * 2;
    return { ...(source[from] ?? EMPTY_TIRE) };
  });
  return { duzen, lastikler };
}

// API gövdesindeki lastik alanları (bkz. src/lib/storageTires.ts).
export function tirePayload(f: TireFieldsState) {
  const num = (v: string) => (v ? Number(v) : null);
  if (f.duzen === "ayni") {
    return {
      ...pickTire(f), adet: Number(f.adet),
      production_week: num(f.production_week), production_year: num(f.production_year),
      lastikler: null, jantli: f.jantli,
    };
  }
  // rft burada konum başına; kayıttaki rft sunucuda "en az biri" olarak üretilir.
  return {
    lastikler: f.lastikler.map((t, i) => ({
      ...t, konum: STORAGE_TIRE_POSITIONS[f.duzen as Exclude<StorageTireLayout, "ayni">][i].konum,
      production_week: num(t.production_week), production_year: num(t.production_year),
    })),
    jantli: f.jantli,
  };
}

// Etiket penceresi tıklama anında (await'ten önce) açılmalı: kayıt isteği,
// liste yenileme vb. bittikten sonra açılan pencereyi tarayıcı tıklamayla
// ilişkilendiremeyip açılır pencere olarak engelleyebiliyor (Safari'de süre
// özellikle kısa). Kaydet butonları pencereyi önce bununla boş açar, kayıt
// bitince printLabel'a verir; kayıt başarısız olursa kapatır.
export function openLabelWindow(): Window | null {
  const win = window.open("", "_blank");
  win?.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Etiket</title></head>
<body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;font-family:Arial,sans-serif;color:#555">Etiket hazırlanıyor…</body></html>`);
  return win;
}

// Genel Ayarlar > Marka'da yüklenmişse (bkz. src/app/admin/orders/[id]/page.tsx
// printWorkOrder'daki AYNI desen) firma logosu etikette de gösterilir —
// yazdırmadan hemen önce çekilir, ayrı bir state/prop olarak taşınmaz.
// Pencere verilmezse (satırdaki "Etiket" butonu) logo beklenmeden hemen
// açılır. false → pencere açılamadı (açılır pencere engellendi).
export async function printLabel(item: StorageItem, target?: Window | null): Promise<boolean> {
  const win = target === undefined ? openLabelWindow() : target;
  if (!win || win.closed) return false;

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
    // Konuma göre farklı lastiklerde Ebat/Marka/Model/Diş/Üretim satırları
    // yerine her konum tek satır (2 ya da 4 satır — 11 satır bütçesini aşmaz).
    ...(item.lastikler
      ? item.lastikler.map((t) => [
        t.konum,
        escapeHtml([describeStorageTire(t), t.production_year != null ? `DOT ${weekYearLabel(t.production_week, t.production_year)}` : null].filter(Boolean).join(" · ")),
      ] as [string, string])
      : ([
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
      ] as Array<[string, string]>)),
    // Farklı lastiklerde RFT konum satırında yazar (describeStorageTire).
    ["Özellik", [!item.lastikler && item.rft ? "RFT" : null, item.jantli ? "Jantlı" : null].filter(Boolean).join(" · ")],
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

  const tireLabels = new Set((item.lastikler ?? []).map((t) => t.konum));
  const labelHtml = `
    <div class="label">
      ${logoUrl ? `<img class="logo" src="${escapeHtml(logoUrl)}" alt="" />` : ""}
      <div class="plate">${escapeHtml(item.plate) || "—"}</div>
      <table>
        ${rows.map(([label, val]) => `<tr><td class="lbl">${label}</td><td class="val${label === "Sıra No" ? " sira" : tireLabels.has(label) ? " tire" : ""}">${val || "—"}</td></tr>`).join("\n        ")}
      </table>
    </div>`;

  if (win.closed) return false;
  win.document.open();
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
  /* Konum satırı (marka+model+ebat+diş+DOT) uzun — iki satıra kırılsa da
     sayfa bütçesini aşmasın diye küçük yazı. */
  td.tire { font-size: ${(10 * rowScale).toFixed(1)}pt; line-height: 1.25; }
</style>
</head><body>
  ${labelHtml}
  ${labelHtml}
  <script>window.onload=()=>{window.print();}<\/script>
</body></html>`);
  win.document.close();
  return true;
}

export const LABEL_BLOCKED_MSG = "Etiket penceresi açılamadı — tarayıcı açılır pencereyi engelledi. Bu site için açılır pencerelere izin verin ya da satırdaki \"Etiket\" butonunu kullanın.";
