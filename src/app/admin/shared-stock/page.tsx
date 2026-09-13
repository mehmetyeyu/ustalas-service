"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useViewGuard } from "../AuthContext";
import { useToast } from "@/components/ToastProvider";

const SEASON_OPTIONS = ["Yaz", "Kış", "Dört Mevsim"];
const MIN_QTY_OPTIONS = [0, 4, 8, 12];

interface ShopEntry {
  tenant_id: number;
  tenant_name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  qty: number;
  production_year: number | null;
  production_week: number | null;
}

interface GroupItem {
  brand: string;
  size_desc: string;
  season: string | null;
  total_stock: number;
  shops: ShopEntry[];
}

export default function SharedStockPage() {
  const toast = useToast();
  const allowed = useViewGuard("shared_stock");

  // null: henüz bilinmiyor (ilk yükleme), true/false: /api/shared-stock'un
  // döndürdüğü gerçek durum. Ayar burada değil Genel Ayarlar'da değiştirilir
  // (bkz. plan — tek doğruluk kaynağı orada, burada sadece okunur gösterim).
  const [sharingEnabled, setSharingEnabled] = useState<boolean | null>(null);
  const [items, setItems] = useState<GroupItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [season, setSeason] = useState("");
  const [minQty, setMinQty] = useState(0);
  const [openContact, setOpenContact] = useState<string | null>(null);

  async function fetchItems(targetPage = page) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (season) params.set("season", season);
      if (minQty > 0) params.set("minQty", String(minQty));
      params.set("page", String(targetPage));
      params.set("limit", String(limit));
      const res = await fetch(`/api/shared-stock?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Hata oluştu.");
      setSharingEnabled(data.sharingEnabled ?? false);
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Hata oluştu.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setPage(1);
    fetchItems(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, season, minQty]);

  useEffect(() => {
    fetchItems(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  if (!allowed) return null;

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-1">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Paylaşılan Stok</h1>
          <p className="text-sm text-gray-500 mt-1 max-w-xl">
            Stok paylaşımını açan diğer firmaların ürünlerinde arama yapın. Yalnızca marka, ebat,
            sezon ve adet bilgisi görünür — fiyat ve tedarikçi paylaşılmaz.
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
              placeholder="Marka veya ebat ara — örn. Michelin, 205/55R16"
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
                <option key={n} value={n}>{n === 0 ? "Adet farketmez" : `En az ${n} adet`}</option>
              ))}
            </select>
          </div>

          <p className="text-xs text-gray-400 mb-4">
            Alış fiyatı, satış fiyatı ve tedarikçi bilgisi hiçbir zaman diğer firmalarla
            paylaşılmaz. Yalnızca stok paylaşımını açmış ve aktif olan firmalar listelenir.
          </p>

          {loading ? (
            <div className="text-center py-16">
              <svg className="w-8 h-8 mx-auto mb-3 text-blue-600 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-sm text-gray-500">Yükleniyor...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm p-10 text-center text-sm text-gray-500">
              Aramanıza uyan paylaşılan stok bulunamadı.
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((group) => {
                const groupKey = `${group.brand}__${group.size_desc}__${group.season ?? ""}`;
                return (
                  <div key={groupKey} className="bg-white rounded-xl shadow-sm overflow-hidden">
                    <div className="flex items-center gap-3 flex-wrap px-4 py-3">
                      <span className="font-semibold text-gray-800">{group.brand}</span>
                      <span className="font-mono text-gray-700">{group.size_desc}</span>
                      {group.season && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">
                          {group.season}
                        </span>
                      )}
                      <span className="flex-1" />
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-teal-50 text-teal-700">
                        {group.shops.length} servis
                      </span>
                      <span className="text-sm text-gray-500">
                        toplam <strong className="font-mono text-teal-700">{group.total_stock}</strong> adet
                      </span>
                    </div>
                    <div className="border-t border-gray-100">
                      {group.shops.map((shop) => {
                        const shopKey = `${groupKey}__${shop.tenant_id}`;
                        const contactOpen = openContact === shopKey;
                        return (
                          <div key={shopKey} className="border-t border-gray-100 first:border-t-0">
                            <div className="flex items-center gap-3 flex-wrap px-4 py-2.5 text-sm">
                              <span className="font-medium text-gray-700">{shop.tenant_name}</span>
                              {shop.production_year && (
                                <span className="font-mono text-xs text-gray-400">
                                  {shop.production_week ? `${String(shop.production_week).padStart(2, "0")}. hf / ` : ""}
                                  {shop.production_year}
                                </span>
                              )}
                              <span className="flex-1" />
                              <span className="font-mono font-semibold text-gray-700">
                                {shop.qty} <span className="text-xs font-normal text-gray-400">adet</span>
                              </span>
                              <button
                                onClick={() => setOpenContact(contactOpen ? null : shopKey)}
                                className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${contactOpen ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-600 hover:bg-blue-100"}`}
                              >
                                {contactOpen ? "Kapat" : "İletişime Geç"}
                              </button>
                            </div>
                            {contactOpen && (
                              <div className="px-4 pb-3 flex gap-4 flex-wrap text-xs text-gray-500">
                                {shop.contact_name && (
                                  <span>👤 {shop.contact_name}</span>
                                )}
                                {shop.contact_phone ? (
                                  <a href={`tel:${shop.contact_phone}`} className="font-semibold text-blue-600 hover:underline">
                                    📞 {shop.contact_phone}
                                  </a>
                                ) : (
                                  <span>Telefon bilgisi yok</span>
                                )}
                                {shop.contact_email ? (
                                  <a href={`mailto:${shop.contact_email}`} className="font-semibold text-blue-600 hover:underline">
                                    ✉️ {shop.contact_email}
                                  </a>
                                ) : (
                                  <span>E-posta bilgisi yok</span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!loading && total > limit && (
            <div className="flex items-center justify-center gap-2 mt-5 text-sm">
              <button
                onClick={() => setPage((p) => p - 1)}
                disabled={page === 1}
                className="px-3 py-1 rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ‹ Önceki
              </button>
              <span className="text-gray-500 px-2">{page} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= totalPages}
                className="px-3 py-1 rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Sonraki ›
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
