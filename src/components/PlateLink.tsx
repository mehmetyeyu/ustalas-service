"use client";

import Link from "next/link";
import { isValidTrPlate, normalizePlate } from "@/lib/plate";

// Listelerdeki plaka: Türk plaka biçimine uyuyorsa araç kartına
// (/admin/vehicles/[plate]) bağlantı, uymuyorsa (uydurma/eski kayıt) düz
// metin. canLink=false → izni olmayan kullanıcı (araç kartı orders.view ister).
export default function PlateLink({ plate, canLink = true, className }: { plate: string; canLink?: boolean; className?: string }) {
  const normalized = normalizePlate(plate);
  if (!canLink || !isValidTrPlate(normalized)) return <span className={className}>{plate}</span>;
  return (
    <Link
      prefetch={false}
      href={`/admin/vehicles/${normalized}`}
      onClick={(e) => e.stopPropagation()}
      title="Araç kartını aç"
      className={`${className ?? ""} hover:underline underline-offset-2`}
    >
      {plate}
    </Link>
  );
}
