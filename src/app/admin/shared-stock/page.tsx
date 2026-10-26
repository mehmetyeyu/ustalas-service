"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useViewGuard } from "../AuthContext";
import { useToast } from "@/components/ToastProvider";
import { useDebouncedValue } from "@/hooks/useDebounce";
import { StickyScrollX } from "@/components/StickyScrollX";

const SEASON_OPTIONS = ["Yaz", "Kış", "Dört Mevsim"];
const MIN_QTY_OPTIONS = [0, 4, 8, 12];

// Tablo: her satır bir ürün kodu, her firma bir sütun (bkz. /api/shared-stock).
interface Firm {
  tenant_id: number;
  tenant_name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
}
// Bir firmanın o koddaki stoğu — üretim haftası/yılı firmaya göre değiştiği
// için hücrede (en yeni parti; birden fazla parti varsa sayısı).
interface StockCell {
  qty: number;
  production_year: number | null;
  production_week: number | null;
  batches: number;
}
interface CodeRow {
  code: string;
  brand: string;
  model_name: string | null;
  size_desc: string;
  season: string | null;
  total_stock: number;
  stocks: Record<number, StockCell>;
}

const productionLabel = (c: StockCell) =>
  c.production_year ? `${c.production_week ? `${String(c.production_week).padStart(2, "0")}/` : ""}${c.production_year}` : null;

export default function SharedStockPage() {
  const toast = useToast();
  const allowed = useViewGuard("shared_stock");

  // null: henüz bilinmiyor (ilk yükleme), true/false: /api/shared-stock'un
  // döndürdüğü gerçek durum. Ayar burada değil Genel Ayarlar'da değiştirilir
  // (bkz. plan — tek doğruluk kaynağı orada, burada sadece okunur gösterim).
  const [sharingEnabled, setSharingEnabled] = useState<boolean | null>(null);
  const [items, setItems] = useState<CodeRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 350);
  const [season, setSeason] = useState("");
  const [minQty, setMinQty] = useState(0);
  // Firma sütunları — filtreye uyan tüm kodlardaki firmalar (sayfadan
  // bağımsız, sayfa değişince sütunlar oynamaz).
  const [firms, setFirms] = useState<Firm[]>([]);
  const [contactFirmId, setContactFirmId] = useState<number | null>(null);

  async function fetchItems(targetPage = page) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (season) params.set("season", season);
      if (minQty > 0) params.set("minQty", String(minQty));
      params.set("page", String(targetPage));
      params.set("limit", String(limit));
      const res = await fetch(`/api/shared-stock?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Hata oluştu.");
      setSharingEnabled(data.sharingEnabled ?? false);
      setItems(data.items ?? []);
      setFirms(data.firms ?? []);
      setTotal(data.total ?? 0);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Hata oluştu.");
    } finally {
      setLoading(false);
    }
  }

  // Filtre efekti sayfayı 1'e alıp kendisi çeker ve prevPageRef'i 1 yapar;
  // sayfa efekti page gerçekten değişmediyse (açılışta veya filtre değişip
  // page 1'e dönünce) aynı isteği ikinci kez atmaz (bkz. admin/orders).
  const prevPageRef = useRef(page);
  useEffect(() => {
    prevPageRef.current = 1;
    setPage(1);
    fetchItems(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, season, minQty, limit]);

  useEffect(() => {
    if (prevPageRef.current === page) return;
    prevPageRef.current = page;
    fetchItems(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  if (!allowed) return null;

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const contactFirm = firms.find((f) => f.tenant_id === contactFirmId) ?? null;
  const colCount = 6 + firms.length;

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-1">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Paylaşılan Stok</h1>
          <p className="text-sm text-gray-500 mt-1 max-w-xl">
            Stok paylaşımını açan diğer firmaların ürünlerinde arama yapın. Aynı ürün kodu tek satırda,
            her firmanın stoğu kendi sütununda görünür. Yalnızca ürün kodu, marka, model, ebat, mevsim, üretim haftası/yılı ve adet
            paylaşılır — fiyat ve tedarikçi paylaşılmaz.
          </p>
        </div>
      </div>

      {sharingEnabled !== null && (
        <div className="bg-white rounded-xl shadow-sm p-4 mb-4 flex items-center gap-3 flex-wrap">
          <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${sharingEnabled ? "bg-emerald-500" : "bg-gray-300"}`} />
          <div className="flex-1 min-w-[14rem]">
            <div className="text-sm font-medium text-gray-700">
              {sharingEnabled ? "Stoğunuz paylaşıma açık" : "Stok paylaşımı kapalı"}
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              {sharingEnabled
                ? "Diğer katılımcı firmalar sizin stoğunuzu görebiliyor. Kapatırsanız onların stoğunu da göremezsiniz."
                : "Diğer firmaların stoğunu görebilmek için önce kendi stoğunuzu paylaşıma açmanız gerekir (karşılıklıdır)."}
            </p>
          </div>
          <Link href="/admin/settings" className="text-sm font-semibold text-blue-600 hover:text-blue-700 whitespace-nowrap">
            Paylaşım Ayarları →
          </Link>
        </div>
      )}

      {sharingEnabled === false ? (
        <div className="bg-white rounded-xl shadow-sm p-10 text-center">
          <p className="text-sm text-gray-500 max-w-sm mx-auto">
            Diğer firmaların stoğunu görebilmek için Genel Ayarlar&apos;dan &quot;Stoğumu Diğer
            Firmalarla Paylaş&quot; seçeneğini açmanız gerekiyor.
          </p>
          <Link
            href="/admin/settings"
            className="inline-block mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg"
          >
            Ayarlara Git
          </Link>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-3">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Marka, ebat, model veya ürün kodu ara — örn. Michelin, 205/55R16"
              className="flex-1 min-w-[14rem] border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Tüm sezonlar</option>
              {SEASON_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select
              value={minQty}
              onChange={(e) => setMinQty(Number(e.target.value))}
              className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {MIN_QTY_OPTIONS.map((n) => (
                <option key={n} value={n}>{n === 0 ? "Adet farketmez" : `Bir firmada en az ${n} adet`}</option>
              ))}
            </select>
          </div>

          <p className="text-xs text-gray-400 mb-4">
            Alış fiyatı, satış fiyatı ve tedarikçi bilgisi hiçbir zaman diğer firmalarla
            paylaşılmaz. Yalnızca stok paylaşımını açmış ve aktif olan firmalar listelenir.
          </p>

          {contactFirm && (
            <div className="bg-white rounded-xl shadow-sm p-4 mb-3 flex items-center gap-x-5 gap-y-2 flex-wrap text-sm">
              <span className="font-semibold text-gray-800">{contactFirm.tenant_name}</span>
              {contactFirm.contact_name && <span className="text-gray-600">👤 {contactFirm.contact_name}</span>}
              {contactFirm.contact_phone ? (
                <a href={`tel:${contactFirm.contact_phone}`} className="font-semibold text-blue-600 hover:underline">📞 {contactFirm.contact_phone}</a>
              ) : (
                <span className="text-gray-400">Telefon bilgisi yok</span>
              )}
              {contactFirm.contact_email ? (
                <a href={`mailto:${contactFirm.contact_email}`} className="font-semibold text-blue-600 hover:underline">✉️ {contactFirm.contact_email}</a>
              ) : (
                <span className="text-gray-400">E-posta bilgisi yok</span>
              )}
              <span className="flex-1" />
              <button onClick={() => setContactFirmId(null)} className="text-xs font-medium text-gray-400 hover:text-gray-700">Kapat</button>
            </div>
          )}

          {/* Her satır bir ürün kodu, her firma bir sütun — hücrede o firmadaki
              stok ve en yeni partinin üretim haftası/yılı. Ürün Kodu sütunu
              solda sabit (firma sütunları çoğalınca yana kaydırırken satır
              kaybolmasın). Firma başlığı iletişim bilgisini tablonun üstünde
              açar (tablo içindeki bir pencereyi kaydırma alanı kırpardı). */}
          <div className="bg-white rounded-xl shadow-sm overflow-clip">
            <StickyScrollX>
              <table className="w-full text-xs sm:text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="sticky left-0 z-10 bg-gray-50 text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap border-r border-gray-200">Ürün Kodu</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Marka</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Model</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Ebat</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Mevsim</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Toplam</th>
                    {firms.map((f) => (
                      <th key={f.tenant_id} className="text-center px-1.5 py-2 font-medium border-l border-gray-200 align-middle">
                        <button
                          onClick={() => setContactFirmId(contactFirmId === f.tenant_id ? null : f.tenant_id)}
                          title={`${f.tenant_name} — iletişim bilgisi`}
                          aria-pressed={contactFirmId === f.tenant_id}
                          className={`w-[7.5rem] line-clamp-2 leading-tight rounded-md px-2 py-1 normal-case ${contactFirmId === f.tenant_id ? "bg-blue-600 text-white" : "text-blue-600 hover:bg-blue-50"}`}
                        >
                          {f.tenant_name}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading ? (
                    <tr><td colSpan={colCount} className="p-12 text-center text-gray-400">Yükleniyor...</td></tr>
                  ) : items.length === 0 ? (
                    <tr><td colSpan={colCount} className="p-12 text-center text-gray-400">Aramanıza uyan paylaşılan stok bulunamadı.</td></tr>
                  ) : (
                    items.map((row) => (
                      <tr key={row.code} className="group hover:bg-gray-50">
                        <td className="sticky left-0 bg-white group-hover:bg-gray-50 px-4 py-3 font-mono text-gray-700 whitespace-nowrap border-r border-gray-100">{row.code}</td>
                        <td className="px-4 py-3 font-semibold text-gray-800 whitespace-nowrap">{row.brand}</td>
                        <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{row.model_name || <span className="text-gray-300">—</span>}</td>
                        <td className="px-4 py-3 font-mono text-gray-700 whitespace-nowrap">{row.size_desc}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {row.season ? (
                            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">{row.season}</span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-semibold text-teal-700 whitespace-nowrap">{row.total_stock}</td>
                        {firms.map((f) => {
                          const cell = row.stocks[f.tenant_id];
                          if (!cell) return <td key={f.tenant_id} className="px-2 py-3 text-center text-gray-300 border-l border-gray-100">—</td>;
                          const prod = productionLabel(cell);
                          return (
                            <td key={f.tenant_id} className="px-2 py-2 text-center border-l border-gray-100 whitespace-nowrap">
                              <div className="font-mono font-semibold text-gray-800">{cell.qty}</div>
                              {(prod || cell.batches > 1) && (
                                <div className="text-[10px] leading-tight text-gray-400" title="Üretim haftası/yılı (en yeni parti)">
                                  {prod ?? "—"}{cell.batches > 1 ? ` · ${cell.batches} parti` : ""}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </StickyScrollX>
          </div>

          {/* Sayfalama — bkz. Depolama/Siparişler'deki aynı düzen */}
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm text-gray-600">
            <div className="flex items-center gap-3">
              <span>
                {total === 0 ? 0 : (page - 1) * limit + 1}–{Math.min(page * limit, total)} / {total} ürün kodu
              </span>
              <label className="flex items-center gap-1.5 text-xs text-gray-500">
                Sayfa başına
                <select
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                  className="border border-gray-300 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {[20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            </div>
            {total > limit && (
              <div className="flex gap-1 overflow-x-auto">
                <button aria-label="İlk sayfa" onClick={() => setPage(1)} disabled={page === 1}
                  className="px-2 py-1 rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed">«</button>
                <button aria-label="Önceki sayfa" onClick={() => setPage((p) => p - 1)} disabled={page === 1}
                  className="px-3 py-1 rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed">‹</button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                  .reduce<(number | "…")[]>((acc, p, i, arr) => {
                    if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("…");
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, i) =>
                    p === "…" ? (
                      <span key={`ellipsis-${i}`} className="px-2 py-1 text-gray-400">…</span>
                    ) : (
                      <button key={p} onClick={() => setPage(p as number)} aria-current={page === p ? "page" : undefined}
                        className={`px-3 py-1 rounded border ${page === p ? "bg-blue-600 text-white border-blue-600" : "border-gray-300 hover:bg-gray-100"}`}>
                        {p}
                      </button>
                    )
                  )}
                <button aria-label="Sonraki sayfa" onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages}
                  className="px-3 py-1 rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed">›</button>
                <button aria-label="Son sayfa" onClick={() => setPage(totalPages)} disabled={page >= totalPages}
                  className="px-2 py-1 rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed">»</button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
