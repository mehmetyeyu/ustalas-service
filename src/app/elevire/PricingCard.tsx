"use client";

import { useState, type ReactNode } from "react";

interface Props {
  monthly: string;
  yearly: string;
  yearlyPerMonth: string;
  discountPct: number;
  cta: ReactNode;
  payment: ReactNode;
  features: ReactNode;
}

// Aylık/Yıllık seçimi. Fiyatlar biçimlenmiş metin olarak gelir
// (platform_pricing → page.tsx).
export default function PricingCard({ monthly, yearly, yearlyPerMonth, discountPct, cta, payment, features }: Props) {
  const [plan, setPlan] = useState<"aylik" | "yillik">("yillik");
  const isYearly = plan === "yillik";

  return (
    <>
      <div className="billing" role="group" aria-label="Ödeme dönemi">
        <button type="button" className="tab" aria-pressed={!isYearly} onClick={() => setPlan("aylik")}>Aylık</button>
        <button type="button" className="tab" aria-pressed={isYearly} onClick={() => setPlan("yillik")}>
          Yıllık
          {discountPct > 0 && <span className="save">−%{discountPct}</span>}
        </button>
      </div>
      <div className="price-card card-surface">
        <div className="price-main">
          <p className="mono faint">ELEVIRE · TEK PAKET</p>
          <p className="price" aria-live="polite">
            <strong>₺{isYearly ? yearlyPerMonth : monthly}</strong> <span>/ ay</span>
          </p>
          <p className="price-note">
            {isYearly ? <>Yıllık {yearly} TL<span className="only-wide"> faturalanır</span> · aylıkta ₺{monthly}</> : <>Her ay faturalanır · yıllıkta ₺{yearlyPerMonth}</>}
          </p>
          {cta}
          {payment}
        </div>
        <div className="price-side">{features}</div>
      </div>
    </>
  );
}
