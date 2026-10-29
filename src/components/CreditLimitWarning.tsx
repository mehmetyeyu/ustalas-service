"use client";

import { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/format";

interface CreditCheck {
  has_limit: boolean;
  exceeds: boolean;
  limit?: number;
  balance?: number;
  after?: number;
}

// Cari limiti uyarısı (GET /api/customers/credit). Yalnızca uyarır, kaydı
// engellemez (kullanıcı kararı). amount: bu işlemle cariye eklenecek tutar;
// excludeOrderId: düzenlenen/kapatılan siparişin mevcut cari borcu bakiyeden
// düşülsün diye. Tutarlar yalnızca customers.view izniyle gelir.
export function CreditLimitWarning({
  customerName,
  amount,
  excludeOrderId,
  prefix,
  className,
  enabled = true,
}: {
  // false: müşterinin limiti olmadığı biliniyor (GET /api/customers
  // has_credit_limit) — istek atılmaz.
  enabled?: boolean;
  customerName: string;
  amount: number;
  excludeOrderId?: number | string;
  prefix: string;
  className?: string;
}) {
  const [check, setCheck] = useState<CreditCheck | null>(null);
  const name = customerName.trim();
  const roundedAmount = Math.max(0, Math.round((amount || 0) * 100) / 100);

  useEffect(() => {
    if (!name || !enabled) { setCheck(null); return; }
    let cancelled = false;
    const t = setTimeout(() => {
      const params = new URLSearchParams({ customer: name, amount: String(roundedAmount) });
      if (excludeOrderId != null) params.set("exclude_order", String(excludeOrderId));
      fetch(`/api/customers/credit?${params}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((data: CreditCheck | null) => { if (!cancelled) setCheck(data); })
        .catch(() => { if (!cancelled) setCheck(null); });
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [name, roundedAmount, excludeOrderId, enabled]);

  if (!check?.exceeds) return null;
  return (
    <p role="alert" className={className ?? "mt-2 text-sm text-v2-warning-fg"}>
      {prefix} <b>{name}</b> cari limitini aşıyor
      {check.limit != null && check.after != null
        ? ` (limit ${formatCurrency(check.limit)}, işlemden sonra bakiye ${formatCurrency(check.after)}).`
        : "."}{" "}
      Kayıt engellenmez; devam etmeden önce kontrol edin.
    </p>
  );
}
