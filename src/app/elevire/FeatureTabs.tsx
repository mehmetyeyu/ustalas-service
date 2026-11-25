"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export interface FeatureTab {
  id: string;
  label: string;
  panel: ReactNode;
}

// Özellik sekmeleri. Bütün paneller sunucuda üretilip HTML'de bulunur (SEO);
// burada yalnızca hangisinin görüneceği seçilir.
export default function FeatureTabs({ tabs }: { tabs: FeatureTab[] }) {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: KeyboardEvent) {
    const last = tabs.length - 1;
    const next =
      e.key === "ArrowRight" ? (active === last ? 0 : active + 1)
      : e.key === "ArrowLeft" ? (active === 0 ? last : active - 1)
      : e.key === "Home" ? 0
      : e.key === "End" ? last
      : null;
    if (next == null) return;
    e.preventDefault();
    setActive(next);
    refs.current[next]?.focus();
  }

  return (
    <div className="showcase">
      <div className="tabs" role="tablist" aria-label="Özellikler" onKeyDown={onKeyDown}>
        {tabs.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="tab"
            id={`sekme-${t.id}`}
            aria-selected={i === active}
            aria-controls={`panel-${t.id}`}
            tabIndex={i === active ? 0 : -1}
            className="tab"
            onClick={() => setActive(i)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t, i) => (
        <div key={t.id} role="tabpanel" id={`panel-${t.id}`} aria-labelledby={`sekme-${t.id}`} hidden={i !== active} className="show-panel card-surface">
          {t.panel}
        </div>
      ))}
    </div>
  );
}
