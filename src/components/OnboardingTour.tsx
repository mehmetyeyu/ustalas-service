"use client";

import { useEffect, useState } from "react";
import { ONBOARDING_TOUR_STEPS } from "@/lib/onboardingTour";

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const MOBILE_QUERY = "(max-width: 639px)";
const CARD_WIDTH = 320;
const VIEWPORT_MARGIN = 16;

function useMediaQueryMatch(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);
  return matches;
}

function measureTarget(target: string): TargetRect | null {
  const el = document.querySelector(`[data-tour-target="${target}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

// Kart, spotlight'ın altına (yer yoksa üstüne) yerleştirilir; yatayda
// ekran dışına taşmaması için sağa/sola sıkıştırılır (ör. "ayarlar" adımı
// nav'ın en sağında, kart sağa dayanmalı).
function cardPosition(rect: TargetRect): { top?: number; bottom?: number; left: number } {
  const left = Math.min(
    Math.max(rect.left, VIEWPORT_MARGIN),
    window.innerWidth - CARD_WIDTH - VIEWPORT_MARGIN
  );
  const spaceBelow = window.innerHeight - (rect.top + rect.height);
  if (spaceBelow < 220) {
    return { bottom: window.innerHeight - rect.top + 12, left };
  }
  return { top: rect.top + rect.height + 12, left };
}

export default function OnboardingTour({ onDismiss }: { onDismiss: () => void }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<TargetRect | null>(null);
  const isMobile = useMediaQueryMatch(MOBILE_QUERY);

  const step = ONBOARDING_TOUR_STEPS[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === ONBOARDING_TOUR_STEPS.length - 1;

  // Mobilde nav hamburger menüsünün arkasına gizlendiğinden gerçek bir öğe
  // spotlight'lanamaz (bkz. görev notu) — orada spotlightsiz, ortalanmış
  // bir kart yeterli, bu yüzden hedef hiç ölçülmez.
  useEffect(() => {
    if (isMobile) {
      setRect(null);
      return;
    }
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });

    function measure() {
      setRect(measureTarget(step.target));
    }
    // scrollTo/layout'un oturması için bir sonraki frame'de ölç.
    const raf = requestAnimationFrame(() => requestAnimationFrame(measure));
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
    };
  }, [stepIndex, isMobile, step.target]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onDismiss();
      else if (e.key === "ArrowRight" || e.key === "Enter") advance();
      else if (e.key === "ArrowLeft") back();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

  function advance() {
    if (isLast) onDismiss();
    else setStepIndex((i) => i + 1);
  }
  function back() {
    if (!isFirst) setStepIndex((i) => i - 1);
  }

  const counter = `${stepIndex + 1} / ${ONBOARDING_TOUR_STEPS.length}`;

  const cardBody = (
    <>
      <div className="flex items-start justify-between gap-3 mb-2">
        <span className="text-xs font-semibold text-blue-600">{counter}</span>
        <button onClick={onDismiss} className="text-xs text-gray-400 hover:text-gray-600 font-medium">
          Atla
        </button>
      </div>
      <h3 className="text-base font-bold text-gray-800 mb-1.5">{step.title}</h3>
      <p className="text-sm text-gray-600 leading-relaxed mb-4">{step.body}</p>
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={back}
          disabled={isFirst}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-0 disabled:pointer-events-none"
        >
          Geri
        </button>
        <button
          onClick={advance}
          className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold"
        >
          {isLast ? "Bitir" : "İleri"}
        </button>
      </div>
    </>
  );

  if (isMobile) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
        <div className="bg-white rounded-2xl shadow-xl p-5 w-full max-w-sm">{cardBody}</div>
      </div>
    );
  }

  return (
    <>
      {rect && (
        <div
          aria-hidden
          className="fixed z-[100] rounded-lg motion-safe:transition-all motion-safe:duration-300 pointer-events-auto"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            boxShadow: "0 0 0 9999px rgba(15,23,42,0.6), 0 0 0 3px #2563eb",
          }}
        />
      )}
      {!rect && <div className="fixed inset-0 bg-black/50 z-[100]" />}
      {rect && (
        <div
          className="fixed z-[101] bg-white rounded-xl shadow-xl p-5 motion-safe:transition-all motion-safe:duration-300"
          style={{ width: CARD_WIDTH, ...cardPosition(rect) }}
        >
          {cardBody}
        </div>
      )}
      {!rect && (
        <div className="fixed inset-0 z-[101] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl p-5 w-full max-w-sm">{cardBody}</div>
        </div>
      )}
    </>
  );
}
