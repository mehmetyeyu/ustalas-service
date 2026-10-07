"use client";

import { useEffect, useMemo, useState } from "react";

// Products/Customers/Orders/Storage'daki "Sütunlar" menüsü — görünürlük
// (hepsi) + sürükle-bırak sıralama (Storage hariç) ortak mantığı. localStorage
// anahtarları sayfa başına farklı kalır (bazılarında eski kayıtlı tercihlerle
// uyumluluk için _v1/_v2 sürüm eki var) — bu yüzden anahtarlar hook'a dışarıdan
// verilir, sayfa adından türetilmez.
export interface ColumnPrefsColumn {
  key: string;
  label: string;
  defaultVisible: boolean;
  hideable?: boolean; // false ise Sütunlar menüsünde checkbox'ı yok, her zaman görünür (ör. Ürün Kodu/Marka gibi ana kimlik sütunları)
}

interface UseColumnPrefsOptions {
  visibleColsKey: string;
  // Verilmezse sıralama/sürükleme devre dışı kalır (ör. Depolama'nın basit
  // checkbox-only menüsü) — orderedColumns/menuColumns her zaman columns'un
  // kendi sırasını döner, drag alanları no-op'tur.
  colOrderKey?: string;
}

export function useColumnPrefs<C extends ColumnPrefsColumn>(
  columns: C[],
  { visibleColsKey, colOrderKey }: UseColumnPrefsOptions
) {
  const [visibleCols, setVisibleColsState] = useState<Record<string, boolean>>(
    () => Object.fromEntries(columns.map((c) => [c.key, c.defaultVisible]))
  );
  const [colOrder, setColOrder] = useState<string[]>(() => columns.map((c) => c.key));
  const [showColPicker, setShowColPicker] = useState(false);
  const [dragColKey, setDragColKey] = useState<string | null>(null);
  const [previewColOrder, setPreviewColOrder] = useState<string[] | null>(null);

  // localStorage sadece istemcide okunur; sunucu render'ıyla eşleşmesi için
  // ilk render'da her zaman varsayılanlar kullanılır, kaydedilmiş tercih varsa
  // mount sonrası (hydration bitince) uygulanır.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(visibleColsKey);
      if (saved) {
        // ÜZERİNE YAZMAK yerine BİRLEŞTİRME: kayıtlı değer, bu sütun listesine
        // yeni bir (hideable) sütun eklenmeden ÖNCE kaydedilmiş olabilir — o
        // anahtar kayıtlı objede hiç yoktur, doğrudan atama yapılsaydı
        // visibleCols[key] undefined (falsy) kalıp yeni sütun varsayılan
        // açık olması gerekirken sessizce gizli başlardı. hideable:false
        // sütunlar da kayıtlı değerde ne yazarsa yazsın koşulsuz true'ya
        // zorlanır — menüde zaten checkbox'ları yok, gizlenmeleri hiç istenmez.
        const parsed = JSON.parse(saved);
        setVisibleColsState((prev) => {
          const merged = { ...prev, ...parsed };
          for (const c of columns) {
            if (c.hideable === false) merged[c.key] = true;
          }
          return merged;
        });
      }
    } catch { }
    if (colOrderKey) {
      try {
        const savedOrder = localStorage.getItem(colOrderKey);
        if (savedOrder) {
          const parsed: unknown = JSON.parse(savedOrder);
          if (Array.isArray(parsed)) {
            const allKeys = columns.map((c) => c.key);
            // Set ile tekilleştirme: bozuk/eski bir localStorage içeriğinde
            // aynı anahtar birden fazla kez geçerse, aynı sütun tabloda iki
            // kez render edilip React "duplicate key" uyarısı verirdi.
            const kept = Array.from(new Set(parsed.filter((k): k is string => typeof k === "string" && allKeys.includes(k))));
            const missing = allKeys.filter((k) => !kept.includes(k));
            setColOrder([...kept, ...missing]);
          }
        }
      } catch { }
    }
    // columns her render'da yeniden oluşturulan bir dizi olabilir (sayfalarda
    // genelde öyle) — bağımlılık olarak eklenirse bu "yalnızca mount'ta
    // çalışsın" efekti her render'da tekrar tetiklenirdi. Sadece anahtar
    // KÜMESİ önemli, o da uygulama boyunca sabit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columnsByKey = useMemo(() => Object.fromEntries(columns.map((c) => [c.key, c])), [columns]);

  const orderedColumns = colOrderKey
    ? colOrder.map((k) => columnsByKey[k]).filter((c): c is C => c != null)
    : columns;

  const menuColumns = colOrderKey
    ? (previewColOrder ?? colOrder).map((k) => columnsByKey[k]).filter((c): c is C => c != null)
    : columns;

  const visibleOrderedColumns = orderedColumns.filter((c) => visibleCols[c.key]);

  function toggleVisible(key: string, checked: boolean) {
    setVisibleColsState((prev) => {
      const next = { ...prev, [key]: checked };
      try { localStorage.setItem(visibleColsKey, JSON.stringify(next)); } catch { }
      return next;
    });
  }

  function handleColDragOver(targetKey: string) {
    if (!colOrderKey || !dragColKey || dragColKey === targetKey) return;
    setPreviewColOrder((prev) => {
      const base = prev ?? colOrder;
      const from = base.indexOf(dragColKey);
      const to = base.indexOf(targetKey);
      if (from === -1 || to === -1 || from === to) return base;
      const next = base.filter((k) => k !== dragColKey);
      next.splice(next.indexOf(targetKey), 0, dragColKey);
      return next;
    });
  }

  function commitColDrag() {
    if (previewColOrder && colOrderKey) {
      setColOrder(previewColOrder);
      try { localStorage.setItem(colOrderKey, JSON.stringify(previewColOrder)); } catch { }
    }
    setPreviewColOrder(null);
    setDragColKey(null);
  }

  function cancelColDrag() {
    setPreviewColOrder(null);
    setDragColKey(null);
  }

  return {
    visibleCols,
    toggleVisible,
    showColPicker,
    setShowColPicker,
    orderedColumns,
    menuColumns,
    visibleOrderedColumns,
    reorderable: colOrderKey != null,
    dragColKey,
    setDragColKey,
    handleColDragOver,
    commitColDrag,
    cancelColDrag,
  };
}
