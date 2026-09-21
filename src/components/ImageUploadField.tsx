"use client";

import { useState } from "react";
import { useToast } from "@/components/ToastProvider";

// Firma Logosu / Panel Logosu / Firma Kaşesi için ortak yükleme alanı —
// bkz. /api/company-info/assets. Üçü de aynı akışı (önizleme + yükle/
// değiştir + kaldır) kullandığından tek bileşende toplandı.
export default function ImageUploadField({
  label,
  type,
  value,
  onChange,
  hint,
}: {
  label: string;
  type: "logo" | "panel_logo" | "stamp";
  value: string | null;
  onChange: (url: string | null) => void;
  hint?: string;
}) {
  const toast = useToast();
  const [uploading, setUploading] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("type", type);
      formData.append("file", file);
      const res = await fetch("/api/company-info/assets", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Yükleme başarısız.");
      onChange(data.url);
      toast.success(`${label} yüklendi.`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Hata oluştu.");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    setUploading(true);
    try {
      const res = await fetch(`/api/company-info/assets?type=${type}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Silinemedi.");
      onChange(null);
      toast.success(`${label} kaldırıldı.`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Hata oluştu.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <div className="flex items-center gap-3">
        <div className="w-20 h-20 border border-gray-200 rounded-lg flex items-center justify-center bg-gray-50 overflow-hidden shrink-0">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element -- Blob URL'i harici host, next/image domain izni ister
            <img src={value} alt={label} className="max-w-full max-h-full object-contain" />
          ) : (
            <span className="text-[10px] text-gray-400 text-center px-1">Yok</span>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="inline-block text-xs font-medium text-blue-600 hover:text-blue-800 cursor-pointer">
            {uploading ? "İşleniyor..." : value ? "Değiştir" : "Yükle"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              disabled={uploading}
              onChange={handleFileChange}
            />
          </label>
          {value && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={uploading}
              className="text-xs font-medium text-red-500 hover:text-red-700 text-left disabled:opacity-40"
            >
              Kaldır
            </button>
          )}
        </div>
      </div>
      {hint && <p className="text-[11px] text-gray-400 mt-1.5">{hint}</p>}
    </div>
  );
}
