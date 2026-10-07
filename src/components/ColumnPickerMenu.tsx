"use client";

import type { ColumnPrefsColumn } from "@/hooks/useColumnPrefs";

// Products/Customers/Orders/Storage'daki "Sütunlar" dropdown'ının ortak
// görünümü — useColumnPrefs'in döndürdüğü state/handler'ları doğrudan alır.
// reorderable=false iken (Storage) sürükleme tutamacı hiç basılmaz, sade bir
// checkbox listesi olarak kalır.
interface ColumnPickerMenuProps<C extends ColumnPrefsColumn> {
  columns: C[];
  visibleCols: Record<string, boolean>;
  onToggle: (key: string, checked: boolean) => void;
  reorderable: boolean;
  dragColKey: string | null;
  onDragStart: (key: string) => void;
  onDragOver: (key: string) => void;
  onDrop: () => void;
  onDragEnd: () => void;
  // Konumlandırma + genişlik sayfadan sayfaya farklı (bazılarında responsive
  // left/right flip var) — tek bir align enum'u yeterli olmadığı için tüm
  // positioning+width class'ları doğrudan buradan verilir.
  positionClassName?: string;
}

export function ColumnPickerMenu<C extends ColumnPrefsColumn>({
  columns, visibleCols, onToggle, reorderable,
  dragColKey, onDragStart, onDragOver, onDrop, onDragEnd,
  positionClassName = "right-0 w-56",
}: ColumnPickerMenuProps<C>) {
  return (
    <div
      className={`absolute top-10 z-30 bg-white border border-gray-200 rounded-xl shadow-lg p-3 ${positionClassName}`}
      onClick={(e) => e.stopPropagation()}
    >
      {reorderable && <p className="text-xs text-gray-400 px-2 mb-1">Sütunlar — sürükleyerek sırala</p>}
      {columns.map((col) => (
        <div
          key={col.key}
          draggable={reorderable}
          onDragStart={reorderable ? () => onDragStart(col.key) : undefined}
          onDragOver={reorderable ? (e) => { e.preventDefault(); onDragOver(col.key); } : undefined}
          onDrop={reorderable ? onDrop : undefined}
          onDragEnd={reorderable ? onDragEnd : undefined}
          className={`group flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-gray-50 ${reorderable ? "cursor-grab active:cursor-grabbing" : ""} ${dragColKey === col.key ? "opacity-40" : ""}`}
        >
          {reorderable && (
            <svg className="w-3.5 h-3.5 text-gray-400 group-hover:text-gray-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path d="M7 4a1 1 0 11-2 0 1 1 0 012 0zM7 10a1 1 0 11-2 0 1 1 0 012 0zM7 16a1 1 0 11-2 0 1 1 0 012 0zM15 4a1 1 0 11-2 0 1 1 0 012 0zM15 10a1 1 0 11-2 0 1 1 0 012 0zM15 16a1 1 0 11-2 0 1 1 0 012 0z" />
            </svg>
          )}
          {col.hideable === false ? (
            // Ana kimlik sütunları (ör. Ürün Kodu/Marka) — kasıtlı olarak
            // gizlenemez, sadece sürükleyerek yeri değiştirilebilir.
            <span className="flex-1 flex items-center gap-1.5 text-sm text-gray-700 select-none">
              {col.label}
            </span>
          ) : (
            <label className="flex items-center gap-2 flex-1 cursor-pointer text-sm text-gray-700 select-none">
              <input
                type="checkbox"
                checked={visibleCols[col.key]}
                onChange={(e) => onToggle(col.key, e.target.checked)}
                className="accent-blue-600"
              />
              {col.label}
            </label>
          )}
        </div>
      ))}
    </div>
  );
}
